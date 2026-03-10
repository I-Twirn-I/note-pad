const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const db = new Database('notes.db');

// Uploads klasörü
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

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
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  )
`);

try { db.exec(`ALTER TABLE notes ADD COLUMN category TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE notes ADD COLUMN color TEXT DEFAULT ''`); } catch(e) {}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

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

app.delete('/api/notes/:id', (req, res) => {
  // Ekleri de sil
  const attachments = db.prepare('SELECT filename FROM attachments WHERE note_id = ?').all(req.params.id);
  attachments.forEach(a => {
    const filePath = path.join(uploadsDir, a.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/categories', (req, res) => {
  const cats = db.prepare(`SELECT DISTINCT category FROM notes WHERE category != '' ORDER BY category`).all();
  res.json(cats.map(c => c.category));
});

// Ekleri getir
app.get('/api/notes/:id/attachments', (req, res) => {
  const attachments = db.prepare('SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(attachments);
});

// Dosya yükle
app.post('/api/notes/:id/attachments', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' });
  const result = db.prepare(`
    INSERT INTO attachments (note_id, filename, original_name) VALUES (?, ?, ?)
  `).run(req.params.id, req.file.filename, req.file.originalname);
  res.json(db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid));
});

// Ek sil
app.delete('/api/attachments/:id', (req, res) => {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Bulunamadı' });
  const filePath = path.join(uploadsDir, attachment.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
