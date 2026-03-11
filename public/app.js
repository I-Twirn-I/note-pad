let notes = [];
let currentNoteId = null;
let saveTimeout = null;
let currentColor = '';

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

function showEditor() {
  editorPanel.classList.remove('hidden');
  noNoteMsg.style.display = 'none';
}

function hideEditor() {
  editorPanel.classList.add('hidden');
  noNoteMsg.style.display = 'flex';
}

// ── SELECTION YÖNETİMİ ──────────────────────────────────────────
// Toolbar butonlarına tıklanınca editör odağı kaybolmasın
document.querySelector('.toolbar').addEventListener('mousedown', e => {
  if (e.target !== noteContent) e.preventDefault();
});
document.querySelector('.editor-meta').addEventListener('mousedown', e => {
  if (e.target.closest('.color-btn')) e.preventDefault();
});

// ── NOTLAR ──────────────────────────────────────────────────────
async function loadNotes() {
  const search = searchInput.value;
  const category = categoryFilter.value;
  const res = await fetch(`/api/notes?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`);
  notes = await res.json();
  renderNoteList();
  loadCategories();
}

async function loadCategories() {
  const res = await fetch('/api/categories');
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
  currentNoteId = id;
  const res = await fetch(`/api/notes/${id}`);
  const note = await res.json();
  noteTitle.value = note.title || '';
  noteContent.innerHTML = note.content || '';
  noteCategory.value = note.category || '';
  currentColor = note.color || '';
  updateColorButtons();
  updateWordCount();
  saveStatus.textContent = '';
  renderNoteList();
  showEditor();
  loadAttachments();
}

// ── RENK ────────────────────────────────────────────────────────
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentColor = btn.dataset.color;
    updateColorButtons();
    if (currentColor) {
      document.execCommand('foreColor', false, currentColor);
    } else {
      // Varsayılan renge dön: seçili metindeki renk stillerini kaldır
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        document.execCommand('removeFormat', false, null);
      } else {
        document.execCommand('foreColor', false, getComputedStyle(noteContent).color);
      }
    }
    autoSave();
  });
});

function updateColorButtons() {
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === currentColor);
  });
}

// ── YENİ NOT ────────────────────────────────────────────────────
document.getElementById('newNoteBtn').addEventListener('click', async () => {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Başlıksız Not', content: '', category: '', color: '' })
  });
  const note = await res.json();
  await loadNotes();
  openNote(note.id);
});

// ── KAYDET ──────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', saveCurrentNote);

async function saveCurrentNote() {
  if (!currentNoteId) return;
  await fetch(`/api/notes/${currentNoteId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: noteTitle.value || 'Başlıksız Not',
      content: noteContent.innerHTML,
      category: noteCategory.value.trim(),
      color: currentColor
    })
  });
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
  await fetch(`/api/notes/${currentNoteId}`, { method: 'DELETE' });
  currentNoteId = null;
  noteTitle.value = '';
  noteContent.innerHTML = '';
  noteCategory.value = '';
  currentColor = '';
  updateColorButtons();
  updateWordCount();
  hideEditor();
  await loadNotes();
});

// ── DOSYA YÜKLEME ───────────────────────────────────────────────
document.getElementById('fileInput').addEventListener('change', (e) => {
  if (!currentNoteId) return;
  Array.from(e.target.files).forEach(file => {
    const reader = new FileReader();
    if (file.type.startsWith('image/')) {
      reader.onload = (ev) => {
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.style.maxWidth = '100%';
        noteContent.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.collapse(false);
          range.insertNode(img);
          range.setStartAfter(img);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          noteContent.appendChild(img);
        }
        autoSave();
        updateWordCount();
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (ev) => {
        noteContent.focus();
        document.execCommand('insertText', false, ev.target.result);
        autoSave();
        updateWordCount();
      };
      reader.readAsText(file, 'UTF-8');
    }
  });
  e.target.value = '';
});

function loadAttachments() {}

// ── ARAMA & FİLTRE ──────────────────────────────────────────────
searchInput.addEventListener('input', loadNotes);
categoryFilter.addEventListener('change', loadNotes);

// ── BİÇİMLENDİRME TOOLBAR ───────────────────────────────────────
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    if (!cmd) return;
    if (cmd === 'undo') { document.execCommand('undo'); return; }
    if (cmd === 'redo') { document.execCommand('redo'); return; }
    if (cmd === 'bold') { document.execCommand('bold'); }
    else if (cmd === 'italic') { document.execCommand('italic'); }
    else if (cmd === 'ul') { document.execCommand('insertUnorderedList'); }
    else if (cmd === 'ol') { document.execCommand('insertOrderedList'); }
    else if (cmd === 'heading') { document.execCommand('formatBlock', false, 'h2'); }
    else if (cmd === 'hr') { document.execCommand('insertHorizontalRule'); }
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
});

// ── YAZI BOYUTU ─────────────────────────────────────────────────
document.getElementById('fontSizeSelect').addEventListener('change', (e) => {
  const size = e.target.value + 'px';
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    // Seçili metne uygula
    document.execCommand('fontSize', false, '7');
    noteContent.querySelectorAll('font[size="7"]').forEach(el => {
      el.removeAttribute('size');
      el.style.fontSize = size;
    });
  } else {
    // İmleç konumuna yeni span ekle, sonraki yazı bu boyutta olsun
    const span = document.createElement('span');
    span.style.fontSize = size;
    span.appendChild(document.createTextNode('\u200B')); // sıfır genişlikli boşluk
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(span);
      range.setStart(span, 1);
      range.setEnd(span, 1);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  noteContent.focus();
  autoSave();
});

// ── YAZI TİPİ ───────────────────────────────────────────────────
document.getElementById('fontFamily').addEventListener('change', (e) => {
  document.execCommand('fontName', false, e.target.value);
  noteContent.focus();
  autoSave();
});

// ── PDF ─────────────────────────────────────────────────────────
document.getElementById('pdfBtn').addEventListener('click', () => {
  if (!currentNoteId) return;
  const title = noteTitle.value || 'Not';
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:40px;font-size:14px;line-height:1.6;color:#111}
    h1{font-size:22px;margin-bottom:16px;border-bottom:2px solid #ccc;padding-bottom:8px}
    h2{font-size:18px}hr{border:none;border-top:1px solid #ccc;margin:16px 0}
    img{max-width:100%}@media print{body{padding:20px}}</style>
    </head><body><h1>${title}</h1>${noteContent.innerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
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

loadNotes();
