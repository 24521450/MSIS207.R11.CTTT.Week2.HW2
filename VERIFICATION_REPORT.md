# HW2 verification report

Date: 2026-10-21 (Asia/Saigon). Repository commit under verification: `ea5d0f7` (`fix(visualizer): fit all frequency bins on narrow canvases`). The final implementation was not changed during this follow-up; temporary browser-only profiling instrumentation was removed before the final typecheck, test, lint, build, and production browser run.

## Requirements matrix

| Requirement | Method | Result and evidence | Status |
|---|---|---|---|
| Web Audio graph, `fftSize = 512`, 256 frequency bins, a fresh source per playback | `web-audio-backend.test.ts`; play local WAVs in the production browser | Backend test checks lazy `AudioContext`, resume on request, 512/256 analyser dimensions, fresh source creation, natural end, stop, and dispose. Both WAVs completed in the browser. | PASS |
| No more than two fetch/decode pipelines; dequeue FIFO | Queue tests use deferred fetch/decode doubles | `limits pipelines to two...` verifies max concurrency; the first two queued tasks start first. | PASS |
| Playback order survives reverse decode completion | Deferred decoder resolves later items first | `plays ready buffers in enqueue order when completion order is reversed` verifies the independent playback cursor. | PASS |
| Cancel queued, downloading, decoding, ready, and playing work; ignore late callbacks; settle once | Queue tests with per-task abort and deferred callbacks | Tests cover aborting a download, cancellation during decode, ready/playing cancellation, late decode/end after cancel or dispose, and one-time settlement. Final browser mobile run cancelled a ready task. | PASS |
| Fetch, decode, context resume, and source-start errors allow following tasks to proceed | Injected failures in queue/backend doubles | Tests verify the item enters an error/retryable state as appropriate and later FIFO work continues. | PASS |
| Stop/replay, queue drain, new Play gesture, and idempotent dispose | Queue tests plus final responsive browser session | Stop returned a mobile production task to `ready`; replay reached natural end. Tests cover new source on replay, queue drain, later Play gesture, and double dispose. | PASS |
| Source, buffer, handler, context, RAF, resize observer, and listener cleanup | Backend/visualizer repeated-cycle doubles and three instrumented browser batches | Browser counters ended with zero live sources, zero pending visualizer RAFs, zero active resize observers, matching add/remove listener counts, all counted sources disconnected with `buffer` and `onended` cleared, and all created contexts closed. Deterministic tests additionally cover 30 queue/visualizer cycles and 40 source end/stop cycles. | PASS for explicit cleanup paths |
| React StrictMode does not leave duplicate resources; no React state updates per visualizer frame | StrictMode production app; temporary App render counter | Production desktop/mobile runs had no console errors/warnings. During the 65.982-second Canvas measurement, 3,956 frame callbacks corresponded to 93 App renders; frame timestamps were recorded through a callback ref, not React state. | PASS for observed run; render count is not a formal React Profiler trace |
| All 256 bins fit narrow Canvas widths; resize and DPR behavior | Canvas tests inspect every `fillRect` coordinate at 320 px and 144 px, at DPR 1/2, with resize `640 → 320 → 144 → 640` | Every bar's right edge stayed within logical width; the last bin had positive width. Backing-store dimensions and transform followed DPR. Production browser Canvas measured 299.80 CSS px at a 390 px responsive viewport. | PASS |
| Actual browser audio at desktop/mobile sizes | Optimized production build in visible in-app Chromium; bundled WAVs only | Both WAVs completed at desktop 1280×720 and responsive mobile 390×844. Mobile also verified ready cancellation and stop→ready→replay→natural end. Browser console error/warning list was empty. Mobile used a responsive viewport override, not a physical handset. | PASS for these browser viewports |
| Long Canvas RAF sample, reference RAF, render count | Visible/headful in-app Chromium; 22 consecutive local 3-second WAVs; reference measured in the same tab after unmount | Canvas: 3,956 callbacks / 3,955 intervals / 65,982.2 ms, interval-rate 59.940 FPS. Reference: 600 callbacks / 599 intervals / 10,016.3 ms, interval-rate 59.803 FPS. Full statistics are below. | PASS for sample capture; this does not promise every frame meets 60 Hz |
| Heap object counts, retained sizes, and retaining paths after repeated production workloads | Three equivalent post-warm-up optimized-build batches; `performance.memory.usedJSHeapSize` and ID-only resource counters | Heap estimates varied without monotonic growth, and explicit app-owned resource counters returned to zero. The browser integration did not expose Chrome DevTools Protocol/HeapProfiler; `measureUserAgentSpecificMemory` was unavailable. No heap snapshot, object counts, retained-size comparison, or retaining-path inspection was possible. | UNVERIFIED |

## Canvas RAF measurement

The long sample used the real `CanvasVisualizer` `onFrame` callback after `getByteFrequencyData` and Canvas drawing. It recorded numeric timestamps in a fixed `Float64Array`; the visualizer kept its frequency buffer and RAF state in its instance. The 22 local WAVs were 3.0 seconds each, played sequentially to natural end with no intentional pause or stop during the measured playback. The browser was visible, `document.visibilityState` was `visible`, and the page was not headless.

Environment reported by the page: ChatGPT in-app Chromium, user agent Chrome 155 on Windows (`Windows NT 10.0; Win64`, `Win32` platform; exact Windows release not identified), viewport 1280×720 CSS px, DPR 2. The sample covered 65.982 seconds of Canvas callbacks. FPS is calculated as `interval count / (last timestamp − first timestamp) × 1000`.

| Sample | Frames | Intervals | Span | Mean interval | Median | p95 | p99 | Max | Min | Rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CanvasVisualizer, continuous playback | 3,956 | 3,955 | 65,982.2 ms | 16.683 ms | 16.700 ms | 17.400 ms | 18.200 ms | 45.800 ms | 3.900 ms | 59.940 FPS |
| Reference RAF, app unmounted in same tab | 600 | 599 | 10,016.3 ms | 16.722 ms | 16.700 ms | 17.000 ms | 21.500 ms | 33.800 ms | 7.500 ms | 59.803 FPS |

The Canvas result is close to 60 callbacks per second in this run, with a 45.8 ms maximum interval. It is an observation for this browser, viewport, and workload, not a guarantee of a stable 60 FPS on other devices. The 93 App renders were counted over the sample; they include task/action updates and do not represent one render per frame.

### Keep the earlier FPS observations separate

- Earlier integrated-browser run: 1,200 timestamps / 1,199 intervals over 39.93 seconds; mean 33.305 ms, median 33.300 ms, p95 33.900 ms, min 15.900 ms, max 83.400 ms (about 30.05 intervals/s). This run had visible jitter and did not establish 60 FPS.
- Independent review supplied with the task: Chrome headless 155, DPR 1, viewport 1280×900, 14 WAVs over about 42 seconds, 2,520 frames, mean 16.666 ms/frame (about 60 FPS). Median and tail percentiles were not supplied; that run was not repeated here.

These measurements differ by session and conditions; they are retained rather than selecting only the higher result.

## Memory and owned-resource observations

The memory run used an optimized Vite build with `--mode memory-profile` and temporary numeric instrumentation, not HMR. The harness retained no `AudioBuffer`, audio node, or task/component DOM node. Its mount/unmount closure did retain the persistent `#root` element, and the page retained the profiler toolbar/output nodes; these page-lifetime instrumentation roots are part of the sample. It also kept a 20,000-element frame timestamp array and a 4,000-element reference timestamp array (192,000 bytes of numeric storage), numeric counters/IDs, a `WeakMap` for source IDs, and `WeakSet` observer tracking. Completed/cancelled task history intentionally remained in each queue until that queue was disposed and its app unmounted. Every sample was taken after decode work had finished, unmount/dispose, and a 1.2-second settling wait. No forced GC was available.

Three equivalent batches each enqueued four tasks: two natural completions, a third task stopped/replayed and naturally completed, and one ready task cancelled. The controller was disposed/unmounted after every batch. One warm-up batch preceded the measured batches; an idle reading was taken after five seconds before and after them.

| Reading | `usedJSHeapSize` | Contexts created/closed (cumulative) | Sources created/start/stop/disconnect/cleared (cumulative) | Live sources | Pending visualizer RAF | Resize observers create/disconnect/active | App listeners added/removed (cumulative) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Warm-up sample | 6,724,800 B | 1/1 | 4/4/1/4/4 | 0 | 0 | 1/1/0 | 2/2 |
| Idle, 5 s after warm-up | 6,246,435 B | — | — | — | — | — | — |
| Batch 1 | 7,119,113 B | 2/2 | 8/8/2/8/8 | 0 | 0 | 2/2/0 | 4/4 |
| Batch 2 | 6,587,787 B | 3/3 | 12/12/3/12/12 | 0 | 0 | 3/3/0 | 6/6 |
| Batch 3 | 6,743,932 B | 4/4 | 16/16/4/16/16 | 0 | 0 | 4/4/0 | 8/8 |
| Idle, 5 s after batch 3 | 6,798,002 B | — | — | — | — | — | — |

The three post-batch heap estimates range from 6,587,787 B to 7,119,113 B (531,326 B); they did not rise monotonically. The last reading is 497,497 B above the post-warm-up idle reading. Because `performance.memory` is a noisy estimate, GC was not forced, and no heap snapshot or retaining path was available, this cannot establish whether any JavaScript object was retained or released. Browser-native audio memory is also outside this measurement. The defensible observation is limited to the explicit resource counters returning to zero/equal add-remove counts in these batches; a general “no memory leak” claim remains unverified.

During the separate long Canvas run, after app unmount, counters showed 1/1 AudioContext create/close, 22/22 sources created/started/disconnected/cleared, zero live sources, zero pending visualizer RAFs, 1/1 resize observer create/disconnect, and 2/2 app listener add/remove. This corroborates the explicit cleanup path for that single long playback run.

## Automated and browser commands

- `npm run typecheck` — passed.
- `npm test -- --reporter=dot` — 22 tests across 3 files passed.
- `npm run lint` — passed without output/warnings.
- `npm run build` — passed; Vite production bundle built successfully.
- Final uninstrumented production browser run — desktop and responsive mobile WAVs completed; mobile cancellation and stop/replay worked; console error/warning list empty.

## Unverified and limits

- No Chrome heap snapshot, CDP HeapProfiler object counts/retained sizes, or retaining-path analysis. The browser bridge exposed no CDP/heap capability, and `performance.measureUserAgentSpecificMemory` was unavailable. Launching an isolated Edge debug port was blocked by the local execution policy; no alternate path was used.
- No physical mobile handset, Safari, or Firefox test.
- No proof that every frame meets a 16.67 ms budget on all devices. This report describes measured sessions only.
- No claim of absolute absence of memory leaks. The heap results are noisy browser estimates and explicit resource counters cover only instrumented app-owned paths.
