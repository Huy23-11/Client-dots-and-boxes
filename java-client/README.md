# Dots & Boxes JavaFX Client

JavaFX desktop client kết nối trực tiếp tới Java NIO server qua TCP port `5000`.
Project React ở thư mục gốc được giữ nguyên làm mẫu giao diện; trình duyệt không
thể chạy client này hoặc mở `SocketChannel`.

## Yêu cầu

- JDK 21
- Maven 3.9+
- Backend và MySQL đang chạy

## Chạy

```bash
cd java-client
mvn javafx:run
```

Mặc định client kết nối `localhost:5000`. Có thể đổi địa chỉ:

```bash
mvn javafx:run -Dgame.server.host=192.168.1.10 -Dgame.server.port=5000
```

## Nguyên tắc đồng bộ trận đấu

Client không tự tính luật chơi. Khi người chơi chọn cạnh, client chỉ gửi:

```text
MAKE_MOVE,,r1;c1;r2;c2
```

Bàn cờ chỉ thay đổi sau khi server trả `MOVE_RESULT`. Server là nguồn dữ liệu
quyết định cạnh hợp lệ, ô được tạo, điểm số, lượt tiếp theo và kết quả trận.

Phiên bản hiện tại hỗ trợ đăng ký, đăng nhập, hồ sơ cơ bản, chơi nhanh 3x3,
hủy tìm trận, chơi online, bỏ cuộc, heartbeat, logout và thông báo mất kết nối.
Các chức năng chưa có opcode server (phòng riêng, lời mời, leaderboard, lịch sử,
danh sách online) được hiển thị ở trạng thái chưa khả dụng.

## Lưu ý tương thích backend hiện tại

Client đã xử lý trường hợp `GAME_OVER` đến trước `MOVE_RESULT`: nếu server vẫn
gửi `MOVE_RESULT` sau đó, cạnh cuối cùng vẫn được render từ dữ liệu server. Tuy
nhiên, commit backend `23b0bf1` đặt `currentRoom = null` trong
`Room.finalizeMatch()` trước khi `UserRepresentative.makeMove()` lấy lại phòng
để gửi `MOVE_RESULT`. Nước đi cuối có thể vì thế không tới client. Client không
tự dựng lại nước đi bị thiếu vì server phải là nguồn dữ liệu duy nhất; lỗi này
cần được sửa tại backend khi nhóm cho phép cập nhật repository đó.
