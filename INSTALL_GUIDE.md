# Hướng Dẫn Cài Đặt Chrome Extension (Chế Độ Developer Mode)

Tài liệu này hướng dẫn bạn cách cài đặt tiện ích (extension) lên trình duyệt Google Chrome từ file `dist.zip` ở chế độ dành cho nhà phát triển (Developer Mode).

## Cài Đặt Nhanh (Tóm Tắt)
1. Giải nén file `dist.zip`.
2. Mở Chrome, truy cập vào `chrome://extensions/`.
3. Bật **Developer mode** (Chế độ dành cho nhà phát triển).
4. Nhấn **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục vừa giải nén.

---

## Hướng Dẫn Chi Tiết Từng Bước

### Bước 1: Giải nén file cài đặt
1. Tìm file `dist.zip` mà bạn đã tải về máy tính.
2. Click chuột phải vào file `dist.zip` và chọn **Extract Here** (Giải nén ở đây) hoặc **Extract to "dist"** (Giải nén vào thư mục "dist").
3. Sau khi giải nén, bạn sẽ có một thư mục (folder) chứa các file mã nguồn của tiện ích. Hãy nhớ vị trí của thư mục này.

### Bước 2: Mở trang Quản lý Tiện ích trên Chrome
1. Mở trình duyệt Google Chrome.
2. Copy và dán đường dẫn sau vào thanh địa chỉ của trình duyệt, sau đó nhấn **Enter**:
   ```text
   chrome://extensions/
   ```
   *(Hoặc bạn có thể click vào biểu tượng 3 dấu chấm ở góc trên bên phải Chrome > chọn **Extensions** (Tiện ích) > **Manage Extensions** (Quản lý tiện ích)).*

### Bước 3: Bật chế độ dành cho nhà phát triển (Developer mode)
Tại trang Quản lý tiện ích, hãy nhìn sang góc trên cùng bên phải. Bạn sẽ thấy một công tắc có tên là **Developer mode** (Chế độ dành cho nhà phát triển).
- Hãy **bật (turn on)** công tắc này để nó chuyển sang màu xanh.

### Bước 4: Tải tiện ích lên
1. Sau khi bật Developer mode, bạn sẽ thấy xuất hiện một số nút mới ở góc trên bên trái.
2. Click vào nút **Load unpacked** (Tải tiện ích đã giải nén).
3. Một cửa sổ chọn file sẽ hiện ra. Hãy tìm đến thư mục mà bạn đã giải nén ở **Bước 1**.
4. Click chọn thư mục đó (chỉ cần chọn thư mục cha chứa các file bên trong) và nhấn **Select** (hoặc **Select Folder** / **Mở**).

### Bước 5: Ghim và Sử dụng tiện ích
1. Cài đặt thành công! Bạn sẽ thấy tiện ích xuất hiện trong danh sách các tiện ích của Chrome.
2. Để dễ dàng sử dụng, hãy click vào **biểu tượng mảnh ghép** (Extensions) ở góc trên bên phải của trình duyệt Chrome (cạnh thanh địa chỉ).
3. Tìm tên tiện ích bạn vừa cài và click vào biểu tượng **Ghim (Pin)** bên cạnh để nó luôn hiển thị trên thanh công cụ.
4. Bây giờ bạn có thể click vào biểu tượng của tiện ích để bắt đầu sử dụng!

---

## Các Lỗi Thường Gặp & Cách Khắc Phục

- **Lỗi không tìm thấy file manifest.json:** 
  - *Nguyên nhân:* Bạn đã chọn sai thư mục ở Bước 4. Bạn có thể đã chọn thư mục bọc bên ngoài thư mục chứa code thực sự.
  - *Cách sửa:* Khi chọn thư mục ở Bước 4, hãy đảm bảo rằng thư mục bạn chọn chứa trực tiếp file `manifest.json`.

- **Cảnh báo từ Chrome khi khởi động lại:**
  - Vì đây là tiện ích cài đặt thủ công (không qua Chrome Web Store), mỗi khi bạn khởi động lại Chrome, trình duyệt có thể hiển thị một thông báo yêu cầu tắt các tiện ích ở chế độ nhà phát triển. Bạn chỉ cần nhấn **(X) Đóng** thông báo để tiếp tục sử dụng bình thường. Đừng nhấn "Tắt" (Disable).
