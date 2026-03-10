let notes = [];
let currentNoteId = null;
let saveTimeout = null;

const noteList = document.getElementById('noteList');
const noteTitle = document.getElementById('noteTitle');
const noteContent = document.getElementById('noteContent');
const saveStatus = document.getElementById('saveStatus');
const searchInput = document.getElementById('searchInput');

// Notları yükle
async function loadNotes(search = '') {
  const res = await fetch(`/api/notes?search=${encodeURIComponent(search)}`);
  notes = await res.json();
  renderNoteList();
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
      <div class="note-date">${formatDate(note.updated_at)}</div>
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
  noteContent.value = note.content || '';
  saveStatus.textContent = '';
  renderNoteList();
  showEditor();
}

// Yeni not
document.getElementById('newNoteBtn').addEventListener('click', async () => {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Başlıksız Not', content: '' })
  });
  const note = await res.json();
  await loadNotes();
  openNote(note.id);
});

// Kaydet
document.getElementById('saveBtn').addEventListener('click', saveCurrentNote);

async function saveCurrentNote() {
  if (!currentNoteId) return;
  const res = await fetch(`/api/notes/${currentNoteId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: noteTitle.value || 'Başlıksız Not',
      content: noteContent.value
    })
  });
  await res.json();
  saveStatus.textContent = 'Kaydedildi ✓';
  setTimeout(() => saveStatus.textContent = '', 2000);
  await loadNotes();
}

// Otomatik kaydet (yazarken)
function autoSave() {
  clearTimeout(saveTimeout);
  saveStatus.textContent = 'Kaydediliyor...';
  saveTimeout = setTimeout(saveCurrentNote, 1000);
}

noteTitle.addEventListener('input', autoSave);
noteContent.addEventListener('input', autoSave);

// Not sil
document.getElementById('deleteNoteBtn').addEventListener('click', async () => {
  if (!currentNoteId) return;
  if (!confirm('Bu notu silmek istediğine emin misin?')) return;
  await fetch(`/api/notes/${currentNoteId}`, { method: 'DELETE' });
  currentNoteId = null;
  noteTitle.value = '';
  noteContent.value = '';
  await loadNotes();
});

// Arama
searchInput.addEventListener('input', () => {
  loadNotes(searchInput.value);
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

function showEditor() {
  noteTitle.focus();
}

// Başlat
loadNotes();
