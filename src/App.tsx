import { useEffect, useRef, useState } from 'react'
import { AudioTaskQueue } from './audio/audio-task-queue.ts'
import { CanvasVisualizer } from './audio/canvas-visualizer.ts'
import { describeAudioError } from './audio/audio-errors.ts'
import type { AudioTaskSnapshot } from './audio/types.ts'
import './App.css'

const statusLabels: Record<AudioTaskSnapshot['status'], string> = {
  queued: 'Đang chờ',
  downloading: 'Đang tải',
  decoding: 'Đang giải mã',
  ready: 'Sẵn sàng',
  playing: 'Đang phát',
  completed: 'Đã phát xong',
  cancelled: 'Đã hủy',
  error: 'Lỗi',
}

const cancellableStatuses = new Set<AudioTaskSnapshot['status']>([
  'queued',
  'downloading',
  'decoding',
  'ready',
  'playing',
])

function App() {
  const mainRef = useRef<HTMLElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const queueRef = useRef<AudioTaskQueue | null>(null)
  const visualizerRef = useRef<CanvasVisualizer | null>(null)
  const [tasks, setTasks] = useState<readonly AudioTaskSnapshot[]>([])
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    const queue = new AudioTaskQueue()
    queueRef.current = queue
    const unsubscribe = queue.subscribe(setTasks)

    return () => {
      unsubscribe()
      if (queueRef.current === queue) {
        queueRef.current = null
      }
      void queue.dispose().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const visualizer = new CanvasVisualizer(canvas)
    visualizerRef.current = visualizer
    return () => {
      if (visualizerRef.current === visualizer) {
        visualizerRef.current = null
      }
      visualizer.dispose()
    }
  }, [])

  useEffect(() => {
    const hasActivePlayback = tasks.some((task) => task.status === 'playing')
    const analyser = hasActivePlayback ? queueRef.current?.getAnalyser() ?? null : null
    visualizerRef.current?.setAnalyser(analyser)
  }, [tasks])

  useEffect(() => {
    const root = mainRef.current
    if (!root) {
      return
    }

    const addTrack = (trackUrl: string): void => {
      const queue = queueRef.current
      if (!queue) {
        setActionError('Hàng đợi âm thanh chưa sẵn sàng. Vui lòng thử lại.')
        return
      }
      setActionError('')
      void queue.enqueue(trackUrl).catch(() => undefined)
    }

    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) {
        return
      }
      const button = event.target.closest<HTMLButtonElement>('button[data-action]')
      if (!button || !root.contains(button) || button.disabled) {
        return
      }

      const action = button.dataset.action
      if (action === 'add-sample') {
        const trackUrl = button.dataset.trackUrl
        if (trackUrl) {
          addTrack(trackUrl)
        }
        return
      }

      if (action === 'cancel') {
        const taskId = Number(button.dataset.taskId)
        if (Number.isSafeInteger(taskId)) {
          queueRef.current?.cancelTask(taskId)
        }
        return
      }

      if (action === 'play') {
        const queue = queueRef.current
        if (!queue) {
          return
        }
        setActionError('')
        void queue.startPlayback().catch((error: unknown) => {
          setActionError(`Không thể bắt đầu phát: ${describeAudioError(error)}`)
        })
        return
      }

      if (action === 'stop') {
        queueRef.current?.stopPlayback()
        setActionError('')
      }
    }

    const onSubmit = (event: SubmitEvent): void => {
      if (!(event.target instanceof HTMLFormElement) || event.target.dataset.action !== 'enqueue-url') {
        return
      }
      event.preventDefault()
      const form = event.target
      const formData = new FormData(form)
      const trackUrl = String(formData.get('trackUrl') ?? '').trim()
      if (trackUrl) {
        addTrack(trackUrl)
        form.reset()
      }
    }

    root.addEventListener('click', onClick)
    root.addEventListener('submit', onSubmit)
    return () => {
      root.removeEventListener('click', onClick)
      root.removeEventListener('submit', onSubmit)
    }
  }, [])

  const hasPlayableTasks = tasks.some((task) => cancellableStatuses.has(task.status))
  const isPlaying = tasks.some((task) => task.status === 'playing')

  return (
    <main className="app-shell" ref={mainRef}>
      <header className="page-header">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">MSIS207.R11.CTTT <span>·</span> HOMEWORK 02</p>
        <h1>Âm thanh theo hàng đợi.</h1>
        <p className="intro">
          FIFO audio queue với tải đồng thời, giải mã an toàn và phổ tần Web Audio.
        </p>
      </header>

      <section className="player-card" aria-labelledby="player-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">INPUT</p>
            <h2 id="player-title">Thêm âm thanh</h2>
          </div>
          <span className="limit-pill"><span aria-hidden="true" /> Tối đa 2 tác vụ cùng lúc</span>
        </div>

        <form className="url-form" data-action="enqueue-url">
          <label htmlFor="audio-url">URL audio</label>
          <div className="input-row">
            <input
              id="audio-url"
              name="trackUrl"
              type="url"
              placeholder="https://example.com/audio.wav"
              autoComplete="url"
              required
            />
            <button className="button button-primary" type="submit">
              <span aria-hidden="true">＋</span> Thêm vào queue
            </button>
          </div>
        </form>

        <div className="sample-row">
          <p>Mẫu WAV cục bộ</p>
          <button
            className="button button-quiet"
            type="button"
            data-action="add-sample"
            data-track-url="/samples/soft-pulse.wav"
          >
            <span className="sample-dot sample-dot-green" aria-hidden="true" /> Soft Pulse · 440 Hz
          </button>
          <button
            className="button button-quiet"
            type="button"
            data-action="add-sample"
            data-track-url="/samples/bright-wave.wav"
          >
            <span className="sample-dot sample-dot-blue" aria-hidden="true" /> Bright Wave · 523 Hz
          </button>
        </div>

        <div className="player-divider" />

        <div className="player-controls">
          <div className="playback-buttons" aria-label="Điều khiển phát">
            <button
              className="button button-play"
              type="button"
              data-action="play"
              disabled={!hasPlayableTasks || isPlaying}
              aria-label="Phát hàng đợi theo thứ tự FIFO"
            >
              <span aria-hidden="true">▶</span> Phát hàng đợi
            </button>
            <button
              className="button button-stop"
              type="button"
              data-action="stop"
              disabled={!isPlaying}
              aria-label="Dừng phát và giữ lại tác vụ hiện tại để phát lại"
            >
              <span aria-hidden="true">■</span> Dừng
            </button>
          </div>
          <p className="gesture-note">AudioContext chỉ được resume sau khi bạn nhấn Phát.</p>
        </div>

        <figure className={`visualizer${isPlaying ? ' is-active' : ''}`}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Visualizer phổ tần âm thanh trực tiếp, gồm 256 dải tần"
          >
            Visualizer audio cần trình duyệt hỗ trợ Canvas.
          </canvas>
          <figcaption>
            <span><span className="live-dot" aria-hidden="true" /> FREQUENCY SPECTRUM</span>
            <span>FFT 512 <i>·</i> 256 bins</span>
          </figcaption>
        </figure>

        {actionError ? <p className="action-error" role="alert">{actionError}</p> : null}
      </section>

      <section className="queue-section" aria-labelledby="queue-title">
        <div className="section-heading queue-heading">
          <div>
            <p className="section-kicker">PLAYBACK ORDER</p>
            <h2 id="queue-title">Hàng đợi audio</h2>
          </div>
          <span className="task-count" aria-label={`${tasks.length} tác vụ trong hàng đợi`}>
            {String(tasks.length).padStart(2, '0')} <span>TÁC VỤ</span>
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-wave" aria-hidden="true">〰</span>
            <p>Hàng đợi đang trống</p>
            <span>Thêm URL audio hoặc chọn một mẫu WAV để bắt đầu.</span>
          </div>
        ) : (
          <ol className="queue-list" aria-label="Tác vụ theo thứ tự FIFO">
            {tasks.map((task) => (
              <li className={`queue-task task-${task.status}`} key={task.id}>
                <span className="task-order">{String(task.order).padStart(2, '0')}</span>
                <div className="task-main">
                  <div className="task-title-row">
                    <span className="task-name" title={task.trackUrl}>{task.trackUrl}</span>
                    <span className={`status-chip status-${task.status}`} aria-live="polite" aria-atomic="true">
                      <span aria-hidden="true" /> {statusLabels[task.status]}
                    </span>
                  </div>
                  {task.error ? <p className="task-error">{task.error}</p> : null}
                </div>
                {cancellableStatuses.has(task.status) ? (
                  <button
                    className="button button-cancel"
                    type="button"
                    data-action="cancel"
                    data-task-id={task.id}
                    aria-label={`Hủy tác vụ ${task.order}: ${task.trackUrl}`}
                  >
                    Hủy
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="page-footer">
        <span>WEB AUDIO API <i>·</i> CANVAS RAF</span>
        <span>QUEUE CONCURRENCY <strong>02</strong></span>
      </footer>
    </main>
  )
}

export default App
