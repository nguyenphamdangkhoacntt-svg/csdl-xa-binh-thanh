# CSDL xã Bình Thành — Website Node.js chạy thử (đã sửa lỗi nút bấm)

## Chạy trên máy Windows bằng VS Code

1. Cài Node.js **22.13 trở lên** (hoặc bản Node.js LTS mới hơn).
2. Giải nén ZIP. Mở thư mục `csdl_binh_thanh_node` trong VS Code.
3. Mở Terminal → chạy `npm start` (hoặc nhấp đúp `START_WINDOWS.bat`). **Không cần `npm install`**.
4. Mở **http://127.0.0.1:3000/** trên trình duyệt. **Không dùng Go Live / Live Server** vì phải chạy máy chủ Node.js để import và lưu dữ liệu chung.
5. Nhấn **Quản trị / Import Excel**, đăng nhập bằng mật khẩu thử nghiệm: **BinhThanh@2026**.
6. Chọn file Excel đúng mẫu `CDSXA_TKSoLuongVaThoiGianCapNhat1105.xlsx`. Chỉ cột A–D của xã được cập nhật; phân loại và phân công được giữ nguyên.
7. Lần cập nhật hoàn tất được ghi trong `storage/csdl.sqlite`, và mọi trình duyệt truy cập **cùng máy chủ** sẽ đọc dữ liệu chung; tự tải số liệu mới sau mỗi 30 giây (hoặc F5).

## Thay đổi mật khẩu (quan trọng)

Mật khẩu mặc định **chỉ dùng chạy thử trên máy cá nhân**, không đưa hệ thống lên mạng khi chưa đổi mật khẩu. Trong PowerShell chạy:

```powershell
$env:ADMIN_PASSWORD='MatKhauMoiDuDaiKhongDeDoan'; npm start
```

Trong CMD chạy: `set ADMIN_PASSWORD=MatKhauMoiDuDaiKhongDeDoan && npm start`.

## Lưu ý

- Dữ liệu gốc có sẵn từ ngày 05/11/2026; `seed.json` chỉ nạp **lần khởi chạy đầu tiên**. Để sao lưu, sao chép file `storage/csdl.sqlite` khi đã dừng Node.js. Nếu SQLite đang hoạt động (WAL), cần sao lưu cả các file `-wal`/`-shm` hoặc dừng máy chủ trước.
- Website chạy mặc định trên `127.0.0.1` nên **chỉ mở được trên máy hiện tại**. Muốn người khác truy cập qua mạng LAN, cần chạy với biến `HOST=0.0.0.0`, đổi mật khẩu, cấu hình tường lửa và kiểm soát bảo mật trước. Chưa có HTTPS hay quyền theo tổ chức; **không đưa trực tiếp lên Internet**.
- Danh mục Bảng 03 có 104 dòng gắn nhãn bắt buộc; có chênh lệch với mốc 101 tỉnh công bố cần xác minh. Hệ thống hiển thị số liệu gốc, không tự kết luận hoàn thành.
- Đơn vị chủ trì mặc định là **đề xuất theo chức năng, nhiệm vụ**, không phải phân công chính thức. Import bảng phân công đã kiểm tra để thay thế. Nhập mã nhóm như `12.4` áp dụng cho các mã con; mã cụ thể áp dụng đúng chỉ tiêu.
- File Excel chỉ dùng trang đầu của workbook `.xlsx` theo mẫu đã cung cấp. Tệp `.xls` cũ không được hỗ trợ. Máy chủ kiểm tra mã STT và từ chối tệp sai định dạng. Không có thư viện CDN hay npm bên ngoài.
- Không nhập dữ liệu cá nhân nhạy cảm hoặc công khai dữ liệu chưa được phép chia sẻ.

## Nếu đã cài bản cũ và nút bấm không chạy

Dừng máy chủ bằng Ctrl+C trong Terminal, thay các file mã nguồn bằng bản mới, rồi chạy `npm start` lại. Giữ lại thư mục `storage/` nếu đã import dữ liệu. Trên trình duyệt nhấn Ctrl+F5 để tải lại `app.js`.
