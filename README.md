# MSIS207.R11.CTTT — HW2

Bản demo React + TypeScript strict cho FIFO audio queue, Web Audio playback và Canvas frequency visualizer. Phạm vi chỉ gồm queue, playback, visualizer và dữ liệu WAV cục bộ.

## Chạy

```sh
npm ci
npm run dev
```

Các lệnh kiểm tra:

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

Tạo lại hai mẫu WAV bằng `npm run samples`. Script ghi WAV PCM mono 22.05 kHz, dài 3 giây vào `public/samples/`.

## Semantics

- `enqueue(trackUrl)` gán ID và thứ tự tăng dần, trả về `Promise<AudioBuffer>` và resolve sau khi decode thành công. Lỗi tải/giải mã hoặc hủy trước khi decode xong reject promise đúng một lần.
- Hai worker tối đa xử lý fetch + decode cùng lúc. Hàng tác vụ bắt đầu FIFO. Playback có cursor theo thứ tự enqueue riêng, nên buffer hoàn tất trước phải đợi các task trước đó phát xong, bị hủy hoặc lỗi.
- Hủy task ở trạng thái queued/downloading/decoding/ready/playing đổi trạng thái sang `cancelled`. `AbortController` riêng dừng fetch; decode không thể abort nên kết quả đến muộn bị bỏ qua. Hủy sau khi promise đã resolve chỉ đổi trạng thái task, không đổi kết quả promise.
- Nút Phát resume AudioContext và phát tiếp queue theo FIFO. Trong cùng phiên phát, task tiếp theo tự chạy. Khi queue hiện tại đã hết, bộ điều khiển disarm; các task enqueue sau đó cần một lần bấm Phát mới.
- Dừng playback dừng source hiện tại, đưa task về `ready` và lần phát sau tạo source mới từ đầu. Không có seek.
- Mỗi lần phát tạo `AudioBufferSourceNode` mới. `AnalyserNode.fftSize` là 512, tương ứng 256 bins.

## Tài nguyên

AudioContext được tạo lười khi cần decode và chỉ resume theo thao tác Phát của người dùng. Queue sở hữu fetch signals, source và audio graph; `dispose()` idempotent hủy request, dừng/ngắt source và đóng context. React effect cleanup gỡ listener và dispose queue/visualizer khi unmount, kể cả vòng setup/cleanup của StrictMode.

Canvas visualizer sở hữu RAF và một `Uint8Array` dùng lại cho các frame. React state chỉ thay đổi theo task/action, không thay đổi mỗi frame. ResizeObserver (hoặc listener resize dự phòng), RAF và buffer được dọn khi dispose.

## Kiểm chứng đã chạy

- `npm run typecheck` — passed.
- `npm test -- --reporter=dot` — 22 tests trong 3 files passed. Test doubles bao phủ giới hạn concurrency, FIFO khi decode đảo thứ tự, cancellation ở các pha, lỗi tải/giải mã/resume/start, callback muộn, resolve đúng một lần, dispose hai lần, nguồn mới khi phát lại, geometry Canvas/resize/DPR và nhiều chu kỳ cleanup.
- `npm run lint` — passed, không còn warning.
- `npm run build` — passed với Vite production build.
- Regression hình học Canvas: test kiểm tra 256 lệnh vẽ và từng tọa độ thực tế tại 320 px và 144 px; resize `640 → 320 → 144 → 640` ở cả DPR 1 và 2. Không cột nào vượt quá logical width, bin cuối vẫn có chiều rộng dương, kích thước backing store theo DPR.
- Browser desktop: ChatGPT in-app Chromium trên Windows, viewport 1280×900 CSS px, DPR 1, Canvas rộng 882.4 px. Browser mobile viewport: 390×844 CSS px, DPR 1, Canvas rộng 299.8 px. Trên mobile viewport đã phát cả hai WAV, hủy một task ready, dừng Soft Pulse về ready, phát lại và xác nhận natural end; desktop phát queue 14 WAV xen kẽ hai mẫu. Browser console error/warning list rỗng sau các lượt này. Mobile được kiểm tra bằng responsive viewport override trong browser, không phải thiết bị cầm tay vật lý.
- Đo RAF từ timestamp của callback thật trong lượt phát desktop 14 mẫu liên tục: **1.200 timestamps / 1.199 intervals / 39.93 giây**; trung bình **33.305 ms**, median **33.300 ms**, p95 **33.900 ms**, min **15.900 ms**, max **83.400 ms**. Kết quả của phiên này gần 30 Hz và có jitter; không khẳng định đạt 60 FPS ổn định. Instrumentation chỉ dùng để đo, không có trong mã cuối.
- Kiểm tra cleanup bằng test doubles: 30 chu kỳ queue enqueue/play/cancel/stop rồi dispose hai lần; 40 AudioBufferSourceNode qua natural-end/stop đều disconnect, xóa buffer và handler, AudioContext đóng một lần; 30 chu kỳ visualizer stop/start không để lại RAF và resize listener được gỡ khi dispose.

Chưa chạy heap profiler, phép đo heap dài hạn hoặc test trên điện thoại vật lý; không kết luận đã chứng minh không rò rỉ bộ nhớ. Chi tiết các lỗi AI thực tế đã gặp và cách sửa nằm trong [AI_FAILURE_AUDIT.md](AI_FAILURE_AUDIT.md). Regression hẹp Canvas được báo từ lượt review độc lập và được ghi ở phần kiểm chứng này; không gán nhầm nó thành lỗi AI trong audit.

## Repository

[24521450/MSIS207.R11.CTTT.Week2.HW2](https://github.com/24521450/MSIS207.R11.CTTT.Week2.HW2) — public, nhánh `main`.
