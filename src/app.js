import { PhononTTS } from 'phonon-tts';
import { importBook } from './book-import.js';
import './styles.css';

const $ = (id) => document.getElementById(id);
const els = {
  text: $('textInput'), title: $('documentTitle'), reading: $('readingView'), empty: $('emptyReading'), library: $('libraryList'),
  play: $('playButton'), stop: $('stopButton'), status: $('playStatus'), sentence: $('currentSentence'), progress: $('progressBar'), progressText: $('progressText'),
  voice: $('voiceSelect'), speed: $('speedRange'), speedValue: $('speedValue'), volume: $('volumeRange'), volumeValue: $('volumeValue'), load: $('loadModelButton'), model: $('modelStatus'),
  focus: $('focusButton'), save: $('saveButton'), newText: $('newTextButton'), file: $('fileInput'), toast: $('toast'), connection: $('connectionPill'),
  dialog: $('shortcutsDialog'), shortcuts: $('shortcutsButton'), closeDialog: $('closeDialogButton'), install: $('installButton'), card: $('readerCard'), dot: $('playStatusDot')
};
const STORE = 'phonon-read-library-v1';
let library = JSON.parse(localStorage.getItem(STORE) || '[]');
let currentId = null;
let tts = null;
let audioContext = null;
let gainNode = null;
let abortController = null;
let isPlaying = false;
let isPaused = false;
let deferredInstall;

const escapeHtml = (value) => value.replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const sentenceParts = (text) => text.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
const markdownToText = (text) => text.replace(/^#{1,6}\s+/gm, '').replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '')).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_~>`]/g, '');
const estimate = (text) => Math.max(1, Math.round(text.trim().split(/\s+/).filter(Boolean).length / 2.45 / Number(els.speed.value)));
const notify = (message) => { els.toast.textContent = message; els.toast.classList.add('show'); setTimeout(() => els.toast.classList.remove('show'), 2600); };

function setConnection() {
  const online = navigator.onLine;
  els.connection.classList.toggle('offline', !online);
  els.connection.querySelector('span').textContent = online ? 'Online · local ready' : 'Offline mode';
}
function renderLibrary() {
  els.library.innerHTML = library.length ? library.map((item) => `<button class="library-item ${item.id === currentId ? 'active' : ''}" data-id="${item.id}"><strong>${escapeHtml(item.title)}</strong><small>${item.words} words · ${item.updated}</small></button>`).join('') : '<p class="library-empty">Your saved passages will appear here.</p>';
  els.library.querySelectorAll('[data-id]').forEach((button) => button.addEventListener('click', () => loadEntry(button.dataset.id)));
}
function renderReading() {
  const text = els.text.value.trim();
  const parts = sentenceParts(text);
  els.empty.classList.toggle('hidden', Boolean(text));
  els.reading.classList.toggle('visible', Boolean(text));
  els.reading.innerHTML = parts.map((part, index) => `<span data-sentence="${index}">${escapeHtml(part)} </span>`).join('');
  els.progressText.textContent = text ? `${parts.length} passages · about ${estimate(text)} min` : 'Ready when you are';
  els.progress.style.width = '0%';
}
function loadEntry(id) {
  const item = library.find((entry) => entry.id === id); if (!item) return;
  stopReading(); currentId = id; els.title.textContent = item.title; els.text.value = item.text; renderReading(); renderLibrary();
}
function saveEntry() {
  const text = els.text.value.trim(); if (!text) return notify('Add some text before saving.');
  const firstLine = text.split('\n').find(Boolean)?.replace(/^#\s*/, '').slice(0, 42) || 'Untitled passage';
  const title = currentId ? (library.find((item) => item.id === currentId)?.title || firstLine) : firstLine;
  const entry = { id: currentId || crypto.randomUUID(), title, text, words: text.split(/\s+/).length, updated: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date()) };
  library = [entry, ...library.filter((item) => item.id !== entry.id)].slice(0, 30); currentId = entry.id; els.title.textContent = title; localStorage.setItem(STORE, JSON.stringify(library)); renderLibrary(); notify('Saved on this device.');
}
function resetText() { stopReading(); currentId = null; els.title.textContent = 'Untitled passage'; els.text.value = ''; renderReading(); renderLibrary(); els.text.focus(); }
function setupAudio() {
  if (!audioContext) { audioContext = new AudioContext({ sampleRate: tts.sampleRate }); gainNode = audioContext.createGain(); gainNode.gain.value = Number(els.volume.value); gainNode.connect(audioContext.destination); }
  if (audioContext.state === 'suspended') audioContext.resume();
}
function markActive(index, total, text) {
  els.reading.querySelectorAll('.active').forEach((node) => node.classList.remove('active'));
  const active = els.reading.querySelector(`[data-sentence="${index}"]`); active?.classList.add('active'); active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  els.sentence.textContent = text.length > 70 ? `${text.slice(0, 70)}…` : text; els.progress.style.width = `${Math.round(((index + 1) / total) * 100)}%`; els.progressText.textContent = `${index + 1} of ${total} · about ${Math.max(0, estimate(els.text.value) - Math.round((index / total) * estimate(els.text.value)))} min left`;
}
async function playReading() {
  if (!tts) return notify('Load Phonon 31M first.');
  const text = els.text.value.trim(); if (!text) return notify('Paste or import text to begin.');
  if (isPaused && audioContext) { await audioContext.resume(); isPaused = false; isPlaying = true; els.play.textContent = '❚❚'; els.play.classList.add('paused'); els.status.textContent = 'Reading'; return; }
  stopReading(false); setupAudio(); isPlaying = true; isPaused = false; els.play.textContent = '❚❚'; els.play.classList.add('paused'); els.dot.classList.add('playing'); els.status.textContent = 'Reading';
  const parts = sentenceParts(els.text.value); abortController = new AbortController();
  for (let i = 0; i < parts.length && isPlaying; i += 1) {
    markActive(i, parts.length, parts[i]);
    const stream = tts.stream(parts[i], { voice: els.voice.value, signal: abortController.signal });
    let cursor = audioContext.currentTime;
    try { for await (const pcm of stream) { if (!isPlaying) break; const buffer = audioContext.createBuffer(1, pcm.length, tts.sampleRate); buffer.getChannelData(0).set(pcm); const source = audioContext.createBufferSource(); source.buffer = buffer; source.playbackRate.value = Number(els.speed.value); source.connect(gainNode); cursor = Math.max(cursor, audioContext.currentTime); source.start(cursor); cursor += buffer.duration / Number(els.speed.value); } await stream.done; } catch (error) { if (isPlaying) { console.error(error); notify('Speech stopped. Try loading the model again.'); } break; }
  }
  if (isPlaying) { isPlaying = false; els.play.textContent = '▶'; els.play.classList.remove('paused'); els.dot.classList.remove('playing'); els.status.textContent = 'Finished'; els.sentence.textContent = 'Passage complete.'; }
}
function stopReading(resetStatus = true) { isPlaying = false; isPaused = false; abortController?.abort(); abortController = null; if (audioContext) { audioContext.close(); audioContext = null; gainNode = null; } els.play.textContent = '▶'; els.play.classList.remove('paused'); els.dot.classList.remove('playing'); if (resetStatus) { els.status.textContent = 'Ready to read'; els.sentence.textContent = 'Add a passage to begin.'; els.progress.style.width = '0%'; els.progressText.textContent = els.text.value.trim() ? `${sentenceParts(els.text.value).length} passages · about ${estimate(els.text.value)} min` : 'Ready when you are'; els.reading.querySelectorAll('.active').forEach((node) => node.classList.remove('active')); } }
async function loadPhonon() {
  els.load.disabled = true; els.load.textContent = 'Loading model…'; els.model.textContent = 'Downloading Phonon 31M. It will be cached for offline use.';
  try { tts = await PhononTTS.load({ lang: 'en', device: 'auto', quant: 'q8', onProgress: ({ loaded, total, cached }) => { const progress = total ? Math.round((loaded / total) * 100) : 0; els.model.textContent = cached ? 'Reading the local model cache…' : `Caching model files… ${progress}%`; } });
    els.voice.innerHTML = tts.voices.map((voice) => `<option value="${escapeHtml(voice)}">${escapeHtml(voice)}</option>`).join(''); els.model.textContent = `Ready offline · ${tts.device === 'webgpu' ? 'WebGPU' : 'CPU'} · ${tts.voices.length} built-in voices`; els.load.textContent = 'Reload model'; notify('Phonon is ready to read.');
  } catch (error) { console.error(error); els.model.textContent = 'Could not load the local model. Check that this page is running on localhost or HTTPS.'; els.load.textContent = 'Try again'; notify('Model loading failed.'); } finally { els.load.disabled = false; }
}

els.text.addEventListener('input', renderReading); els.play.addEventListener('click', () => { if (isPaused && audioContext) { audioContext.resume(); isPaused = false; isPlaying = true; els.play.textContent = '❚❚'; els.play.classList.add('paused'); els.status.textContent = 'Reading'; els.dot.classList.add('playing'); return; } if (isPlaying) { audioContext?.suspend(); isPaused = true; els.status.textContent = 'Paused'; els.dot.classList.remove('playing'); return; } playReading(); }); els.stop.addEventListener('click', () => stopReading()); els.load.addEventListener('click', loadPhonon); els.save.addEventListener('click', saveEntry); els.newText.addEventListener('click', resetText); els.focus.addEventListener('click', () => { document.body.classList.toggle('focus-mode'); els.focus.textContent = document.body.classList.contains('focus-mode') ? '◉ Exit focus' : '◉ Focus mode'; });
els.speed.addEventListener('input', () => { els.speedValue.textContent = `${Number(els.speed.value).toFixed(1)}×`; if (!isPlaying) renderReading(); }); els.volume.addEventListener('input', () => { els.volumeValue.textContent = `${Math.round(Number(els.volume.value) * 100)}%`; if (gainNode) gainNode.gain.value = Number(els.volume.value); });
els.file.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  const lower = file.name.toLowerCase();
  const isBook = lower.endsWith('.epub') || lower.endsWith('.pdf');
  try {
    if (isBook) notify(`Reading ${file.name} — this can take a moment for large books…`);
    const { title, text } = await importBook(file);
    els.text.value = isBook ? text : markdownToText(text);
    els.title.textContent = title || 'Untitled passage';
    currentId = null; renderReading();
    notify(`${file.name} imported locally (${text.split(/\s+/).filter(Boolean).length.toLocaleString()} words).`);
  } catch (error) { console.error(error); notify(error?.message || 'Could not import this file.'); }
  event.target.value = '';
});
els.shortcuts.addEventListener('click', () => els.dialog.showModal()); els.closeDialog.addEventListener('click', () => els.dialog.close()); els.dialog.addEventListener('click', (event) => { if (event.target === els.dialog) els.dialog.close(); });
window.addEventListener('online', setConnection); window.addEventListener('offline', setConnection); window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstall = event; els.install.hidden = false; }); els.install.addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; els.install.hidden = true; });
document.addEventListener('keydown', (event) => { const typing = ['TEXTAREA','INPUT','SELECT'].includes(document.activeElement?.tagName); if (typing) return; if (event.code === 'Space') { event.preventDefault(); els.play.click(); } if (event.key.toLowerCase() === 'f') els.focus.click(); if (event.key === 'Escape') stopReading(); if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); stopReading(); playReading(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn); setConnection(); renderLibrary(); renderReading();
