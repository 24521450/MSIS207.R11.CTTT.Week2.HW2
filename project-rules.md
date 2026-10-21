# Project Rules — MSIS207.R11.CTTT HW2

## Scope and source

- Implement only the HW2 deliverable from slide 31 of `Lab-02-Modern-React-Architecture-Virtual-DOM-State-Machines.md`: a concurrent FIFO audio queue, playback controller, and canvas frequency visualizer.
- Apply slides 2, 3, 5, and 29: contract-first work; small functional slices; independent verification; modern JavaScript; and an evidence-based AI failure audit.
- Keep the project self-contained. Do not add accounts, backend services, library browsing, uploads, playlist persistence, or website deployment.

## Stack and code rules

- React + TypeScript in strict mode, Vite, and plain CSS.
- Use `const`/`let`; no `var`, implicit globals, `innerHTML`, inline event handlers, or `any`.
- Use semantic HTML controls with accessible names, visible keyboard focus, and status announcements.
- Keep each module focused: contracts, queue/controller, visualizer, UI, and tests.
- Do not update React state from the animation frame callback. Keep audio nodes, RAF ID, frame buffer, and canvas drawing state in class fields or refs.

## Type contract (defined before implementation)

- `AudioTaskStatus`: `queued | downloading | decoding | ready | playing | completed | cancelled | error`.
- `AudioTask`: stable increasing `id` and `order`, source URL, status, optional readable error, and per-task cancellation controller internally. UI receives immutable snapshots, never mutable controller internals.
- `AudioQueueController` public API:
  - `enqueue(trackUrl: string): Promise<AudioBuffer>` (resolves once decoding succeeds; rejects once on pre-ready error/cancellation/disposal).
  - `cancelTask(taskId: number): boolean` (cancels queued/downloading/decoding work and skips ready work in the playback order; returns false after settlement into a terminal state or for an unknown task).
  - `startPlayback(): Promise<void>` (called from a user gesture; resumes the suspended context, then drains playable tracks in enqueue order).
  - `stopPlayback(): void` (stops the current source and pauses queue playback; a manually stopped item returns to `ready` and can be replayed).
  - `getTasks(): readonly AudioTaskSnapshot[]`, `subscribe(listener): unsubscribe`, and idempotent `dispose(): void`.
- Work is FIFO at dequeue and has a fixed maximum of two active fetch/decode pipelines. Ready playback is independently gated by `order`, so later work cannot play before earlier work. Cancelled and failed items are skipped.
- Every task gets its own `AbortController`. Fetch receives its signal. Decode has no abort signal; completion must re-check task identity/status/disposal before committing its result.
- Each task promise has one settlement guard. Cancellation after decode cannot change the already-resolved promise.

## Audio and resource lifecycle

- Construct audio resources lazily in response to user-driven queue work; do not resume/start the context until the explicit Play action.
- Decode through `AudioContext`; use one `AnalyserNode` with `fftSize = 512` (256 frequency bins). Each playback uses a fresh `AudioBufferSourceNode`.
- Natural end marks `completed`; explicit stop returns the active task to `ready`; playback errors mark `error` and permit the next task to proceed.
- Dispose aborts all fetches, settles pending promises once, stops and disconnects the active source, removes owned listeners, cancels RAF, disconnects graph nodes, and closes the context. Late async results after disposal are ignored. Repeated disposal is safe.
- React effects must clean up the controller and visualizer so React StrictMode's setup/cleanup replay leaves no live resources.

## Verification and evidence

- Use deterministic test doubles for worker concurrency, out-of-order decode completion, cancellation in each phase, fetch/decode failure, continued work, late callbacks after disposal, and repeated cleanup.
- Exercise actual Web Audio in a browser with the two locally generated WAV samples. Report browser/OS, observed result, and any limitations.
- Measure visualizer frame timestamps during a real browser session. Report sample count and observed interval statistics; do not claim 60 FPS or absence of leaks without evidence.
- Run typecheck, relevant tests, and a production build. Record only checks actually run.
- Maintain `AI_FAILURE_AUDIT.md` with at least three actual AI-generated implementation defects, each supported by reproduction steps, evidence, and the fix. Do not invent prior bugs or test outcomes.
- Keep generated `node_modules`, `dist`, credentials, and secrets out of Git.
