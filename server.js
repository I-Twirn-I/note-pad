const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database('notes.db');

// Veritabanı tablosunu oluştur
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Başlıksız Not',
    content TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Tüm notları getir
app.get('/api/notes', (req, res) => {
  const search = req.query.search || '';
  let notes;
  if (search) {
    notes = db.prepare(`
      SELECT * FROM notes
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY updated_at DESC
    `).all(`%${search}%`, `%${search}%`);
  } else {
    notes = db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all();
  }
  res.json(notes);
});

// Tek not getir
app.get('/api/notes/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
  res.json(note);
});

// Yeni not oluştur
app.post('/api/notes', (req, res) => {
  const { title, content } = req.body;
  const result = db.prepare(`
    INSERT INTO notes (title, content) VALUES (?, ?)
  `).run(title || 'Başlıksız Not', content || '');
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
  res.json(note);
});

// Not güncelle
app.put('/api/notes/:id', (req, res) => {
  const { title, content } = req.body;
  db.prepare(`
    UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(title, content, req.params.id);
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json(note);
});

// Not sil
app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
