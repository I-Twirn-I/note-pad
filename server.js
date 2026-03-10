const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

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

// Eski tabloya yeni sütunlar ekle (varsa hata vermez)
try { db.exec(`ALTER TABLE notes ADD COLUMN category TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE notes ADD COLUMN color TEXT DEFAULT ''`); } catch(e) {}

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

app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Kategorileri getir
app.get('/api/categories', (req, res) => {
  const cats = db.prepare(`SELECT DISTINCT category FROM notes WHERE category != '' ORDER BY category`).all();
  res.json(cats.map(c => c.category));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
