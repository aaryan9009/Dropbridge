import 'dotenv/config'
import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const PASSWORD = process.env.ACCESS_PASSWORD || '' // optional: set to protect your drop zone
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
const FILES = path.join(DATA, 'files')
const DB = path.join(DATA, 'db.json')
fs.mkdirSync(FILES, { recursive: true })

let items = []
try { items = JSON.parse(fs.readFileSync(DB, 'utf8')) } catch {}
const save = () => fs.writeFileSync(DB, JSON.stringify(items, null, 2))

const app = express()
app.use('/api', (req, res, next) => {
  if (!PASSWORD) return next()
  const key = req.get('x-pass') || req.query.key
  if (key === PASSWORD) return next()
  res.status(401).json({ error: 'password required' })
})

app.get('/api/items', (_req, res) => res.json([...items].sort((a, b) => b.createdAt - a.createdAt)))

app.post('/api/text', express.json({ limit: '1mb' }), (req, res) => {
  const text = String(req.body?.text || '').trim()
  if (!text) return res.status(400).json({ error: 'empty' })
  const item = { id: crypto.randomUUID(), kind: 'text', text, createdAt: Date.now() }
  items.push(item); save(); res.json(item)
})

// Streams the raw request body straight to disk -> no file size limit
app.put('/api/upload', (req, res) => {
  const id = crypto.randomUUID()
  const name = String(req.query.name || 'file').replace(/[\\/]/g, '_')
  const out = fs.createWriteStream(path.join(FILES, id))
  req.pipe(out)
  out.on('finish', () => {
    const item = { id, kind: 'file', name, type: String(req.query.type || ''), bytes: out.bytesWritten, createdAt: Date.now() }
    items.push(item); save(); res.json(item)
  })
  const fail = () => { out.destroy(); fs.rm(path.join(FILES, id), () => {}) }
  req.on('aborted', fail)
  out.on('error', () => { fail(); res.status(500).json({ error: 'write failed' }) })
})

app.get('/api/files/:id', (req, res) => {
  const it = items.find(i => i.id === req.params.id && i.kind === 'file')
  if (!it) return res.status(404).end()
  res.setHeader('Content-Type', it.type || 'application/octet-stream')
  res.setHeader('Content-Length', it.bytes)
  const disp = req.query.inline ? 'inline' : 'attachment'
  res.setHeader('Content-Disposition', `${disp}; filename*=UTF-8''${encodeURIComponent(it.name)}`)
  fs.createReadStream(path.join(FILES, it.id)).pipe(res)
})

app.delete('/api/items/:id', (req, res) => {
  const it = items.find(i => i.id === req.params.id)
  if (!it) return res.status(404).end()
  items = items.filter(i => i.id !== it.id); save()
  if (it.kind === 'file') fs.rm(path.join(FILES, it.id), () => {})
  res.json({ deleted: true })
})

const dist = path.join(__dirname, '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const server = app.listen(PORT, '0.0.0.0', () => console.log(`DropBridge running on http://localhost:${PORT}`))
server.requestTimeout = 0 // allow very long uploads
server.timeout = 0
