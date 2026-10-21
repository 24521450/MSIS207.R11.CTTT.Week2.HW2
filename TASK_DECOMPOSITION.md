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
- [x] Measure an extended Canvas visualizer timestamp sample and record environment and limitations below.
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
- Browser session: ChatGPT in-app Chromium browser on Windows. Desktop viewport 1280×900 CSS px, DPR 1, Canvas 882.4 px. Mobile responsive viewport 390×844 CSS px, DPR 1, Canvas 299.8 px. Both bundled WAVs played; mobile also exercised ready cancellation, stop to ready, replay, and natural completion. A desktop run played 14 alternating local WAVs. Error/warning list was empty in the final desktop session. The mobile check used a responsive viewport override, not a physical handset.
- Extended RAF sample during desktop playback: 1,200 timestamps / 1,199 intervals over 39.93 seconds; mean 33.305 ms, median 33.300 ms, p95 33.900 ms, minimum 15.900 ms, maximum 83.400 ms. This run was close to 30 Hz with jitter, so it does not show stable 60 FPS.
- Resource doubles: 30 queue cycles with play/cancel/stop then double dispose; 40 source end/stop cycles verified disconnect, null buffer and handler; one AudioContext close; 30 visualizer start/stop cycles left no RAF, and dispose removed its resize observer. These tests verify explicit lifecycle calls, not garbage collection.
- No heap profiler or long-duration heap comparison was run; absence of memory leaks is not claimed. Browser verification was not done on a physical mobile device.
- Actual defects found and fixed are documented with reproductions/evidence in `AI_FAILURE_AUDIT.md`; no defects or verification outcomes were invented.
