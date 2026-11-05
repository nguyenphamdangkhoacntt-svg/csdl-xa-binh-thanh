"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { parseStats, readXlsx } = require("./xlsx-reader");
const PORT = Number(process.env.PORT || 3000),
  HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname,
  DIR = path.join(ROOT, "storage");
fs.mkdirSync(DIR, { recursive: true });
const db = new DatabaseSync(path.join(DIR, "csdl.sqlite"));
db.exec(
  `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS items(code TEXT PRIMARY KEY,name TEXT NOT NULL,quantity REAL,updated TEXT,category TEXT,unit TEXT,unitStatus TEXT,note TEXT,level INTEGER); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS imports(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,filename TEXT NOT NULL,matched INTEGER NOT NULL,unknown TEXT NOT NULL,report_date TEXT NOT NULL);`,
);
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "seed.json"), "utf8"));
if (db.prepare("SELECT count(*) AS c FROM items").get().c === 0) {
  db.exec("BEGIN");
  try {
    let add = db.prepare(
      "INSERT INTO items(code,name,quantity,updated,category,unit,unitStatus,note,level) VALUES(?,?,?,?,?,?,?,?,?)",
    );
    for (let i of seed.items)
      add.run(
        i.code,
        i.name,
        i.quantity,
        i.updated,
        i.category,
        i.unit,
        i.unitStatus,
        i.note,
        i.level,
      );
    for (let [k, v] of Object.entries(seed.meta))
      db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)").run(
        k,
        String(v),
      );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
const sessions = new Map(),
  TOKEN_SECRET = crypto.randomBytes(32).toString("hex");

const ADMIN_PASS = process.env.ADMIN_PASSWORD || "BinhThanh@2026";
const json = (res, status, data) => {
  let b = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": b.length,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(b);
};
const readBody = (req, max = 6 * 1024 * 1024) =>
  new Promise((resolve, reject) => {
    let total = 0,
      chunks = [];
    req.on("data", (b) => {
      total += b.length;
      if (total > max) {
        reject(
          Object.assign(Error("Tệp quá lớn (giới hạn 6 MB)"), { status: 413 }),
        );
        req.destroy();
      } else chunks.push(b);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
const getToken = (req) =>
  (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((x) => x.startsWith("csdl_session="))
    ?.split("=")[1];
const authorized = (req) => {
  let t = getToken(req);
  return !!t && sessions.has(t) && sessions.get(t) > Date.now();
};
const guard = (req, res) => {
  if (!authorized(req)) {
    json(res, 401, { error: "Cần đăng nhập quản trị" });
    return false;
  }
  return true;
};
const meta = () =>
  Object.fromEntries(
    db
      .prepare("SELECT key,value FROM meta")
      .all()
      .map((x) => [x.key, x.value]),
  );
function data() {
  return {
    meta: meta(),
    items: db.prepare("SELECT * FROM items ORDER BY rowid").all(),
  };
}
function setMeta(k, v) {
  db.prepare(
    "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(k, v);
}
const basename = (s) =>
  path
    .basename(String(s || "import.xlsx"))
    .slice(0, 160)
    .replace(/[\x00-\x1f]/g, "");
function importStats(buffer, filename) {
  let result = parseStats(buffer),
    existing = new Set(
      db
        .prepare("SELECT code FROM items")
        .all()
        .map((r) => r.code),
    ),
    unknown = result.items
      .filter((i) => !existing.has(i.code))
      .map((i) => i.code),
    matched = result.items.filter((i) => existing.has(i.code));
  if (matched.length < 100)
    throw Error(
      "Chỉ khớp " + matched.length + " mã, không cập nhật để tránh sai mẫu",
    );
  db.exec("BEGIN IMMEDIATE");
  try {
    let stmt = db.prepare(
      "UPDATE items SET quantity=?, updated=? WHERE code=?",
    );
    for (let i of matched) stmt.run(i.quantity, i.updated, i.code);
    setMeta("source", filename);
    setMeta("reportDate", result.reportDate);
    let at = new Date().toISOString();
    setMeta("lastImportedAt", at);
    db.prepare(
      "INSERT INTO imports(at,filename,matched,unknown,report_date) VALUES(?,?,?,?,?)",
    ).run(at, filename, matched.length, unknown.join(","), result.reportDate);
    db.exec("COMMIT");
    return { matched: matched.length, unknown, reportDate: result.reportDate };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function importOwners(rows, filename) {
  let mappings = [];
  for (let r of rows.slice(1)) {
    let code = String(r[0] ?? "").trim(),
      unit = String(r[1] ?? "").trim(),
      note = String(r[2] ?? "").trim();
    if (/^\d+(\.\d+)*$/.test(code) && unit) mappings.push({ code, unit, note });
  }
  if (!mappings.length)
    throw Error("Không tìm thấy cột mã chỉ tiêu và đơn vị chủ trì");
  let affected = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    let all = db.prepare("SELECT code FROM items").all();
    let stmt = db.prepare(
      "UPDATE items SET unit=?,unitStatus=?,note=CASE WHEN ?<>'' THEN ? ELSE note END WHERE code=?",
    );
    for (let m of mappings) {
      for (let i of all) {
        if (i.code === m.code || i.code.startsWith(m.code + ".")) {
          stmt.run(
            m.unit,
            "Theo bảng phân công do quản trị import - cần đối chiếu phê duyệt",
            m.note,
            m.note,
            i.code,
          );
          affected++;
        }
      }
    }
    if (!affected) throw Error("Không tìm thấy mã phân công khớp với dữ liệu");
    setMeta("ownershipSource", "Bảng phân công import: " + filename);
    db.exec("COMMIT");
    return { affected, mappings: mappings.length };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function parseCsv(s) {
  let lines = [],
    row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c === '"') {
      if (quoted && s[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if ((c === "," || (c === ";" && !s.includes(","))) && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) lines.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some(Boolean)) lines.push(row);
  if (lines[0]?.[0]) lines[0][0] = lines[0][0].replace(/^\ufeff/, "");
  return lines;
}
function serve(req, res) {
  let u = new URL(req.url, "http://localhost"),
    p = u.pathname;
  if (p === "/api/data" && req.method === "GET") return json(res, 200, data());
  if (p === "/api/session" && req.method === "GET")
    return json(res, 200, { admin: authorized(req) });
  if (p === "/api/login" && req.method === "POST")
    return readBody(req, 5000).then((b) => {
      let input = JSON.parse(b.toString());
      let a = Buffer.from(String(input.password || "")),
        bpass = Buffer.from(ADMIN_PASS);
      if (a.length !== bpass.length || !crypto.timingSafeEqual(a, bpass))
        return json(res, 401, { error: "Mật khẩu không đúng" });
      let token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, Date.now() + 8 * 3600e3);
      res.setHeader(
        "Set-Cookie",
        `csdl_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
      );
      json(res, 200, { ok: true });
    });
  if (p === "/api/logout" && req.method === "POST") {
    sessions.delete(getToken(req));
    res.setHeader(
      "Set-Cookie",
      "csdl_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    return json(res, 200, { ok: true });
  }
  if (p === "/api/import/stats" && req.method === "POST") {
    if (!guard(req, res)) return;
    return readBody(req).then((b) =>
      json(
        res,
        200,
        importStats(
          b,
          basename(
            decodeURIComponent(req.headers["x-filename"] || "import.xlsx"),
          ),
        ),
      ),
    );
  }
  if (p === "/api/import/owners" && req.method === "POST") {
    if (!guard(req, res)) return;
    return readBody(req).then((b) => {
      let filename = basename(
          decodeURIComponent(req.headers["x-filename"] || "phan_cong.csv"),
        ),
        rows = filename.toLowerCase().endsWith(".csv")
          ? parseCsv(b.toString("utf8"))
          : readXlsx(b);
      json(res, 200, importOwners(rows, filename));
    });
  }
  if (p === "/api/history" && req.method === "GET") {
    if (!guard(req, res)) return;
    return json(
      res,
      200,
      db.prepare("SELECT * FROM imports ORDER BY id DESC LIMIT 20").all(),
    );
  }
  if (req.method !== "GET")
    return json(res, 404, { error: "Không tìm thấy chức năng" });
  if (p === "/") p = "/index.html";
  const publicFiles = {
    "/index.html": "text/html; charset=utf-8",
    "/app.js": "application/javascript; charset=utf-8",
  };
  if (!Object.hasOwn(publicFiles, p))
    return json(res, 404, { error: "Không tồn tại" });
  const file = fs.readFileSync(path.join(ROOT, "public", p.slice(1)));
  res.writeHead(200, {
    "Content-Type": publicFiles[p],
    "Cache-Control": "no-store",
    "Content-Length": file.length,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(file);
}
http
  .createServer((req, res) => {
    Promise.resolve()
      .then(() => serve(req, res))
      .catch((e) => {
        if (!res.headersSent)
          json(res, e.status || 400, { error: e.message || "Lỗi xử lý" });
        console.error("Lỗi:", e.message);
      });
  })
  .listen(PORT, HOST, () => {
    console.log(
      `\nCSDL xã Bình Thành: http://${HOST}:${PORT}\nMật khẩu quản trị: ${ADMIN_PASS === "BinhThanh@2026" ? "MẶC ĐỊNH – cần đổi trước khi dùng" : "đã đặt bằng biến môi trường"}\n`,
    );
  });
