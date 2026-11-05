"use strict";
const $ = (id) => document.getElementById(id);
let DATA = { meta: {}, items: [] },
  items = [],
  filtered = [],
  page = 0;
const perPage = 35;
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (x) => (typeof x === "number" ? x.toLocaleString("vi-VN") : "—");
// Các mã tiêu đề không phải chỉ tiêu dữ liệu
const GROUP_ONLY = new Set([
  "5.8",
  "7.7",
  "8",
  "10.1",
  "11.3",
  "13.9.1",
  "13.9.2",
]);

const leaf = (i) => !items.some((x) => x.code.startsWith(i.code + "."));

const isIndicator = (i) => leaf(i) && !GROUP_ONLY.has(i.code);
const cclass = (c) =>
  c === "Bắt buộc"
    ? "b"
    : c === "Khuyến khích"
      ? "k"
      : c === "Xã khai thác"
        ? "x"
        : "t";
let toastTimer;
function notify(s) {
  $("toast").textContent = s;
  $("toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").style.display = "none"), 4200);
}
async function api(url, opts) {
  let res = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...opts,
  });
  let d = await res.json();
  if (!res.ok) throw Error(d.error || "Lỗi " + res.status);
  return d;
}
async function load(silent = false) {
  let d = await api("/api/data");
  let changed =
    JSON.stringify(DATA.meta) !== JSON.stringify(d.meta) ||
    JSON.stringify(DATA.items) !== JSON.stringify(d.items);
  DATA = d;
  items = d.items;
  if (changed || !silent) render();
}
function render() {
  let leafs = items.filter(isIndicator),
    units = [...new Set(items.map((i) => i.unit).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "vi"),
    );
  $("sourceInfo").textContent =
    "Ngày báo cáo: " + (DATA.meta.reportDate || "Chưa xác định");
  $("total").textContent = num(items.length);
  $("required").textContent = "—";
  $("required").title = "Chưa xác minh xong ánh xạ với Bảng 03 của tỉnh";

  const validData = items.filter(
    (i) =>
      typeof i.quantity === "number" &&
      i.quantity > 0 &&
      /^\d{2}\/\d{2}\/\d{4}/.test(i.updated || ""),
  );

  const getYear = (i) => Number(i.updated.slice(6, 10));

  $("oldDataCount").textContent = num(
    validData.filter((i) => getYear(i) <= 2024).length,
  );

  $("newDataCount").textContent = num(
    validData.filter((i) => getYear(i) >= 2025).length,
  );

  let prev = $("unit").value;
  $("unit").innerHTML =
    '<option value="">Tất cả đơn vị</option>' +
    units.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  $("unit").value = units.includes(prev) ? prev : "";
  let counts = Object.entries(
    leafs.reduce((o, i) => ((o[i.unit] = (o[i.unit] || 0) + 1), o), {}),
  ).sort((a, b) => b[1] - a[1]);
  $("unitsSummary").innerHTML = counts
    .map(
      ([u, n]) =>
        `<div class="unitrow"><span>${esc(u)}</span><b>${num(n)}</b></div><div class="bar"><div class="fill" style="width:${leafs.length ? (n / leafs.length) * 100 : 0}%"></div></div>`,
    )
    .join("");
  filter();
}
function filter() {
  let q = $("search").value.trim().toLowerCase(),
    cat = $("category").value,
    unit = $("unit").value,
    lev = $("level").value;
  filtered = items
    .filter(isIndicator)
    .filter(
      (i) =>
        (!q ||
          (i.code + " " + i.name + " " + i.unit).toLowerCase().includes(q)) &&
        (!cat || (cat === "__none" ? !i.category : i.category === cat)) &&
        (!unit || i.unit === unit) &&
        (lev === "all" ||
          (lev === "leaf" ? leaf(i) : typeof i.quantity === "number")),
    );
  page = 0;
  renderTable();
}
function renderTable() {
  let start = page * perPage,
    seg = filtered.slice(start, start + perPage);
  $("resultCount").textContent = num(filtered.length) + " dòng phù hợp";
  $("tbody").innerHTML =
    seg
      .map(
        (i) =>
          `<tr><td class="code">${esc(i.code)}</td><td class="name">${esc(i.name)}</td><td>${i.category ? `<span class="pill ${cclass(i.category)}">${esc(i.category)}</span>` : '<span class="dim">Chưa đối chiếu</span>'}</td><td class="owner">${esc(i.unit || "Chưa xác định")}<em>${esc(i.unitStatus || "")}</em></td><td class="num">${num(i.quantity)}</td><td style="white-space:nowrap">${esc(i.updated || "—")}</td><td><button class="btn small" data-code="${esc(i.code)}">Xem</button></td></tr>`,
      )
      .join("") || '<tr><td colspan="7">Không có dữ liệu phù hợp.</td></tr>';
  $("pageLabel").textContent =
    `Hiển thị ${filtered.length ? start + 1 : 0}–${Math.min(start + perPage, filtered.length)} / ${filtered.length}`;
  $("prev").disabled = page === 0;
  $("next").disabled = start + perPage >= filtered.length;
}
function detail(code) {
  let i = items.find((x) => x.code === code);
  if (!i) return;
  $("detailName").textContent = i.code + " · " + i.name;
  $("detailContent").innerHTML =
    `<p><b>Phân loại:</b> ${esc(i.category || "Chưa phân loại")}</p><p><b>Đơn vị phụ trách:</b> ${esc(i.unit || "Chưa xác định")}</p><p><b>Trạng thái phân công:</b> ${esc(i.unitStatus || "")}</p><p><b>Số lượng xã Bình Thành:</b> ${num(i.quantity)}</p><p><b>Ngày cập nhật:</b> ${esc(i.updated || "Không có")}</p>${i.note ? "<p><b>Ghi chú:</b> " + esc(i.note) + "</p>" : ""}`;
  $("detailModal").classList.add("show");
}
async function showAdmin() {
  let s = await api("/api/session");
  $("loginBox").classList.toggle("hidden", s.admin);
  $("adminBox").classList.toggle("hidden", !s.admin);
  $("adminModal").classList.add("show");
}
async function login() {
  try {
    await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("password").value }),
    });
    $("password").value = "";
    await showAdmin();
    notify("Đã đăng nhập quản trị");
  } catch (e) {
    alert(e.message);
  }
}
async function upload(file, url) {
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) throw Error("Giới hạn file 6 MB");
  let result = await api(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Filename": encodeURIComponent(file.name),
    },
    body: await file.arrayBuffer(),
  });
  await load();
  return result;
}
function download(name, content, type = "text/csv;charset=utf-8") {
  let b = new Blob([content], { type }),
    a = document.createElement("a"),
    u = URL.createObjectURL(b);
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function report() {
  let mand = null;
  return `BÁO CÁO CSDL XÃ BÌNH THÀNH\nNgày báo cáo: ${DATA.meta.reportDate || "—"}\nTổng mã dữ liệu: ${items.length}; dòng có nhãn bắt buộc theo danh mục đối chiếu: chưa xác minh; dòng có số lượng: ${items.filter((i) => typeof i.quantity === "number" && i.quantity > 0).length}; dòng có ngày cập nhật: ${items.filter((i) => !!i.updated).length}.\nSố liệu gốc, chưa kết luận tỷ lệ hoàn thành. Đơn vị chủ trì theo trạng thái thể hiện trên hệ thống.`;
}
["search", "category", "unit", "level"].forEach((id) =>
  $(id).addEventListener(id === "search" ? "input" : "change", filter),
);
$("tbody").addEventListener("click", (e) => {
  let b = e.target.closest("button[data-code]");
  if (b) detail(b.dataset.code);
});
$("prev").onclick = () => {
  page--;
  renderTable();
};
$("next").onclick = () => {
  page++;
  renderTable();
};
$("adminBtn").onclick = () => showAdmin().catch((e) => alert(e.message));
$("closeModal").onclick = $("closeAdmin").onclick = () =>
  $("adminModal").classList.remove("show");
$("closeDetail").onclick = () => $("detailModal").classList.remove("show");
$("loginBtn").onclick = login;
$("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
$("logoutBtn").onclick = async () => {
  await api("/api/logout", { method: "POST" });
  await showAdmin();
};
$("excelFile").onchange = async (e) => {
  try {
    let d = await upload(e.target.files[0], "/api/import/stats");
    if (!d) return;
    let msg =
      `Đã cập nhật ${d.matched} mã. Ngày báo cáo: ${d.reportDate}.` +
      (d.unknown.length ? ` Mã chưa khớp: ${d.unknown.join(", ")}` : "");
    $("importMessage").textContent = msg;
    notify(msg);
  } catch (ex) {
    alert("Import Excel thất bại: " + ex.message);
  }
  e.target.value = "";
};
$("ownerFile").onchange = async (e) => {
  try {
    let d = await upload(e.target.files[0], "/api/import/owners");
    if (!d) return;
    let msg = `Đã áp dụng ${d.mappings} dòng phân công lên ${d.affected} mã dữ liệu.`;
    $("importMessage").textContent = msg;
    notify(msg);
  } catch (ex) {
    alert("Import phân công thất bại: " + ex.message);
  }
  e.target.value = "";
};
$("mappingTemplate").onclick = () =>
  download(
    "mau_phan_cong_csdl.csv",
    "\ufeffMã chỉ tiêu,Đơn vị chủ trì,Ghi chú\n1,Văn phòng HĐND và UBND,Ví dụ - thay bằng phân công chính thức\n12.4,Phòng Văn hóa - Xã hội,Ví dụ mã nhóm",
  );
$("historyBtn").onclick = async () => {
  try {
    let h = await api("/api/history");
    alert(
      "Lịch sử import gần nhất:\n" +
        (h.map((x) => `${x.at} | ${x.filename} | ${x.matched} mã`).join("\n") ||
          "Chưa có lượt import"),
    );
  } catch (e) {
    alert(e.message);
  }
};
$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(report());
    notify("Đã sao chép báo cáo");
  } catch {
    prompt("Sao chép báo cáo", report());
  }
};
$("exportCsvBtn").onclick = () => {
  let rows = [
    [
      "Mã STT",
      "Dữ liệu",
      "Phân loại",
      "Đơn vị chủ trì",
      "Trạng thái",
      "Số lượng xã",
      "Ngày cập nhật",
    ],
    ...filtered.map((i) => [
      i.code,
      i.name,
      i.category,
      i.unit,
      i.unitStatus,
      i.quantity ?? "",
      i.updated,
    ]),
  ];
  download(
    "csdl_binh_thanh_loc.csv",
    "\ufeff" +
      rows
        .map((r) =>
          r
            .map((x) => '"' + String(x ?? "").replaceAll('"', '""') + '"')
            .join(","),
        )
        .join("\r\n"),
  );
};
load().catch((e) => {
  $("sourceInfo").textContent = "Không tải được dữ liệu: " + e.message;
});
setInterval(() => {
  if (!document.hidden) load(true).catch(() => {});
}, 30000);
