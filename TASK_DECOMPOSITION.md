# Task Decomposition — HW2 Audio Queue

The implementation follows the four stages in slide 5: functional slices, contracts, atomic modules, independent verification. Complete and commit a slice before moving to the next one.

## Stage 1 — Functional slices and contract (completed before implementation)

- [x] Read slide 31 and apply slides 2, 3, 5, and 29.
- [x] Define status, task snapshot, controller API, transitions, FIFO rules, cancellation, and resource ownership in `project-rules.md`.
- [x] Split work into the atomic tasks below.

## Stage 2 — Atomic implementation tasks

- [ ] Scaffold Vite + React + strict TypeScript, scripts, and baseline styles. Commit: `chore: scaffold strict React and Vite app`.
- [ ] Implement task contracts, error helpers, task settlement, queue workers, FIFO playback cursor, cancellation, stop, and disposal. Commit: `feat(queue): add concurrent FIFO audio controller`.
- [ ] Add deterministic controller tests and fix race conditions discovered by them. Commit: `test(queue): cover concurrency and lifecycle races`.
- [ ] Implement Canvas visualizer with reusable frequency buffer, RAF lifecycle, resize handling, and no frame-driven React state. Commit: `feat(visualizer): add RAF canvas frequency display`.
- [ ] Generate and include two short local WAV fixtures; add accessible React demo controls, queue status, errors, and StrictMode lifecycle. Commit: `feat(demo): add local audio queue player`.
- [ ] Verify browser playback and capture timestamp-based frame measurements; record actual test/build/browser evidence and three reproduced AI defects in README and `AI_FAILURE_AUDIT.md`. Commit: `docs: record verification and AI failure audit`.

## Stage 3 — Independent verification checklist

- [ ] Enqueue multiple tasks at once; prove no more than two fetch/decode pipelines are active.
- [ ] Reverse completion order with deferred doubles; prove FIFO playback order.
- [ ] Cancel queued, downloading, decoding, and ready tasks; prove no cancelled task can later play or revive its status.
- [ ] Exercise HTTP failure, decode rejection, playback start/end failure, and confirm later tasks continue.
- [ ] Resolve decode/fetch callbacks after cancellation and after disposal; prove one promise settlement and no stale updates.
- [ ] Call dispose twice and exercise React StrictMode setup/cleanup.
- [ ] Run typecheck, test suite, and production build.
- [ ] Use the real browser and local WAV samples to verify Web Audio graph and controls; measure RAF timestamps and state environment/sample statistics.
- [ ] Inspect Git diff/status and confirm `node_modules`, `dist`, and secrets are absent.

## Stage 4 — Delivery

- [ ] Push the `main` branch and its Conventional Commit history to `24521450/MSIS207.R11.CTTT.Week2.HW2`.
- [ ] Report repository URL, checks actually passed, performance measurements, and criteria still unverified.

## Verification log

No implementation or verification result is claimed yet. Entries will be added only after the corresponding commands/browser checks have run.
