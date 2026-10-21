# AI Failure Audit — HW2 Audio Queue

Audit này ghi lại các lỗi thật trong những bản nháp AI của dự án. Không tạo lỗi minh họa rồi gọi đó là lịch sử. Bằng chứng bên dưới đến từ typecheck, test output, lint và phiên chạy browser đã quan sát trong ngày 2026-10-21; các lỗi đã được sửa và test lại.

## 1. TypeScript 6 không chấp nhận parameter property với `erasableSyntaxOnly`

- **Lỗi:** Bản nháp khai báo `constructor(private readonly createContext: AudioContextFactory = ...)`. Scaffolder bật `erasableSyntaxOnly`; TypeScript 6 báo `TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.` Bản nháp Canvas constructor ban đầu lặp lại cùng mẫu lỗi.
- **Tái hiện:** Dùng parameter property trong constructor dưới `tsconfig.app.json` hiện tại rồi chạy `npm run typecheck`.
- **Bằng chứng:** Lần typecheck đầu dừng tại `src/audio/web-audio-backend.ts(12,15)` với đúng thông báo `TS1294`; lần đầu thêm Canvas cũng báo `TS1294` tại `src/audio/canvas-visualizer.ts`.
- **Sửa:** Khai báo field `private readonly` riêng, nhận tham số thường trong constructor rồi gán field. `npm run typecheck` hiện passed.

## 2. `verifyInvariants()` từ chối trạng thái `ready` hợp lệ

- **Lỗi:** Invariant ban đầu coi mọi trạng thái chưa terminal phải có promise chưa settle. Promise của task được resolve khi decode xong, trong khi task vẫn ở `ready` để chờ phát; vì vậy state hợp lệ bị đánh dấu sai.
- **Tái hiện:** Decode task đến `ready`, giữ task đó trong queue, rồi gọi `verifyInvariants()`.
- **Bằng chứng:** Test `cancels a queued task and starts the next non-cancelled FIFO item when a slot opens` từng thất bại ở assertion `expect(queue.verifyInvariants()).toBe(true)` với `expected false to be true`.
- **Sửa:** Phân biệt nhóm `queued/downloading/decoding` còn chờ settle với nhóm `ready/playing/completed/cancelled/error` đã settle. Test hiện xác nhận invariant qua các chuyển trạng thái này.

## 3. Lỗi disconnect làm kẹt vòng đời phát và giữ buffer

- **Lỗi:** Bản nháp gọi `source.disconnect()` trước callback kết thúc mà không bắt lỗi, đồng thời không xóa `source.buffer`. Nếu disconnect đã hoàn tất hoặc ném lỗi, callback `onEnded` không chạy, task có thể kẹt ở `playing`, playback cursor không tiến và source còn giữ AudioBuffer.
- **Tái hiện:** Trong test double, làm `disconnect()` ném `Error('already disconnected')`, sau đó phát `onended`.
- **Bằng chứng:** Test backend ban đầu quan sát exception `already disconnected`, callback natural-end không được gọi; assertion giải phóng buffer cũng nhận lại object `{ duration: 0.1 }` thay vì `null`.
- **Sửa:** Bắt lỗi disconnect, xóa `source.buffer`, dọn source trước khi gọi callback natural-end. Cleanup stop/dispose cũng tiếp tục đóng graph/context dù node disconnect đã lỗi. Test `still reports natural playback end if a source disconnect fails` hiện passed.

## 4. Cờ playback không tự tắt khi queue đã hết

- **Lỗi:** Sau task cuối, `playbackRequested` vẫn bật. Thêm task vào một queue đã phát xong làm task đó tự phát mà không cần thao tác Phát mới; khi không còn source đang chạy, nút Dừng bị disabled nên người dùng không thể disarm chế độ này.
- **Tái hiện:** Trong browser, phát xong một WAV rồi bấm thêm mẫu WAV khác. Bản nháp chuyển task mới sang `Đang phát` ngay sau decode dù chưa bấm Phát.
- **Bằng chứng:** Phiên browser trước khi sửa hiển thị các task mới tự chuyển tới `Đã phát xong`; sau khi sửa, test `requires another explicit Play gesture after the queue drains` và browser retest đều giữ task mới ở `Sẵn sàng` cho tới khi bấm Phát.
- **Sửa:** Khi playback cursor tới cuối danh sách hiện tại, đặt `playbackRequested = false`. Task đã có trong queue vẫn tiếp tục FIFO trong phiên phát; task đến sau cần lần bấm Phát mới.

## 5. `queueReady` gây render đồng bộ từ effect

- **Lỗi:** Bản nháp gọi `setQueueReady(true)` ngay trong effect khởi tạo controller, làm phát sinh render nối tiếp không cần thiết.
- **Tái hiện:** Chạy `npm run lint`.
- **Bằng chứng:** Oxlint báo `react(set-state-in-effect)` tại `src/App.tsx:40`.
- **Sửa:** Bỏ state readiness dư thừa; action handler tự kiểm tra ref controller, còn việc bật/tắt Play dựa trên task state. Lint hiện passed.

## Giới hạn audit

- Không có XSS path qua HTML injection trong phiên bản cuối: text task/error được render bằng React text node; không dùng `innerHTML`.
- Bài test teardown xác nhận dispose hai lần và late callback bị bỏ qua, nhưng chưa chạy heap profiler hoặc kiểm thử dài hạn. Audit này không khẳng định đã chứng minh không rò rỉ bộ nhớ.
