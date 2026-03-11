const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'notpad-secret-key-2024';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dp3doruvr',
  api_key: process.env.CLOUDINARY_API_KEY || 'CLOUDINARY_API_KEY_REMOVED',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'CLOUDINARY_API_SECRET_REMOVED',
});

const app = express();
const db = new Database('notes.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
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
try { db.exec(`ALTER TABLE notes ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch(e) {}
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

// ── AUTH MİDDLEWARE ─────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Giriş gerekli' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Geçersiz token' });
  }
}

// ── AUTH ENDPOINT'LERİ ───────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Tüm alanlar gerekli' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing)
    return res.status(400).json({ error: 'Bu kullanıcı adı veya email zaten kayıtlı' });
  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, hash);
  const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email ve şifre gerekli' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user)
    return res.status(400).json({ error: 'Email veya şifre hatalı' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid)
    return res.status(400).json({ error: 'Email veya şifre hatalı' });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  res.json(user);
});

// ── NOT ENDPOINT'LERİ ────────────────────────────────────────────
app.get('/api/notes', authMiddleware, (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || '';
  let query = 'SELECT * FROM notes WHERE user_id = ?';
  const params = [req.userId];
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

app.get('/api/notes/:id', authMiddleware, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
  res.json(note);
});

app.post('/api/notes', authMiddleware, (req, res) => {
  const { title, content, category, color } = req.body;
  const result = db.prepare(`
    INSERT INTO notes (user_id, title, content, category, color) VALUES (?, ?, ?, ?, ?)
  `).run(req.userId, title || 'Başlıksız Not', content || '', category || '', color || '');
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/notes/:id', authMiddleware, (req, res) => {
  const { title, content, category, color } = req.body;
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
  db.prepare(`
    UPDATE notes SET title = ?, content = ?, category = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(title, content, category || '', color || '', req.params.id);
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
  const attachments = db.prepare('SELECT public_id FROM attachments WHERE note_id = ?').all(req.params.id);
  for (const a of attachments) {
    try { await cloudinary.uploader.destroy(a.public_id, { resource_type: 'raw' }); } catch(e) {}
  }
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/categories', authMiddleware, (req, res) => {
  const cats = db.prepare(`SELECT DISTINCT category FROM notes WHERE user_id = ? AND category != '' ORDER BY category`).all(req.userId);
  res.json(cats.map(c => c.category));
});

app.get('/api/notes/:id/attachments', authMiddleware, (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
  const attachments = db.prepare('SELECT * FROM attachments WHERE note_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(attachments);
});

app.post('/api/notes/:id/attachments', authMiddleware, upload.single('file'), (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' });
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const result = db.prepare(`
    INSERT INTO attachments (note_id, public_id, url, original_name) VALUES (?, ?, ?, ?)
  `).run(req.params.id, req.file.filename, req.file.path, originalName);
  res.json(db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/attachments/:id', authMiddleware, async (req, res) => {
  const attachment = db.prepare('SELECT a.* FROM attachments a JOIN notes n ON a.note_id = n.id WHERE a.id = ? AND n.user_id = ?').get(req.params.id, req.userId);
  if (!attachment) return res.status(404).json({ error: 'Bulunamadı' });
  try { await cloudinary.uploader.destroy(attachment.public_id, { resource_type: 'raw' }); } catch(e) {}
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
