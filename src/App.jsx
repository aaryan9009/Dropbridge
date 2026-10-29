import { useEffect, useRef, useState, useCallback } from 'react'

const fmtSize = b =>
  b < 1024
    ? b + ' B'
    : b < 1048576
      ? (b / 1024).toFixed(1) + ' KB'
      : b < 1073741824
        ? (b / 1048576).toFixed(1) + ' MB'
        : (b / 1073741824).toFixed(2) + ' GB'

const ago = ts => {
  const s = (Date.now() - ts) / 1000
  return s < 60
    ? 'just now'
    : s < 3600
      ? Math.floor(s / 60) + ' min ago'
      : s < 86400
        ? Math.floor(s / 3600) + ' h ago'
        : new Date(ts).toLocaleDateString()
}

const icon = it => {
  const n = (it.name || '').toLowerCase()
  const t = it.type || ''

  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return '🖼️'
  if (n.endsWith('.pdf')) return '📕'
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return '🗜️'
  if (t.startsWith('video/')) return '🎬'
  if (t.startsWith('audio/')) return '🎵'

  return '📄'
}

export default function App() {
  const [pass, setPass] = useState(() => localStorage.getItem('db_pass') || '')
  const [locked, setLocked] = useState(false)
  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [staged, setStaged] = useState([])
  const [progress, setProgress] = useState(null)
  const [toastMsg, setToast] = useState('')
  const [over, setOver] = useState(false)
  const [sure, setSure] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  const fileRef = useRef(null)
  const tt = useRef(null)

  const toast = useCallback(message => {
    setToast(message)
    clearTimeout(tt.current)
    tt.current = setTimeout(() => setToast(''), 4000)
  }, [])

  const headers = pass ? { 'x-pass': pass } : {}
  const q = pass ? `key=${encodeURIComponent(pass)}` : ''

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/items', {
        headers: pass ? { 'x-pass': pass } : {},
      })

      if (response.status === 401) {
        setLocked(true)
        return
      }

      if (!response.ok) {
        throw new Error(`Could not load items: HTTP ${response.status}`)
      }

      const data = await response.json()
      setItems(Array.isArray(data) ? data : [])
      setLocked(false)
    } catch (error) {
      console.error('Load items error:', error)
    }
  }, [pass])

  useEffect(() => {
    load()

    const interval = setInterval(load, 4000)

    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    const onPaste = event => {
      const files = [...(event.clipboardData?.files || [])]

      if (files.length) {
        setStaged(current => [...current, ...files])
        toast(`${files.length} file(s) added`)
      }
    }

    document.addEventListener('paste', onPaste)

    return () => document.removeEventListener('paste', onPaste)
  }, [toast])

  // Uploads the raw file body, matching the existing Express PUT /api/upload route.
  const upload = file =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      const params = new URLSearchParams({
        name: file.name,
        type: file.type || 'application/octet-stream',
      })

      xhr.open('PUT', `/api/upload?${params.toString()}`)
      xhr.timeout = 0

      if (pass) {
        xhr.setRequestHeader('x-pass', pass)
      }

      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          setProgress({
            name: file.name,
            pct: Math.round((event.loaded / event.total) * 100),
          })
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            reject(new Error('Server returned an invalid upload response'))
          }

          return
        }

        let message = xhr.responseText || 'Unknown server error'

        try {
          const result = JSON.parse(xhr.responseText)
          message = result.error || message
        } catch {
          // Keep the original response text.
        }

        if (xhr.status === 401) {
          reject(new Error('Incorrect or missing access password'))
        } else {
          reject(new Error(`Upload failed (HTTP ${xhr.status}): ${message}`))
        }
      }

      xhr.onerror = () => {
        reject(
          new Error('Network error. Check the Render server logs and Network tab.')
        )
      }

      xhr.onabort = () => {
        reject(new Error('Upload was cancelled'))
      }

      xhr.ontimeout = () => {
        reject(new Error('Upload timed out. Please try again.'))
      }

      xhr.send(file)
    })

  const send = async () => {
    if (!text.trim() && staged.length === 0) return

    try {
      if (text.trim()) {
        const response = await fetch('/api/text', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        })

        if (!response.ok) {
          let message = `HTTP ${response.status}`

          try {
            const result = await response.json()
            message = result.error || message
          } catch {}

          throw new Error(`Text send failed: ${message}`)
        }
      }

      for (const file of staged) {
        setProgress({ name: file.name, pct: 0 })
        await upload(file)
      }

      setText('')
      setStaged([])
      toast('Sent! Open this link on any device 🎉')
    } catch (error) {
      console.error('Send/upload error:', error)
      toast(`Failed: ${error.message}`)
    } finally {
      setProgress(null)
      load()
    }
  }

  const del = async item => {
    if (sure !== item.id) {
      setSure(item.id)
      toast('Tap again to delete')

      setTimeout(() => {
        setSure(current => (current === item.id ? null : current))
      }, 2500)

      return
    }

    setRemoving(item.id)
    setSure(null)

    setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/items/${encodeURIComponent(item.id)}`,
          {
            method: 'DELETE',
            headers,
          }
        )

        if (!response.ok) {
          throw new Error(`Delete failed: HTTP ${response.status}`)
        }

        toast('Deleted 🗑️')
      } catch (error) {
        toast(error.message)
      } finally {
        setRemoving(null)
        load()
      }
    }, 380)
  }

  const login = event => {
    event.preventDefault()

    const value = new FormData(event.currentTarget).get('p')?.toString() || ''

    localStorage.setItem('db_pass', value)
    setPass(value)
    setLocked(false)
  }

  const addFiles = fileList => {
    const files = [...(fileList || [])]

    if (!files.length) return

    setStaged(current => [...current, ...files])
    toast(`${files.length} file(s) added`)
  }

  const canSend = Boolean(text.trim() || staged.length) && !progress

  if (locked) {
    return (
      <main>
        <div className="blob b1" />
        <div className="blob b2" />

        <form className="glass composer lock" onSubmit={login}>
          <div className="logo">
            <span>🔒</span> DropBridge
          </div>

          <input
            name="p"
            type="password"
            placeholder="Enter password"
            autoFocus
            required
          />

          {pass && <div className="err">Password required. Please try again.</div>}

          <button className="primary" type="submit">
            Unlock
          </button>
        </form>

        <div className="toast">{toastMsg}</div>
      </main>
    )
  }

  return (
    <>
      <div className="blob b1" />
      <div className="blob b2" />

      <main>
        <header>
          <div className="logo">
            <span>🌉</span> DropBridge
          </div>

          <p>Send notes &amp; files from your phone — grab them on any device.</p>
        </header>

        <div className="layout">
          <div className="left">
            <section className="glass composer">
              <textarea
                value={text}
                onChange={event => setText(event.target.value)}
                placeholder="Type or paste a text message…"
              />

              <div
                className={'drop' + (over ? ' over' : '')}
                onClick={() => fileRef.current?.click()}
                onDragOver={event => {
                  event.preventDefault()
                  setOver(true)
                }}
                onDragLeave={() => setOver(false)}
                onDrop={event => {
                  event.preventDefault()
                  setOver(false)
                  addFiles(event.dataTransfer.files)
                }}
              >
                <span className="ic">📎</span>
                <div>
                  <b>Tap to attach</b> or drop files here
                </div>
                <small>Images, PDF, ZIP &amp; more</small>
              </div>

              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={event => {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />

              <div className="staged">
                {staged.map((file, index) => (
                  <div className="chip" key={`${file.name}-${index}`}>
                    {icon({ name: file.name, type: file.type })}{' '}
                    {file.name} · {fmtSize(file.size)}

                    <b
                      role="button"
                      tabIndex={0}
                      title="Remove file"
                      onClick={() =>
                        setStaged(current =>
                          current.filter((_, i) => i !== index)
                        )
                      }
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setStaged(current =>
                            current.filter((_, i) => i !== index)
                          )
                        }
                      }}
                    >
                      ✕
                    </b>
                  </div>
                ))}
              </div>

              {progress && (
                <div className="prog">
                  <div>
                    Uploading {progress.name} — {progress.pct}%
                  </div>

                  <div className="bar">
                    <i style={{ width: `${progress.pct}%` }} />
                  </div>
                </div>
              )}

              <div className="row">
                <button
                  className="primary"
                  type="button"
                  disabled={!canSend}
                  onClick={send}
                >
                  {progress ? 'Uploading…' : 'Send ✨'}
                </button>

                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    const root = document.documentElement
                    const dark = root.dataset.theme
                      ? root.dataset.theme === 'dark'
                      : matchMedia('(prefers-color-scheme: dark)').matches

                    root.dataset.theme = dark ? 'light' : 'dark'
                  }}
                >
                  🌓
                </button>
              </div>
            </section>
          </div>

          <div className="right">
            <div className="head">
              <h2>Your drop zone</h2>

              <span className="count">
                {items.length
                  ? `${items.length} item${items.length > 1 ? 's' : ''}`
                  : ''}
              </span>
            </div>

            <div className="list">
              {!items.length && (
                <div className="empty">
                  <span className="ic">🫧</span>
                  Nothing here yet.
                  <br />
                  Add a note or file above.
                </div>
              )}

              {items.map((item, index) => {
                const isImage =
                  item.kind === 'file' &&
                  (item.type || '').startsWith('image/')

                const fileUrl = `/api/files/${encodeURIComponent(item.id)}`
                const src = `${fileUrl}?inline=1${q ? `&${q}` : ''}`

                return (
                  <div
                    key={item.id}
                    className={
                      'glass item' + (removing === item.id ? ' out' : '')
                    }
                    style={{
                      animationDelay: `${Math.min(index * 60, 400)}ms`,
                    }}
                  >
                    <div className="thumb">
                      {isImage ? (
                        <img
                          src={src}
                          alt={item.name || 'Uploaded image'}
                          loading="lazy"
                          onClick={() => setLightbox(src)}
                          onError={event => {
                            event.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : item.kind === 'text' ? (
                        '💬'
                      ) : (
                        icon(item)
                      )}
                    </div>

                    <div className="info">
                      {item.kind === 'text' ? (
                        <>
                          <div className="name">💬 Message</div>
                          <div className="note">{item.text}</div>
                        </>
                      ) : (
                        <div className="name">{item.name}</div>
                      )}

                      <div className="meta">
                        {item.kind === 'file' && `${fmtSize(item.bytes)} · `}
                        {ago(item.createdAt)}
                      </div>
                    </div>

                    <div className="acts">
                      {item.kind === 'text' ? (
                        <button
                          type="button"
                          title="Copy"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(item.text)
                              .then(() => toast('Copied 📋'))
                              .catch(() => toast('Could not copy text'))
                          }
                        >
                          📋
                        </button>
                      ) : (
                        <a
                          title="Download"
                          href={`${fileUrl}${q ? `?${q}` : ''}`}
                          download={item.name}
                        >
                          ⬇️
                        </a>
                      )}

                      <button
                        type="button"
                        className="del"
                        title="Delete"
                        onClick={() => del(item)}
                      >
                        {sure === item.id ? '❓' : '🗑️'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>

      <div className={'toast' + (toastMsg ? ' show' : '')}>
        {toastMsg}
      </div>

      {lightbox && (
        <div className="lb" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </>
  )
}
