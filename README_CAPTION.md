# VBE Live Caption Studio (vMix & LED Broadcast)

Hệ thống tạo phụ đề trực tiếp đa ngôn ngữ dành cho hội nghị, hội thảo quốc tế với diễn giả nói **Tiếng Hàn (Korean)** hoặc **Tiếng Anh (English)** và tự động dịch phụ đề sang **Tiếng Việt** theo thời gian thực (real-time).

Hỗ trợ đầu ra linh hoạt, có thể định dạng kích thước tùy biến, trong suốt (Alpha channel) để tích hợp vào **vMix** hoặc phóng to chiếu lên **màn hình LED / Máy chiếu hội trường**.

---

## 🚀 Tính năng nổi bật

1. **Nhận diện giọng nói & Dịch trực tiếp**:
   - Chuyển đổi ngôn ngữ diễn giả nhanh với 1 chạm: 🇰🇷 **Tiếng Hàn (`ko-KR`)** và 🇺🇸 **Tiếng Anh (`en-US`)**.
   - Dịch thời gian thực sang **Tiếng Việt (`vi`)** với độ trễ siêu thấp (~200ms - 400ms).
   - Hiển thị cả từ tạm thời (interim word streaming) khi diễn giả đang nói và hoàn thiện dấu câu khi dứt câu.
   - Bộ từ điển sự kiện (Glossary): Cho phép định nghĩa trước tên VIP, thương hiệu, thuật ngữ chuyên môn (ví dụ: `CEO -> Tổng giám đốc`, `AI -> Trí tuệ nhân tạo`, `Samsung -> Samsung`).

2. **Đầu ra vMix (Alpha Transparency / Trong suốt)**:
   - Đường dẫn Overlay trực tiếp: `http://localhost:3000/caption/overlay`
   - Nền trong suốt 100% (Alpha channel), không cần key phông xanh, overlay sắc nét lên luồng camera vMix.
   - Hỗ trợ cả tùy chọn phông xanh Chroma Key (`#00FF00`, `#0000FF`, `#FF00FF`) nếu dùng capture card HDMI phần cứng.

3. **Cửa sổ Resizable & Pop-out (Tùy biến kích thước linh hoạt)**:
   - Đường dẫn cửa sổ riêng: `http://localhost:3000/caption/window`
   - Tự do kéo mép cửa sổ thay đổi kích thước tùy ý (ví dụ: Lower-third `1920x280`, Full HD `1920x1080`, LED Banner `2560x600`).
   - Có nút **"Clean Broadcast"** để ẩn sạch thanh công cụ, tiện cho vMix Window Capture hoặc kéo sang màn hình LED phụ.

4. **Hiển thị Màn hình LED Sân khấu (Stage LED Wall)**:
   - Đường dẫn LED toàn màn hình: `http://localhost:3000/caption/led`
   - Nền đen sâu chống lọt sáng sân khấu, cỡ chữ lớn từ 40px đến 140px, viền chữ tương phản cao (Stroke) để khán giả hàng ghế xa nhất vẫn đọc rõ.
   - Hỗ trợ chế độ Fullscreen (F11 / Double click).

5. **Bộ điều khiển trực tiếp (Operator Console)**:
   - Đồng hồ đo âm lượng micro (VU Level Meter).
   - Nút **Panic / Clear Screen**: Xóa sạch màn hình phụ đề ngay lập tức khi diễn giả ho hoặc nghỉ giữa hiệp.
   - **Ghim thông báo khẩn (Pinned Announcement)**: Đẩy thông điệp tùy ý lên màn hình (ví dụ: "Phiên hỏi đáp Q&A sắp bắt đầu", "Chào mừng đoàn khách quý").
   - Giả lập câu thoại hội nghị mẫu (Test Speech Simulator) để kỹ thuật viên test màn hình LED/vMix mà không cần micro.

---

## 🛠️ Hướng dẫn tích hợp vào vMix

1. Khởi động hệ thống bằng cách chạy file `run_live_caption.bat` hoặc lệnh:
   ```bash
   npm run dev
   ```
2. Mở trình duyệt vào trang điều khiển: `http://localhost:3000/caption`.
3. Trong vMix, bấm **Add Input** (Góc dưới bên trái) → chọn **Web Browser**.
4. Dán đường link sau vào ô URL:
   ```text
   http://localhost:3000/caption/overlay
   ```
5. Đặt kích thước:
   - **Width**: `1920`
   - **Height**: `1080` (hoặc `1920x300` nếu muốn crop riêng dải chữ).
6. Tích chọn **"Transparent"** nếu vMix yêu cầu. Bấm **OK**.
7. Gán Input này vào kênh **Overlay 1** hoặc **Overlay 2** trên thanh chuyển cảnh vMix. Phụ đề tiếng Việt sẽ tự động hiển thị mượt mà trên hình ảnh máy quay!

---

## 📺 Hướng dẫn xuất ra Màn hình LED / Máy chiếu

1. Kết nối cổng HDMI hoặc DisplayPort từ máy tính tới bộ xử lý hình ảnh LED (Novastar, Colorlight, Barco...).
2. Cài đặt màn hình phụ ở chế độ **Extend these displays** trong Windows (`Windows + P` → `Extend`).
3. Trên trang điều khiển, bấm nút **"LED Stage View"** (hoặc mở `http://localhost:3000/caption/led`).
4. Kéo cửa sổ đó sang màn hình phụ LED và nhấn **F11** (hoặc nhấp đúp chuột) để bật chế độ toàn màn hình.

---

## 🌐 Chạy trên 2 máy tính qua mạng LAN (Laptop Kỹ Thuật + PC vMix)

Nếu kỹ thuật viên âm thanh ngồi điều khiển trên Laptop, còn phần mềm vMix chạy trên PC livestream riêng:
1. Xem địa chỉ IP của máy phát (ví dụ: `192.168.1.50`).
2. Trên máy tính vMix, nhập link Browser Input là:
   ```text
   http://192.168.1.50:3000/caption/overlay
   ```
3. Hệ thống có cơ chế đồng bộ mạng LAN tự động, kỹ thuật viên nói hoặc bấm phím trên laptop thì màn hình vMix trên PC bên kia sẽ cập nhật ngay tức thì!
