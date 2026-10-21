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

## Stage 3 — Verification

- [x] Enqueue multiple tasks; deterministic doubles verify a maximum of two in-flight pipelines and FIFO playback under reversed decode completion.
- [x] Cancel queued, downloading, decoding, ready, and playing tasks; verify late decode/end callbacks cannot revive cancelled state.
- [x] Verify HTTP, decode, resume, and source-start failures; later queue items continue.
- [x] Resolve decode and playback callbacks after cancellation/disposal; verify one promise settlement and no state revival.
- [x] Call dispose twice; exercise the app under React StrictMode in the browser with no console errors or warnings.
- [x] Run typecheck, unit tests, lint, and production build.
- [x] In a browser, verify local WAV fetch/decode, actual Web Audio playback in FIFO order, stop/replay, natural completion, cancellation, and queue-drain behavior.
- [x] Measure actual Canvas visualizer frame timestamps during playback and record environment and limitations below.
- [x] Review final Git status and confirm `node_modules` and `dist` are ignored.

## Stage 4 — Delivery

- [x] Push the complete `main` branch and commit history to `24521450/MSIS207.R11.CTTT.Week2.HW2`; GitHub reports public visibility and default branch `main`.

## Verification log

- Date: 2026-10-21 (Asia/Saigon).
- `npm run typecheck`: passed.
- `npm test -- --reporter=dot`: 17 tests across 3 files passed.
- `npm run lint`: passed with no warnings.
- `npm run build`: passed (Vite production build).
- `git diff --check`: passed; `git check-ignore node_modules dist` confirmed both generated directories are ignored.
- Browser session: ChatGPT in-app browser, Chrome 155 user-agent on Windows, viewport 1280×720 CSS px, device pixel ratio 2. Both local WAV samples fetched, decoded, and played in enqueue order. Tested URL submission, ready-task cancellation, playing-task stop back to ready, replay, natural end, and requiring a new Play gesture after drain. Console error/warning list was empty during the final StrictMode smoke pass.
- RAF sample during actual playback: 100 timestamps / 99 intervals, mean 16.67 ms, median 16.70 ms, p95 18.10 ms, minimum 7.70 ms, maximum 26.00 ms; 50/99 intervals were at or below 16.7 ms. This short sample has visible jitter and does not establish stable 60 FPS.
- No heap profiler or long-duration memory test was run; absence of memory leaks is not claimed. Browser verification used the in-app Chromium browser, not a separate physical audio device matrix.
- Actual defects found and fixed are documented with reproductions/evidence in `AI_FAILURE_AUDIT.md`; no defects or verification outcomes were invented.
