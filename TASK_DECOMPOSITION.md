# Task Decomposition — HW2 Audio Queue

The implementation follows the four stages in slide 5: functional slices, contracts, atomic modules, independent verification. Complete and commit a slice before moving to the next one.

## Stage 1 — Functional slices and contract (completed before implementation)

- [x] Read slide 31 and apply slides 2, 3, 5, and 29.
- [x] Define status, task snapshot, controller API, transitions, FIFO rules, cancellation, and resource ownership in `project-rules.md`.
- [x] Split work into the atomic tasks below.

## Stage 2 — Atomic implementation tasks

- [x] Scaffold Vite + React + strict TypeScript, scripts, and baseline styles. Commit: `chore: scaffold strict React and Vite app` (`a608a33`).
- [x] Implement task contracts, error helpers, task settlement, queue workers, FIFO playback cursor, cancellation, stop, and disposal. Commit: `feat(queue): add concurrent FIFO audio controller` (`5df8d9f`).
- [x] Add deterministic controller/backend tests and fix defects found during verification. Commit: `test(queue): cover concurrency and lifecycle races` (pending).
- [x] Implement Canvas visualizer with reusable frequency buffer, RAF lifecycle, resize handling, and no frame-driven React state. Commit: `feat(visualizer): add RAF canvas frequency display`.
- [ ] Generate and include two short local WAV fixtures; add accessible React demo controls, queue status, errors, and StrictMode lifecycle. Commit: `feat(demo): add local audio queue player`.
- [ ] Verify browser playback and capture timestamp-based frame measurements; record actual test/build/browser evidence and three reproduced AI defects in README and `AI_FAILURE_AUDIT.md`. Commit: `docs: record verification and AI failure audit`.

## Stage 3 — Independent verification checklist

- [x] Enqueue multiple tasks; test doubles confirm the two-worker limit and FIFO playback when decode completion order is reversed.
- [x] Cancel queued, downloading, decoding, ready, and playing tasks; late decode/end callbacks cannot revive cancelled status.
- [ ] Exercise HTTP failure, decode rejection, playback start/end failure, and confirm later tasks continue. HTTP, decode, and source-start failures are covered; the final browser pass is pending.
- [x] Resolve decode callbacks after cancellation and disposal; confirm one promise settlement and no stale status update.
- [x] Call dispose twice; StrictMode verification is pending the browser UI pass.
- [x] Run the current core typecheck, unit suite, and production build.
- [ ] Use the real browser and local WAV samples to verify Web Audio graph and controls; measure RAF timestamps and state environment/sample statistics.
- [ ] Inspect final Git diff/status and confirm `node_modules`, `dist`, and secrets are absent.

## Stage 4 — Delivery

- [ ] Push the complete `main` branch and its Conventional Commit history to `24521450/MSIS207.R11.CTTT.Week2.HW2`.
- [ ] Report repository URL, checks actually passed, performance measurements, and criteria still unverified.

## Verification log

- 2026-10-21 (Asia/Saigon), core-only checkpoint: `npm run typecheck` passed; `npm test -- --reporter=dot` passed (17 tests in 3 files); `npm run build` passed; `npm run lint` passed. This checkpoint includes the Canvas module and core controller; demo integration is pending.
- Defects found and corrected during development: a TypeScript 6 `erasableSyntaxOnly` compile error from a constructor parameter property; a valid settled `ready` task rejected by `verifyInvariants()`; and a source cleanup exception that could skip the natural-end callback and retain the buffer.
- 2026-10-21 follow-up: `npm run typecheck`, `npm test -- --reporter=dot` (17 tests), and `npm run lint` passed after adding resume-failure retry and queue-drain disarming coverage. Final production build remains pending.
