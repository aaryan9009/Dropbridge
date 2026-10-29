import { useEffect, useRef, useState, useCallback } from 'react'

const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB'
const ago = ts => { const s = (Date.now() - ts) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : new Date(ts).toLocaleDateString() }
const icon = it => { const n = (it.name || '').toLowerCase(), t = it.type || ''
  if (t.startsWith('image/')) return '🖼️'; if (n.endsWith('.pdf')) return '📕'
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return '🗜️'; if (t.startsWith('video/')) return '🎬'; if (t.startsWith('audio/')) return '🎵'; return '📄' }

export default function App() {
  const [pass, setPass] = useState(localStorage.getItem('db_pass') || '')
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
  const fileRef = useRef()
  const tt = useRef()

  const toast = m => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(''), 2600) }
  const q = pass ? `key=${encodeURIComponent(pass)}` : ''
  const headers = pass ? { 'x-pass': pass } : {}

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/items', { headers })
      if (r.status === 401) { setLocked(true); return }
      setLocked(false); setItems(await r.json())
    } catch {}
  }, [pass])

  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])
  useEffect(() => {
    const onPaste = e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) setStaged(s => [...s, ...f]) }
    document.addEventListener('paste', onPaste); return () => document.removeEventListener('paste', onPaste)
  }, [])

  const upload = f => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('PUT', `/api/upload?name=${encodeURIComponent(f.name)}&type=${encodeURIComponent(f.type || '')}`)
    if (pass) x.setRequestHeader('x-pass', pass)
    x.upload.onprogress = e => e.lengthComputable && setProgress({ name: f.name, pct: Math.round(e.loaded / e.total * 100) })
    x.onload = () => x.status < 300 ? resolve() : reject(new Error('upload failed'))
    x.onerror = () => reject(new Error('network error'))
    x.send(f)
  })

  const send = async () => {
    try {
      if (text.trim()) await fetch('/api/text', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      for (const f of staged) await upload(f)
      setText(''); setStaged([]); toast('Sent! Open this link on any device 🎉')
    } catch (e) { toast('Failed: ' + e.message) }
    setProgress(null); load()
  }

  const del = async it => {
    if (sure !== it.id) { setSure(it.id); toast('Tap again to delete'); setTimeout(() => setSure(s => s === it.id ? null : s), 2500); return }
    setRemoving(it.id); setSure(null)
    setTimeout(async () => { await fetch('/api/items/' + it.id, { method: 'DELETE', headers }); setRemoving(null); load(); toast('Deleted 🗑️') }, 380)
  }

  const login = e => { e.preventDefault(); const v = new FormData(e.target).get('p'); localStorage.setItem('db_pass', v); setPass(v) }

  if (locked) return (
    <main><div className="blob b1" /><div className="blob b2" />
      <form className="glass composer lock" onSubmit={login}>
        <div className="logo"><span>🔒</span> DropBridge</div>
        <input name="p" type="password" placeholder="Enter password" autoFocus />
        {pass && <div className="err">Wrong password, try again</div>}
        <button className="primary">Unlock</button>
      </form></main>)

  const canSend = (text.trim() || staged.length) && !progress

  return (
    <>
      <div className="blob b1" /><div className="blob b2" />
      <main>
        <header>
          <div className="logo"><span>🌉</span> DropBridge</div>
          <p>Send notes &amp; files from your phone — grab them on any device.</p>
        </header>

        <div className="layout"><div className="left"><section className="glass composer">
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type or paste a text message…" />
          <div className={'drop' + (over ? ' over' : '')} onClick={() => fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); setStaged(s => [...s, ...e.dataTransfer.files]) }}>
            <span className="ic">📎</span>
            <div><b>Tap to attach</b> or drop files here</div>
            <small>Images, PDF, ZIP &amp; more · any size</small>
          </div>
          <input ref={fileRef} type="file" multiple hidden onChange={e => { setStaged(s => [...s, ...e.target.files]); e.target.value = '' }} />
          <div className="staged">
            {staged.map((f, i) => (
              <div className="chip" key={i}>{icon({ name: f.name, type: f.type })} {f.name} · {fmtSize(f.size)}
                <b onClick={() => setStaged(s => s.filter((_, k) => k !== i))}>✕</b></div>))}
          </div>
          {progress && <div className="prog"><div>{progress.name} — {progress.pct}%</div><div className="bar"><i style={{ width: progress.pct + '%' }} /></div></div>}
          <div className="row">
            <button className="primary" disabled={!canSend} onClick={send}>{progress ? 'Uploading…' : 'Send ✨'}</button>
            <button className="ghost" onClick={() => { const r = document.documentElement; const d = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches; r.dataset.theme = d ? 'light' : 'dark' }}>🌓</button>
          </div>
        </section></div>

        <div className="right"><div className="head"><h2>Your drop zone</h2><span className="count">{items.length ? items.length + ' item' + (items.length > 1 ? 's' : '') : ''}</span></div>
        <div className="list">
          {!items.length && <div className="empty"><span className="ic">🫧</span>Nothing here yet.<br />Add a note or file above.</div>}
          {items.map((it, i) => {
            const isImg = it.kind === 'file' && (it.type || '').startsWith('image/')
            const src = `/api/files/${it.id}?inline=1&${q}`
            return (
              <div key={it.id} className={'glass item' + (removing === it.id ? ' out' : '')} style={{ animationDelay: Math.min(i * 60, 400) + 'ms' }}>
                <div className="thumb">{isImg ? <img src={src} alt="" loading="lazy" onClick={() => setLightbox(src)} /> : it.kind === 'text' ? '💬' : icon(it)}</div>
                <div className="info">
                  {it.kind === 'text'
                    ? <><div className="name">💬 Message</div><div className="note">{it.text}</div></>
                    : <div className="name">{it.name}</div>}
                  <div className="meta">{it.kind === 'file' && fmtSize(it.bytes) + ' · '}{ago(it.createdAt)}</div>
                </div>
                <div className="acts">
                  {it.kind === 'text'
                    ? <button title="Copy" onClick={() => navigator.clipboard.writeText(it.text).then(() => toast('Copied 📋'))}>📋</button>
                    : <a title="Download" href={`/api/files/${it.id}?${q}`} download={it.name}>⬇️</a>}
                  <button className="del" title="Delete" onClick={() => del(it)}>{sure === it.id ? '❓' : '🗑️'}</button>
                </div>
              </div>)
          })}
        </div></div></div>
      </main>
      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>
      {lightbox && <div className="lb" onClick={() => setLightbox(null)}><img src={lightbox} alt="" /></div>}
    </>
  )
}
