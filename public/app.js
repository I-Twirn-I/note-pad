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

// Notları yükle
async function loadNotes() {
  const search = searchInput.value;
  const category = categoryFilter.value;
  const res = await fetch(`/api/notes?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`);
  notes = await res.json();
  renderNoteList();
  loadCategories();
}

// Kategorileri yükle
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

// Listeyi render et
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

// Not aç
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
}

// Renk uygula (sadece seçili veya yeni yazılacak metne)
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentColor = btn.dataset.color;
    updateColorButtons();
    noteContent.focus();
    if (currentColor) {
      document.execCommand('foreColor', false, currentColor);
    } else {
      document.execCommand('removeFormat', false, null);
    }
    autoSave();
  });
});

function updateColorButtons() {
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === currentColor);
  });
}

// Yeni not
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

// Kaydet
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

// Otomatik kaydet
function autoSave() {
  clearTimeout(saveTimeout);
  saveStatus.textContent = 'Kaydediliyor...';
  saveTimeout = setTimeout(saveCurrentNote, 1000);
}

noteTitle.addEventListener('input', autoSave);
noteContent.addEventListener('input', () => { autoSave(); updateWordCount(); });
noteCategory.addEventListener('input', autoSave);

// Kelime sayacı
function updateWordCount() {
  const text = noteContent.innerText.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = noteContent.innerText.length;
  wordCount.textContent = `${words} kelime · ${chars} karakter`;
}

// Not sil
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

// Arama & kategori filtresi
searchInput.addEventListener('input', loadNotes);
categoryFilter.addEventListener('change', loadNotes);

// Biçimlendirme toolbar
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    noteContent.focus();

    if (cmd === 'bold') {
      document.execCommand('bold');
    } else if (cmd === 'italic') {
      document.execCommand('italic');
    } else if (cmd === 'ul') {
      document.execCommand('insertUnorderedList');
    } else if (cmd === 'ol') {
      document.execCommand('insertOrderedList');
    } else if (cmd === 'heading') {
      document.execCommand('formatBlock', false, 'h2');
    } else if (cmd === 'hr') {
      document.execCommand('insertHorizontalRule');
    }
    autoSave();
    updateWordCount();
  });
});

// Dışa aktar
document.getElementById('exportBtn').addEventListener('click', () => {
  if (!currentNoteId) return;
  const title = noteTitle.value || 'not';
  const content = noteContent.innerText;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// Tema
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

// Yardımcılar
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' });
}

// Başlat
loadNotes();
