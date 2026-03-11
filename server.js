const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dp3doruvr',
  api_key: process.env.CLOUDINARY_API_KEY || 'CLOUDINARY_API_KEY_REMOVED',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'CLOUDINARY_API_SECRET_REMOVED',
});

const app = express();
const db = new Database('notes.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Başlıksız Not',
    content TEXT DEFAULT '',
    category TEXT DEFAULT '',
    color TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    public_id TEXT NOT NULL,
    url TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  )
`);

try { db.exec(`ALTER TABLE notes ADD COLUMN category TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE notes ADD COLUMN color TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE attachments ADD COLUMN public_id TEXT NOT NULL DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE attachments ADD COLUMN url TEXT NOT NULL DEFAULT ''`); } catch(e) {}

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'notepad-attachments',
    resource_type: 'raw',
    public_id: Date.now() + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/\s+/g, '_'),
  }),
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/notes', (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || '';
  let query = 'SELECT * FROM notes WHERE 1=1';
  const params = [];
  if (search) {
    query += ' AND (title LIKE ? OR content LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY updated_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/notes/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
  res.json(note);
});

app.post('/api/notes', (req, res) => {
  const { title, content, category, color } = req.body;
  const result = db.prepare(`
    INSERT INTO notes (title, content, category, color) VALUES (?, ?, ?, ?)
  `).run(title || 'Başlıksız Not', content || '', category || '', color || '');
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/notes/:id', (req, res) => {
  const { title, content, category, color } = req.body;
  db.prepare(`
    UPDATE notes SET title = ?, content = ?, category = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(title, content, category || '', color || '', req.params.id);
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

app.delete('/api/notes/:id', async (req, res) => {
  const attachments = db.prepare('SELECT public_id FROM attachments WHERE note_id = ?').all(req.params.id);
  for (const a of attachments) {
    try { await cloudinary.uploader.destroy(a.public_id, { resource_type: 'raw' }); } catch(e) {}
  }
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/categories', (req, res) => {
  const cats = db.prepare(`SELECT DISTINCT category FROM notes WHERE category != '' ORDER BY category`).all();
  res.json(cats.map(c => c.category));
});

app.get('/api/notes/:id/attachments', (req, res) => {
  const attachments = db.prepare('SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(attachments);
});

app.post('/api/notes/:id/attachments', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' });
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const result = db.prepare(`
    INSERT INTO attachments (note_id, public_id, url, original_name) VALUES (?, ?, ?, ?)
  `).run(req.params.id, req.file.filename, req.file.path, originalName);
  res.json(db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/attachments/:id', async (req, res) => {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Bulunamadı' });
  try { await cloudinary.uploader.destroy(attachment.public_id, { resource_type: 'raw' }); } catch(e) {}
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
