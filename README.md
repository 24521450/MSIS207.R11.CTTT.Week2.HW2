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
- Browser production cuối: Chromium 155 trên Windows, tab visible/headful. Trên desktop 1280×720 CSS px, cả hai WAV phát đến `completed`; trên responsive mobile 390×844 CSS px, cả hai WAV phát xong, task ready bị hủy, và stop→ready→replay→natural end thành công. Canvas đo được 882.4 px desktop và 299.8 px mobile. DPR là 1 ở cả hai lượt kiểm tra. Browser console error/warning list rỗng. Mobile là responsive viewport override, không phải điện thoại vật lý.
- FPS được đo trong nhiều điều kiện, không gộp thành một kết luận: lượt integrated-browser trước đó đạt khoảng **30.05 intervals/s** (1,199 intervals/39.93 s, mean 33.305 ms, p95 33.900 ms, max 83.400 ms); review độc lập cung cấp số liệu Chrome headless khoảng **60 FPS** (2,520 frames/~42 s, mean 16.666 ms); lượt visible/headful hiện tại ghi **3,956 Canvas callbacks / 3,955 intervals / 65.982 s**, mean 16.683 ms, median 16.700 ms, p95 17.400 ms, p99 18.200 ms, max 45.800 ms (59.940 intervals/s). RAF tham chiếu cùng tab: 600 frames/10.016 s (59.803 intervals/s). 93 App renders trong lượt Canvas dài, không render theo mỗi frame. Kết quả FPS phụ thuộc phiên và điều kiện; không cam kết 60 FPS ổn định trên mọi thiết bị.
- Ba lô memory-profile tương đương sau warm-up cho `usedJSHeapSize` **7,119,113 B → 6,587,787 B → 6,743,932 B**. Nguồn được tạo/start/disconnect/clear: **8/8/8/8, 12/12/12/12, 16/16/16/16**; AudioContext đóng **2/2, 3/3, 4/4** theo bộ đếm tích lũy; sau từng lô không còn source/RAF/observer active và listeners thêm/gỡ cân bằng. Không có CDP heap snapshot, retained size hoặc retaining path, GC không bị ép; đây không phải bằng chứng tuyệt đối không rò rỉ.
- Bảng đối chiếu yêu cầu, điều kiện trình duyệt, thống kê đầy đủ và giới hạn phép đo nằm trong [VERIFICATION_REPORT.md](VERIFICATION_REPORT.md). Instrumentation memory-profile đã được gỡ trước build cuối.
- Kiểm tra cleanup bằng test doubles: 30 chu kỳ queue enqueue/play/cancel/stop rồi dispose hai lần; 40 AudioBufferSourceNode qua natural-end/stop đều disconnect, xóa buffer và handler, AudioContext đóng một lần; 30 chu kỳ visualizer stop/start không để lại RAF và resize listener được gỡ khi dispose.

Không có heap snapshot/retained size/retaining path hoặc test trên điện thoại vật lý; không kết luận đã chứng minh không rò rỉ bộ nhớ. Chi tiết lỗi AI thực tế đã gặp và cách sửa nằm trong [AI_FAILURE_AUDIT.md](AI_FAILURE_AUDIT.md). Regression hẹp Canvas được báo từ lượt review độc lập; nó không được gán nhầm thành lỗi AI trong audit.

## Repository

[24521450/MSIS207.R11.CTTT.Week2.HW2](https://github.com/24521450/MSIS207.R11.CTTT.Week2.HW2) — public, nhánh `main`.
