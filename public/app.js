let notes = [];
let currentNoteId = null;
let saveTimeout = null;
let currentColor = '';
let currentFontSize = '';
let currentFontFamily = '';
let savedRange = null;
let authToken = localStorage.getItem('authToken') || null;

const noteList = document.getElementById('noteList');
const noteTitle = document.getElementById('noteTitle');
const noteContent = document.getElementById('noteContent');
const noteCategory = document.getElementById('noteCategory');
const saveStatus = document.getElementById('saveStatus');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const wordCount = document.getElementById('wordCount');
const editorPanel = document.getElementById('editorPanel');
const noNoteMsg = document.getElementById('noNoteMsg');
const authOverlay = document.getElementById('authOverlay');

// ── AUTH ─────────────────────────────────────────────────────────
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
}

function showAuthOverlay() {
  authOverlay.style.display = 'flex';
}

function hideAuthOverlay() {
  authOverlay.style.display = 'none';
}

async function checkAuth() {
  if (!authToken) { showAuthOverlay(); return; }
  try {
    const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!res.ok) { authToken = null; localStorage.removeItem('authToken'); showAuthOverlay(); return; }
    const user = await res.json();
    document.getElementById('userNameDisplay').textContent = user.username;
    hideAuthOverlay();
    loadNotes();
  } catch(e) {
    showAuthOverlay();
  }
}

let isRegisterMode = false;

document.getElementById('authToggle').addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  document.getElementById('authTitle').textContent = isRegisterMode ? 'Yeni Hesap Oluştur' : 'Not Defterine Giriş Yap';
  document.getElementById('authSubmit').textContent = isRegisterMode ? 'Kayıt Ol' : 'Giriş Yap';
  document.getElementById('authToggle').textContent = isRegisterMode ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol';
  document.getElementById('registerFields').style.display = isRegisterMode ? 'block' : 'none';
  document.getElementById('authError').textContent = '';
});

document.getElementById('authSubmit').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  errorEl.textContent = '';

  if (!email || !password) { errorEl.textContent = 'Lütfen tüm alanları doldurun'; return; }

  try {
    if (isRegisterMode) {
      const username = document.getElementById('authUsername').value.trim();
      if (!username) { errorEl.textContent = 'Kullanıcı adı gerekli'; return; }
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (!res.ok) { errorEl.textContent = data.error; return; }
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      document.getElementById('userNameDisplay').textContent = data.username;
      hideAuthOverlay();
      loadNotes();
    } else {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) { errorEl.textContent = data.error; return; }
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      document.getElementById('userNameDisplay').textContent = data.username;
      hideAuthOverlay();
      loadNotes();
    }
  } catch(e) {
    errorEl.textContent = 'Bir hata oluştu, tekrar deneyin';
  }
});

// Enter tuşu ile form gönder
['authEmail', 'authPassword', 'authUsername'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('authSubmit').click();
  });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  authToken = null;
  localStorage.removeItem('authToken');
  currentNoteId = null;
  notes = [];
  noteList.innerHTML = '';
  noteTitle.value = '';
  noteContent.innerHTML = '';
  noteCategory.value = '';
  hideEditor();
  document.getElementById('userNameDisplay').textContent = '';
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  if (document.getElementById('authUsername')) document.getElementById('authUsername').value = '';
  showAuthOverlay();
});

// ── SELECTION YÖNETİMİ ──────────────────────────────────────────
function saveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && noteContent.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

function restoreSelection() {
  noteContent.focus();
  if (savedRange) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
}

function restoreSelectionIfNeeded() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && noteContent.contains(sel.anchorNode)) {
    noteContent.focus();
    return;
  }
  restoreSelection();
}

noteContent.addEventListener('mouseup', saveSelection);
noteContent.addEventListener('keyup', saveSelection);
noteContent.addEventListener('input', saveSelection);

document.querySelector('.toolbar').addEventListener('mousedown', e => {
  if (e.target.closest('button')) e.preventDefault();
});
document.querySelector('.editor-meta').addEventListener('mousedown', e => {
  if (e.target.closest('.color-btn')) e.preventDefault();
});

// ── NOTLAR ──────────────────────────────────────────────────────
async function loadNotes() {
  const search = searchInput.value;
  const category = categoryFilter.value;
  const res = await fetch(`/api/notes?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (res.status === 401) { showAuthOverlay(); return; }
  notes = await res.json();
  renderNoteList();
  loadCategories();
}

async function loadCategories() {
  const res = await fetch('/api/categories', { headers: { 'Authorization': `Bearer ${authToken}` } });
  if (res.status === 401) return;
  const cats = await res.json();
  const current = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">Tüm kategoriler</option>';
  cats.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if (cat === current) opt.selected = true;
    categoryFilter.appendChild(opt);
  });
}

function renderNoteList() {
  noteList.innerHTML = '';
  if (notes.length === 0) {
    noteList.innerHTML = '<li style="color:var(--subtext);font-size:13px;padding:8px">Not bulunamadı</li>';
    return;
  }
  notes.forEach(note => {
    const li = document.createElement('li');
    if (note.id === currentNoteId) li.classList.add('active');
    li.innerHTML = `
      <div class="note-title">${escapeHtml(note.title || 'Başlıksız Not')}</div>
      <div class="note-meta">
        <span class="note-date">${formatDate(note.updated_at)}</span>
        ${note.category ? `<span class="note-category">${escapeHtml(note.category)}</span>` : ''}
      </div>
    `;
    li.addEventListener('click', () => openNote(note.id));
    noteList.appendChild(li);
  });
}

async function openNote(id) {
  clearTimeout(saveTimeout);
  currentNoteId = id;
  const res = await fetch(`/api/notes/${id}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
  if (res.status === 401) { showAuthOverlay(); return; }
  const note = await res.json();
  noteTitle.value = note.title || '';
  noteContent.innerHTML = note.content || '';
  noteCategory.value = note.category || '';
  currentColor = '';
  currentFontSize = '';
  currentFontFamily = '';
  document.getElementById('fontSizeSelect').value = '16';
  document.getElementById('fontFamily').value = 'Segoe UI';
  savedRange = null;
  updateColorButtons();
  updateWordCount();
  saveStatus.textContent = '';
  renderNoteList();
  showEditor();
  loadAttachments();
}

function showEditor() {
  editorPanel.classList.remove('hidden');
  noNoteMsg.style.display = 'none';
}

function hideEditor() {
  editorPanel.classList.add('hidden');
  noNoteMsg.style.display = 'flex';
}

// ── RENK ────────────────────────────────────────────────────────
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentColor = btn.dataset.color;
    updateColorButtons();
    restoreSelection();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      if (currentColor) {
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('foreColor', false, currentColor);
        document.execCommand('styleWithCSS', false, false);
      } else {
        document.execCommand('removeFormat', false, null);
      }
    } else {
      getOrCreateFormattingSpan();
    }
    saveSelection();
    autoSave();
  });
});

function updateColorButtons() {
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === currentColor);
  });
}

function updateToolbarState() {
  try {
    document.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn => {
      const cmd = btn.dataset.cmd;
      if (cmd === 'bold') btn.classList.toggle('active', document.queryCommandState('bold'));
      else if (cmd === 'italic') btn.classList.toggle('active', document.queryCommandState('italic'));
      else if (cmd === 'heading') btn.classList.toggle('active', document.queryCommandValue('formatBlock').toLowerCase() === 'h2');
      else if (cmd === 'ul') btn.classList.toggle('active', document.queryCommandState('insertUnorderedList'));
      else if (cmd === 'ol') btn.classList.toggle('active', document.queryCommandState('insertOrderedList'));
    });
  } catch(e) {}
}

function getColorAtCursor() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return '';
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  while (node && node !== noteContent) {
    if (node.style && node.style.color) {
      const c = node.style.color;
      if (c.startsWith('#')) return c.toLowerCase();
      const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
    }
    node = node.parentNode;
  }
  return '';
}

document.addEventListener('selectionchange', () => {
  if (noteContent.contains(document.getSelection()?.anchorNode)) {
    updateToolbarState();
    currentColor = getColorAtCursor();
    updateColorButtons();
  }
});

// ── FORMAT SPAN YÖNETİMİ ─────────────────────────────────────────
function getOrCreateFormattingSpan() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

  let topmostFmt = null;
  let searchNode = node;
  while (searchNode && searchNode !== noteContent) {
    if (searchNode.nodeType === Node.ELEMENT_NODE &&
        searchNode.tagName === 'SPAN' &&
        searchNode.dataset.fmt) {
      topmostFmt = searchNode;
    }
    searchNode = searchNode.parentNode;
  }

  let span;
  if (topmostFmt && topmostFmt.textContent.replace(/\u200B/g, '') === '') {
    span = topmostFmt;
  } else if (topmostFmt) {
    span = document.createElement('span');
    span.dataset.fmt = '1';
    span.appendChild(document.createTextNode('\u200B'));
    topmostFmt.parentNode.insertBefore(span, topmostFmt.nextSibling);
    const r = document.createRange();
    r.setStart(span.firstChild, 1);
    r.setEnd(span.firstChild, 1);
    sel.removeAllRanges();
    sel.addRange(r);
  } else {
    span = document.createElement('span');
    span.dataset.fmt = '1';
    span.appendChild(document.createTextNode('\u200B'));
    const r = range.cloneRange();
    r.insertNode(span);
    const r2 = document.createRange();
    r2.setStart(span.firstChild, 1);
    r2.setEnd(span.firstChild, 1);
    sel.removeAllRanges();
    sel.addRange(r2);
  }

  span.style.fontSize = currentFontSize;
  span.style.fontFamily = currentFontFamily;
  span.style.color = currentColor;
  return span;
}

// ── YENİ NOT ────────────────────────────────────────────────────
document.getElementById('newNoteBtn').addEventListener('click', async () => {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title: 'Başlıksız Not', content: '', category: '', color: '' })
  });
  if (res.status === 401) { showAuthOverlay(); return; }
  const note = await res.json();
  await loadNotes();
  openNote(note.id);
});

// ── KAYDET ──────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', saveCurrentNote);

async function saveCurrentNote() {
  if (!currentNoteId) return;
  const res = await fetch(`/api/notes/${currentNoteId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      title: noteTitle.value || 'Başlıksız Not',
      content: noteContent.innerHTML,
      category: noteCategory.value.trim(),
      color: currentColor
    })
  });
  if (res.status === 401) { showAuthOverlay(); return; }
  saveStatus.textContent = 'Kaydedildi ✓';
  setTimeout(() => saveStatus.textContent = '', 2000);
  await loadNotes();
}

function autoSave() {
  clearTimeout(saveTimeout);
  saveStatus.textContent = 'Kaydediliyor...';
  saveTimeout = setTimeout(saveCurrentNote, 1000);
}

noteTitle.addEventListener('input', autoSave);
noteContent.addEventListener('input', () => { autoSave(); updateWordCount(); });
noteCategory.addEventListener('input', autoSave);

function updateWordCount() {
  const text = noteContent.innerText.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = noteContent.innerText.length;
  wordCount.textContent = `${words} kelime · ${chars} karakter`;
}

// ── NOT SİL ─────────────────────────────────────────────────────
document.getElementById('deleteNoteBtn').addEventListener('click', async () => {
  if (!currentNoteId) return;
  if (!confirm('Bu notu silmek istediğine emin misin?')) return;
  await fetch(`/api/notes/${currentNoteId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  currentNoteId = null;
  noteTitle.value = '';
  noteContent.innerHTML = '';
  noteCategory.value = '';
  currentColor = '';
  savedRange = null;
  updateColorButtons();
  updateWordCount();
  hideEditor();
  await loadNotes();
});

// ── DOSYA YÜKLEME ───────────────────────────────────────────────
document.getElementById('fileInput').addEventListener('change', async (e) => {
  if (!currentNoteId) return;
  for (const file of Array.from(e.target.files)) {
    const formData = new FormData();
    formData.append('file', file);
    await fetch(`/api/notes/${currentNoteId}/attachments`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
  }
  e.target.value = '';
  await loadAttachments();
});

async function loadAttachments() {
  if (!currentNoteId) return;
  const res = await fetch(`/api/notes/${currentNoteId}/attachments`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) return;
  const attachments = await res.json();
  const list = document.getElementById('attachmentList');
  list.innerHTML = '';
  attachments.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${a.url}" target="_blank" rel="noopener">${escapeHtml(a.original_name)}</a>
      <button class="del-attachment" data-id="${a.id}" title="Sil">✕</button>`;
    li.querySelector('.del-attachment').addEventListener('click', async () => {
      await fetch(`/api/attachments/${a.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      loadAttachments();
    });
    list.appendChild(li);
  });
}

// ── ARAMA & FİLTRE ──────────────────────────────────────────────
searchInput.addEventListener('input', loadNotes);
categoryFilter.addEventListener('change', loadNotes);

// ── BİÇİMLENDİRME TOOLBAR ───────────────────────────────────────
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    if (!cmd) return;

    if (cmd === 'undo') {
      noteContent.focus();
      document.execCommand('undo');
      updateWordCount();
      updateToolbarState();
      autoSave();
      return;
    } else if (cmd === 'redo') {
      noteContent.focus();
      document.execCommand('redo');
      updateWordCount();
      updateToolbarState();
      autoSave();
      return;
    }

    restoreSelectionIfNeeded();

    if (cmd === 'bold') {
      document.execCommand('bold');
    } else if (cmd === 'italic') {
      document.execCommand('italic');
    } else if (cmd === 'ul') {
      document.execCommand('insertUnorderedList');
    } else if (cmd === 'ol') {
      document.execCommand('insertOrderedList');
    } else if (cmd === 'heading') {
      const current = document.queryCommandValue('formatBlock');
      document.execCommand('formatBlock', false, current === 'h2' ? 'p' : 'h2');
    } else if (cmd === 'hr') {
      document.execCommand('insertHorizontalRule');
    }

    saveSelection();
    updateToolbarState();
    autoSave();
    updateWordCount();
  });
});

// ── KOPYALA ─────────────────────────────────────────────────────
document.getElementById('duplicateBtn').addEventListener('click', async () => {
  if (!currentNoteId) return;
  await navigator.clipboard.writeText(noteContent.innerText);
  saveStatus.textContent = 'Kopyalandı ✓';
  setTimeout(() => saveStatus.textContent = '', 2000);
  const toast = document.getElementById('copyToast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
});

// ── YAZI BOYUTU ─────────────────────────────────────────────────
document.getElementById('fontSizeSelect').addEventListener('mousedown', saveSelection);
document.getElementById('fontSizeSelect').addEventListener('change', (e) => {
  const size = e.target.value + 'px';
  currentFontSize = size;
  restoreSelection();
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    document.execCommand('fontSize', false, '7');
    noteContent.querySelectorAll('font[size="7"]').forEach(el => {
      el.removeAttribute('size');
      el.style.fontSize = size;
    });
  } else {
    getOrCreateFormattingSpan();
  }
  saveSelection();
  autoSave();
});

// ── YAZI TİPİ ───────────────────────────────────────────────────
document.getElementById('fontFamily').addEventListener('mousedown', saveSelection);
document.getElementById('fontFamily').addEventListener('change', (e) => {
  const font = e.target.value;
  currentFontFamily = font;
  restoreSelection();
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontName', false, font);
    document.execCommand('styleWithCSS', false, false);
  } else {
    getOrCreateFormattingSpan();
  }
  saveSelection();
  autoSave();
});

// ── PDF ─────────────────────────────────────────────────────────
document.getElementById('pdfBtn').addEventListener('click', () => {
  if (!currentNoteId) return;
  const title = noteTitle.value || 'Not';
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'font-family:Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#111;padding:10px';
  wrapper.innerHTML = `<h1 style="font-size:22px;margin-bottom:16px;border-bottom:2px solid #ccc;padding-bottom:8px">${escapeHtml(title)}</h1>${noteContent.innerHTML}`;
  html2pdf().set({
    margin: 15,
    filename: `${title}.pdf`,
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(wrapper).save();
});

// ── DIŞA AKTAR ──────────────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', () => {
  if (!currentNoteId) return;
  const blob = new Blob([noteContent.innerText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${noteTitle.value || 'not'}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── TEMA ────────────────────────────────────────────────────────
const toggleTheme = document.getElementById('toggleTheme');
const savedTheme = localStorage.getItem('theme') || 'light';
document.body.className = savedTheme;
toggleTheme.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

toggleTheme.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  document.body.className = isDark ? 'light' : 'dark';
  toggleTheme.textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
});

// ── YARDIMCILAR ─────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' });
}

// ── ÇEVİRİ ──────────────────────────────────────────────────────
document.getElementById('translateBtn').addEventListener('click', () => {
  if (!currentNoteId) return;
  const text = noteContent.innerText.trim();
  const wordInfoEl = document.getElementById('translateWordInfo');
  wordInfoEl.textContent = '';
  wordInfoEl.style.color = '';
  document.getElementById('translateResult').value = '';
  document.getElementById('translateStatus').textContent = '';
  document.getElementById('applyTranslationBtn').disabled = true;
  document.getElementById('translateModal').style.display = 'flex';
});

document.getElementById('translateModalClose').addEventListener('click', () => {
  document.getElementById('translateModal').style.display = 'none';
});

document.getElementById('translateModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('translateModal')) {
    document.getElementById('translateModal').style.display = 'none';
  }
});

document.getElementById('doTranslateBtn').addEventListener('click', async () => {
  const from = document.getElementById('translateFrom').value;
  const to = document.getElementById('translateTo').value;
  const text = noteContent.innerText.trim();
  const statusEl = document.getElementById('translateStatus');
  const btn = document.getElementById('doTranslateBtn');

  if (!text) { statusEl.textContent = 'Not içeriği boş!'; return; }
  if (from === to) { statusEl.textContent = 'Kaynak ve hedef dil aynı olamaz!'; return; }

  btn.disabled = true;
  document.getElementById('applyTranslationBtn').disabled = true;
  document.getElementById('translateResult').value = '';

  try {
    const chunks = chunkText(text, 490);
    statusEl.textContent = chunks.length > 1 ? `Çeviriliyor... (${chunks.length} parça)` : 'Çeviriliyor...';
    const translated = await translateChunks(chunks, from, to);
    document.getElementById('translateResult').value = translated;
    statusEl.textContent = '✓ Çeviri tamamlandı';
    document.getElementById('applyTranslationBtn').disabled = false;
    const wordInfoEl = document.getElementById('translateWordInfo');
    wordInfoEl.textContent = '';
    wordInfoEl.style.color = '';
  } catch (e) {
    const isLimitError = e.message && (
      e.message.toUpperCase().includes('ALL AVAILABLE') ||
      e.message.toUpperCase().includes('QUOTA') ||
      e.message.toUpperCase().includes('LIMIT') ||
      e.message.includes('429')
    );
    if (isLimitError) {
      const wordInfoEl = document.getElementById('translateWordInfo');
      wordInfoEl.textContent = 'Kelime limitini aştınız, her gece yenilenir';
      wordInfoEl.style.color = '#ef4444';
      statusEl.textContent = '';
    } else {
      statusEl.textContent = 'Hata: ' + e.message;
    }
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('applyTranslationBtn').addEventListener('click', () => {
  const result = document.getElementById('translateResult').value;
  if (!result) return;
  noteContent.focus();
  document.execCommand('selectAll');
  document.execCommand('insertText', false, result);
  updateWordCount();
  autoSave();
  document.getElementById('translateModal').style.display = 'none';
  saveStatus.textContent = 'Çeviri uygulandı ✓';
  setTimeout(() => saveStatus.textContent = '', 2000);
});

async function translateChunks(chunks, from, to) {
  const results = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}&de=kuzeyture2008@gmail.com`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API isteği başarısız oldu');
    const data = await res.json();
    if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'Çeviri başarısız');
    results.push(data.responseData.translatedText);
  }
  return results.join('\n');
}

function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('. ', maxLen);
    if (splitAt === -1) splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt === -1) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt === -1) splitAt = maxLen;
    else splitAt += 1;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// ── BAŞLAT ───────────────────────────────────────────────────────
noteContent.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, text);
});
checkAuth();
