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
- `npm test -- --reporter=dot` — 17 tests trong 3 files passed. Test doubles bao phủ giới hạn concurrency, FIFO khi decode đảo thứ tự, cancellation ở các pha, lỗi tải/giải mã/resume/start, callback muộn, resolve đúng một lần, dispose hai lần, nguồn mới khi phát lại và reuse buffer Canvas.
- `npm run lint` — passed, không còn warning.
- `npm run build` — passed với Vite production build.
- Browser: ChatGPT in-app browser, Chrome 155 trên Windows UA, viewport 1280×720 CSS px, DPR 2. Hai WAV cục bộ tải/giải mã/phát được theo thứ tự; URL form, hủy task ready, stop về ready, natural end và thao tác Phát lại sau khi queue drain đã được kiểm tra.
- Đo RAF từ callback thật của CanvasVisualizer trong một lượt phát: 100 timestamps / 99 intervals, trung bình 16.67 ms, median 16.70 ms, p95 18.10 ms, min 7.70 ms, max 26.00 ms; 50/99 intervals không vượt 16.7 ms. Cửa sổ đo ngắn có jitter nên không đủ bằng chứng để khẳng định đạt 60 FPS ổn định.

Chưa chạy heap profiler hoặc phép đo dài hạn để kết luận không rò rỉ bộ nhớ. Chi tiết các lỗi AI thực tế đã gặp và cách sửa nằm trong [AI_FAILURE_AUDIT.md](AI_FAILURE_AUDIT.md).

## Repository

[24521450/MSIS207.R11.CTTT.Week2.HW2](https://github.com/24521450/MSIS207.R11.CTTT.Week2.HW2) — public, nhánh `main`.
