# Task Decomposition — HW2 Audio Queue

The work follows the functional-slice, contract-first, atomic implementation, and verification guidance from slide 5. The contract and decomposition were committed before implementation.

## Stage 1 — Requirements and contract

- [x] Read slide 31 and apply general rules from slides 2, 3, 5, and 29.
- [x] Record scope, stack, status model, queue and playback semantics, cleanup ownership, and evidence requirements in `project-rules.md`.
- [x] Split implementation and verification into reviewable commits.

Commit: `27353bc docs: define HW2 rules and task decomposition`.

## Stage 2 — Atomic implementation slices

- [x] Scaffold Vite, React, strict TypeScript, scripts, and baseline styles. Commit: `a608a33 chore: scaffold strict React and Vite app`.
- [x] Implement the task contract, error helpers, two concurrent FIFO workers, ordered playback cursor, cancellation, settlement, stop, and idempotent disposal. Commit: `5df8d9f feat(queue): add concurrent FIFO audio controller`.
- [x] Add deterministic queue/backend tests for concurrency, ordering, cancellation races, errors, and cleanup. Commit: `d0e1f91 test(queue): cover concurrency and lifecycle races`.
- [x] Implement the Canvas visualizer with a reusable frequency buffer, RAF, resize handling, and no frame-driven React state. Commit: `a6393ad feat(visualizer): add RAF canvas frequency display`.
- [x] Correct queue-drain playback disarming. Commit: `d7790aa fix(queue): disarm playback after queue drains`.
- [x] Reset the idle canvas and cache canvas bounds outside the frame loop. Commit: `064e8b6 fix(visualizer): reset idle canvas and cache resize bounds`.
- [x] Generate two self-contained short WAV fixtures and integrate the accessible StrictMode React demo. Commit: `a25e69e feat(demo): add local audio queue player`.
- [x] Release per-task promise callbacks and cancellation controllers once they are no longer needed; validate their lifecycle in `verifyInvariants()`. Commit: `3b63191 fix(queue): release settled task resources`.
- [x] Record actual automated/browser verification and reproduced AI defects in this file, `README.md`, and `AI_FAILURE_AUDIT.md`. Commit: `f125c7e docs: record verification and AI failure audit`.
- [x] Fix adaptive Canvas bin geometry and add narrow-width, resize/DPR, and repeated resource-lifecycle regression tests; update measured evidence.

## Stage 3 — Verification

- [x] Enqueue multiple tasks; deterministic doubles verify a maximum of two in-flight pipelines and FIFO playback under reversed decode completion.
- [x] Cancel queued, downloading, decoding, ready, and playing tasks; verify late decode/end callbacks cannot revive cancelled state.
- [x] Verify HTTP, decode, resume, and source-start failures; later queue items continue.
- [x] Resolve decode and playback callbacks after cancellation/disposal; verify one promise settlement and no state revival.
- [x] Call dispose twice; exercise the app under React StrictMode in the browser with no console errors or warnings.
- [x] Exercise 30 queue enqueue/play/cancel/stop cycles and dispose twice; test 40 source natural-end/stop releases, one context close, and 30 RAF/listener cleanup cycles using deterministic doubles.
- [x] Run typecheck, unit tests, lint, and production build.
- [x] In desktop and mobile responsive browser viewports, verify local WAV fetch/decode/playback, both samples, stop/replay, cancellation, and natural completion.
- [x] Capture three equivalent optimized-build memory workload batches after warm-up and record heap/resource counters, separating explicit cleanup evidence from unavailable heap-snapshot evidence.
- [x] Measure a visible Canvas visualizer timestamp sample of at least 60 seconds, a same-tab reference RAF, and App render count; preserve the previous 30 FPS and independent headless 60 FPS observations with their conditions.
- [x] Review final Git status and confirm `node_modules` and `dist` are ignored.

## Stage 4 — Delivery

- [x] Push the complete `main` branch and commit history to `24521450/MSIS207.R11.CTTT.Week2.HW2`; GitHub reports public visibility and default branch `main`.

## Verification log

- Date: 2026-10-21 (Asia/Saigon).
- `npm run typecheck`: passed.
- `npm test -- --reporter=dot`: 22 tests across 3 files passed.
- `npm run lint`: passed with no warnings.
- `npm run build`: passed (Vite production build).
- `git diff --check`: passed; `git check-ignore node_modules dist` confirmed both generated directories are ignored.
- Geometry test: all 256 bar calls remain inside logical widths 320 px and 144 px and the final bin remains positive-width, after resize `640 → 320 → 144 → 640` at DPR 1 and 2. Backing dimensions and `setTransform` follow DPR.
- Final uninstrumented production browser session: ChatGPT in-app Chromium 155 on Windows, visible/headful. Desktop viewport 1280×720 CSS px at DPR 1 during the production playback check; mobile responsive viewport 390×844 CSS px at DPR 1. Both bundled WAVs completed on both viewports; mobile also verified ready cancellation and stop→ready→replay→natural completion. Console error/warning list was empty. The mobile check used a responsive viewport override, not a physical handset. The browser viewport was reset to its default 1280×720 CSS px at DPR 2 afterward.
- Current visible/headful RAF sample: 3,956 Canvas callbacks / 3,955 intervals over 65.982 seconds during 22 sequential 3-second local WAVs; mean 16.683 ms, median 16.700 ms, p95 17.400 ms, p99 18.200 ms, min 3.900 ms, max 45.800 ms, 59.940 intervals/s. Same-tab reference RAF with the app unmounted: 600 frames / 599 intervals over 10.016 seconds, 59.803 intervals/s. The temporary App render counter recorded 93 App renders during the Canvas sample. This indicates the visualizer callback and React renders did not occur one-for-one in this session; it does not establish a device-independent 60 FPS guarantee.
- Earlier integrated-browser RAF result retained for comparison: 1,200 timestamps / 1,199 intervals over 39.93 seconds; mean 33.305 ms, median 33.300 ms, p95 33.900 ms, min 15.900 ms, max 83.400 ms (about 30.05 intervals/s). Independent review supplied with the task reported Chrome headless 155 at DPR 1 and 1280×900: 14 WAVs, 2,520 frames over about 42 seconds, mean 16.666 ms (about 60 FPS). The latter's percentiles were not supplied and it was not repeated here.
- Memory run: three equivalent four-task workload batches (two natural completions, one stop/replay/natural end, one ready cancellation), each followed by dispose/unmount and a 1.2-second wait. `usedJSHeapSize` values were 7,119,113 B, 6,587,787 B, and 6,743,932 B. Cumulative resources after the batches: contexts created/closed 2/2, 3/3, 4/4; sources created/started/disconnected/cleared 8/8/8/8, 12/12/12/12, 16/16/16/16; live sources, pending RAFs, and active resize observers were zero; event-listener adds/removes balanced 4/4, 6/6, 8/8. The values were non-monotonic; GC was not forced. No CDP heap snapshot, object counts, retained sizes, or retaining paths were available, so this does not prove absence of leaks.
- Full requirement matrix, exact sample statistics, warm-up/idle heap readings, resource counters, measurement environment, and limitations: [VERIFICATION_REPORT.md](VERIFICATION_REPORT.md).
- Resource doubles: 30 queue cycles with play/cancel/stop then double dispose; 40 source end/stop cycles verified disconnect, null buffer and handler; one AudioContext close; 30 visualizer start/stop cycles left no RAF, and dispose removed its resize observer. These tests verify explicit lifecycle calls, not garbage collection.
- No heap snapshot/retained-size/retaining-path analysis or physical handset verification was run. Explicit cleanup evidence is limited to test doubles and the instrumented workloads described above; no absolute no-leak claim is made.
- Actual defects found and fixed are documented with reproductions/evidence in `AI_FAILURE_AUDIT.md`; no defects or verification outcomes were invented.
