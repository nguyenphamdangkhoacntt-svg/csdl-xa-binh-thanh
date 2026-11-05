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
  const q = $("search").value.trim().toLowerCase();
  const cat = $("category").value;
  const unit = $("unit").value;
  const lev = $("level").value;
  const dataStatus = $("dataStatusFilter").value;

  filtered = items.filter(isIndicator).filter((i) => {
    const hasData =
      typeof i.quantity === "number" &&
      Number.isFinite(i.quantity) &&
      i.quantity > 0;

    // Lọc mã hoặc tên chỉ tiêu
    if (q && !(i.code + " " + i.name + " " + i.unit).toLowerCase().includes(q))
      return false;

    // Lọc phân loại
    if (cat && (cat === "__none" ? Boolean(i.category) : i.category !== cat))
      return false;

    // Lọc đơn vị phụ trách
    if (unit && i.unit !== unit) return false;

    // Giữ nguyên cách lọc cấp chỉ tiêu hiện tại
    if (
      lev !== "all" &&
      !(lev === "leaf" ? leaf(i) : typeof i.quantity === "number")
    )
      return false;

    // Lọc tình trạng phát sinh dữ liệu
    if (dataStatus === "missing" && hasData) {
      return false;
    }

    if (dataStatus === "available" && !hasData) {
      return false;
    }

    return true;
  });

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
  const TONG_BAT_BUOC = 104;
  const TONG_KHUYEN_KHICH = 94;

  // Chỉ đổi thành true sau khi đã xác minh đủ
  // bảng ánh xạ mã Excel với 101 và 94 chỉ tiêu của tỉnh.
  const DA_XAC_MINH_DANH_MUC = true;

  // Chỉ tính mục dữ liệu, không tính tiêu đề nhóm.
  const chiTieu = items.filter(isIndicator);

  // Số lượng bằng 0 hoặc trống = chưa phát sinh.
  const coDuLieu = (i) => typeof i.quantity === "number" && i.quantity > 0;

  const batBuoc = chiTieu.filter(
    (i) => i.category === "Bắt buộc" && coDuLieu(i),
  ).length;

  const khuyenKhich = chiTieu.filter(
    (i) => i.category === "Khuyến khích" && coDuLieu(i),
  ).length;

  const tyLe = (batBuoc / TONG_BAT_BUOC) * 100;

  const xepLoai =
    tyLe >= 70 ? "Tốt" : tyLe >= 55 ? "Khá" : tyLe >= 35 ? "Trung bình" : "Yếu";

  // Lấy ngày cập nhật gần nhất theo thời gian thực tế,
  // không lấy theo thứ tự dòng Excel.
  const ngayMoiNhat = chiTieu
    .filter((i) => i.updated)
    .map((i) => {
      const m = String(i.updated).match(
        /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/,
      );

      if (!m) return null;

      const [, dd, mm, yyyy, hh = "00", mi = "00"] = m;

      const time = new Date(+yyyy, +mm - 1, +dd, +hh, +mi).getTime();

      return Number.isNaN(time) ? null : { time, text: i.updated };
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time)[0];

  const ngayCapNhat =
    ngayMoiNhat?.text || DATA.meta.reportDate || "Chưa xác định";

  const ketQuaBatBuoc = DA_XAC_MINH_DANH_MUC
    ? `${batBuoc}/${TONG_BAT_BUOC}`
    : "Chưa xác minh";

  // Danh sách chỉ tiêu chưa phát sinh dữ liệu
  const chuaPhatSinh = (category) =>
    chiTieu
      .filter((i) => i.category === category && !coDuLieu(i))
      .sort((a, b) =>
        a.code.localeCompare(b.code, "vi", {
          numeric: true,
        }),
      );

  const batBuocChuaCo = chuaPhatSinh("Bắt buộc");
  const khuyenKhichChuaCo = chuaPhatSinh("Khuyến khích");

  // Đề xuất đơn vị theo lĩnh vực của Bảng 03
  const DON_VI_DE_XUAT = {
    1: "Văn phòng HĐND và UBND",
    2: "Văn phòng HĐND và UBND",
    3: "Công an xã",
    4: "Ban Chỉ huy Quân sự xã",
    5: "Phòng Kinh tế",
    6: "Phòng Kinh tế",
    7: "Phòng Kinh tế",
    8: "Phòng Kinh tế",
    9: "Phòng Kinh tế",
    10: "Phòng Văn hóa - Xã hội",
    11: "Phòng Văn hóa - Xã hội",
    12: "Phòng Văn hóa - Xã hội",
    13: "Phòng Văn hóa - Xã hội",
    14: "Phòng Văn hóa - Xã hội",
    15: "Phòng Văn hóa - Xã hội",
    16: "Văn phòng HĐND và UBND (cần xác nhận)",
  };

  const layDonViPhuTrach = (i) => {
    // Ưu tiên đơn vị đã phân công hoặc đơn vị dự kiến
    const donVi = [i.owner, i.proposedOwner, i.suggestedOwner].find(
      (v) =>
        typeof v === "string" &&
        v.trim() &&
        !/^(chưa phân công|chưa xác định|chưa xác minh.*)$/i.test(v.trim()),
    );

    if (donVi) return donVi.trim();

    // Đề xuất theo lĩnh vực nếu chưa có đơn vị
    const maLinhVuc = String(i.code ?? "")
      .trim()
      .split(".")[0];

    const donViDeXuat = DON_VI_DE_XUAT[maLinhVuc];

    return donViDeXuat
      ? `Đề xuất: ${donViDeXuat}`
      : "Chưa xác định đơn vị phụ trách";
  };

  const hienThiDanhSach = (ds) =>
    ds.length
      ? ds
          .map(
            (i, index) =>
              `${index + 1}. ${i.code} - ${i.name} (${layDonViPhuTrach(i)})`,
          )
          .join("\n")
      : "Không có chỉ tiêu chưa phát sinh.";

  const danhSachChuaCo = DA_XAC_MINH_DANH_MUC
    ? `6. CHỈ TIÊU BẮT BUỘC CHƯA PHÁT SINH (${batBuocChuaCo.length})
${hienThiDanhSach(batBuocChuaCo)}

7. CHỈ TIÊU KHUYẾN KHÍCH CHƯA PHÁT SINH (${khuyenKhichChuaCo.length})
${hienThiDanhSach(khuyenKhichChuaCo)}`
    : `6. DANH SÁCH CHỈ TIÊU CHƯA PHÁT SINH
Chưa thể xác nhận danh sách chính thức do mã và phân loại giữa Bảng 03 với Excel thống kê chưa được đối chiếu đầy đủ.`;

  const ketQuaTyLe = DA_XAC_MINH_DANH_MUC
    ? `${tyLe.toFixed(1).replace(".", ",")}%`
    : "Chưa xác minh";

  const ketQuaKhuyenKhich = DA_XAC_MINH_DANH_MUC
    ? `${khuyenKhich}/${TONG_KHUYEN_KHICH}`
    : "Chưa xác minh";

  const ketQuaXepLoai = DA_XAC_MINH_DANH_MUC
    ? xepLoai
    : "Chưa đủ căn cứ xếp loại";

  return `BÁO CÁO
TÌNH HÌNH CẬP NHẬT DỮ LIỆU TRÊN NỀN TẢNG CSDL QUẢN LÝ NHÀ NƯỚC CẤP XÃ

Đơn vị: UBND xã Bình Thành
Thời điểm cập nhật: ${ngayCapNhat}

I. KẾT QUẢ CẬP NHẬT

1. Chỉ tiêu bắt buộc phát sinh dữ liệu: ${ketQuaBatBuoc}.
2. Tỷ lệ chỉ tiêu bắt buộc phát sinh dữ liệu: ${ketQuaTyLe}.
3. Chỉ tiêu khuyến khích phát sinh dữ liệu: ${ketQuaKhuyenKhich}.
4. Mức xếp loại tham khảo: ${ketQuaXepLoai}.

II. CÁC CHỈ TIÊU CHƯA PHÁT SINH DỮ LIỆU

1. Chỉ tiêu bắt buộc: ${
    DA_XAC_MINH_DANH_MUC ? batBuocChuaCo.length + " chỉ tiêu" : "Chưa xác minh"
  }

${
  DA_XAC_MINH_DANH_MUC
    ? hienThiDanhSach(batBuocChuaCo)
    : "Chưa xác minh danh mục."
}

2. Chỉ tiêu khuyến khích: ${
    DA_XAC_MINH_DANH_MUC
      ? khuyenKhichChuaCo.length + " chỉ tiêu"
      : "Chưa xác minh"
  }

${
  DA_XAC_MINH_DANH_MUC
    ? hienThiDanhSach(khuyenKhichChuaCo)
    : "Chưa xác minh danh mục."
}

III. NHẬN XÉT, ĐÁNH GIÁ

Căn cứ tỷ lệ chỉ tiêu bắt buộc phát sinh dữ liệu, xã Bình Thành đạt mức xếp loại tham khảo: ${ketQuaXepLoai}.`;
}


["search", "category", "unit", "level", "dataStatusFilter"].forEach((id) =>
  $(id).addEventListener(
    id === "search" ? "input" : "change",
    filter
  )
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
