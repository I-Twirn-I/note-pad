const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('JWT_SECRET environment variable eksik!'); process.exit(1); }

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL DEFAULT 'Başlıksız Not',
      content TEXT DEFAULT '',
      category TEXT DEFAULT '',
      color TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      public_id TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      original_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

initDB().catch(err => {
  console.error('Veritabanı başlatma hatası:', err);
  process.exit(1);
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function uploadToCloudinary(buffer, mimetype, publicId) {
  const b64 = buffer.toString('base64');
  const dataUri = `data:${mimetype};base64,${b64}`;
  return await cloudinary.uploader.upload(dataUri, {
    folder: 'notepad-attachments',
    resource_type: 'auto',
    public_id: publicId,
  });
}

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
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Tüm alanlar gerekli' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (existing.rows.length > 0)
      return res.status(400).json({ error: 'Bu kullanıcı adı veya email zaten kayıtlı' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
      [username, email, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email ve şifre gerekli' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user)
      return res.status(400).json({ error: 'Email veya şifre hatalı' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(400).json({ error: 'Email veya şifre hatalı' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ── NOT ENDPOINT'LERİ ────────────────────────────────────────────
app.get('/api/notes', authMiddleware, async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || '';
    const params = [req.userId];
    let query = 'SELECT * FROM notes WHERE user_id = $1';

    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      query += ` AND (title ILIKE $${n} OR content ILIKE $${n})`;
    }
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    query += ' ORDER BY updated_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not bulunamadı' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/notes', authMiddleware, async (req, res) => {
  try {
    const { title, content, category, color } = req.body;
    const result = await pool.query(
      'INSERT INTO notes (user_id, title, content, category, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.userId, title || 'Başlıksız Not', content || '', category || '', color || '']
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const { title, content, category, color } = req.body;
    const result = await pool.query(
      `UPDATE notes SET title = $1, content = $2, category = $3, color = $4, updated_at = NOW()
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [title, content, category || '', color || '', req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not bulunamadı' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const noteResult = await pool.query(
      'SELECT id FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!noteResult.rows[0]) return res.status(404).json({ error: 'Not bulunamadı' });

    const attachments = await pool.query(
      'SELECT public_id FROM attachments WHERE note_id = $1',
      [req.params.id]
    );
    for (const a of attachments.rows) {
      if (a.public_id) try { await cloudinary.uploader.destroy(a.public_id, { resource_type: 'raw' }); } catch (e) {}
    }

    await pool.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/api/categories', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM notes WHERE user_id = $1 AND category != '' ORDER BY category`,
      [req.userId]
    );
    res.json(result.rows.map(r => r.category));
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/api/notes/:id/attachments', authMiddleware, async (req, res) => {
  try {
    const note = await pool.query(
      'SELECT id FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!note.rows[0]) return res.status(404).json({ error: 'Not bulunamadı' });

    const result = await pool.query(
      'SELECT * FROM attachments WHERE note_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/notes/:id/attachments', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const note = await pool.query(
      'SELECT id FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!note.rows[0]) return res.status(404).json({ error: 'Not bulunamadı' });
    if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' });

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const publicId = Date.now() + '-' + originalName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-.]/g, '');
    const uploaded = await uploadToCloudinary(req.file.buffer, req.file.mimetype, publicId);
    const result = await pool.query(
      'INSERT INTO attachments (note_id, public_id, url, original_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, uploaded.public_id, uploaded.secure_url, originalName]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Attachment upload error:', e);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.delete('/api/attachments/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.* FROM attachments a
       JOIN notes n ON a.note_id = n.id
       WHERE a.id = $1 AND n.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Bulunamadı' });

    if (result.rows[0].public_id) try { await cloudinary.uploader.destroy(result.rows[0].public_id, { resource_type: 'raw' }); } catch (e) {}
    await pool.query('DELETE FROM attachments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Attachment delete error:', e);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.use((err, req, res, next) => {
  console.error('Middleware error:', err);
  res.status(500).json({ error: err.message || 'Sunucu hatası' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
  });
}

module.exports = app;
