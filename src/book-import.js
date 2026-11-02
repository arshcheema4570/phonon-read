/* Offline book import: EPUB (via JSZip) and PDF (via pdfjs-dist).
 * Everything runs locally in the browser. No network, no server.
 */
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const byTag = (doc, name) => {
  const found = doc.getElementsByTagNameNS('*', name);
  if (found.length) return [...found];
  return [...doc.getElementsByTagName(name)];
};
const parseXml = (text) => {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('unreadable XML');
  return doc;
};

/* ---------------- EPUB ---------------- */
async function importEpub(file) {
  const zip = await JSZip.loadAsync(file);
  if (zip.file('META-INF/encryption.xml')) {
    throw new Error('This EPUB is DRM-protected and cannot be opened.');
  }
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Not a valid EPUB (no container.xml).');
  const container = parseXml(await containerFile.async('text'));
  const rootfile = byTag(container, 'rootfile')[0];
  const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath) throw new Error('Not a valid EPUB (no OPF found).');
  const opfFile = zip.file(decodeURIComponent(opfPath));
  if (!opfFile) throw new Error('EPUB package file missing.');
  const opf = parseXml(await opfFile.async('text'));
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const title = byTag(opf, 'title')[0]?.textContent?.trim()
    || file.name.replace(/\.epub$/i, '');

  const manifest = {};
  byTag(opf, 'item').forEach((item) => {
    manifest[item.getAttribute('id')] = {
      href: item.getAttribute('href'),
      type: item.getAttribute('media-type') || '',
    };
  });
  const spine = byTag(opf, 'itemref')
    .filter((ref) => ref.getAttribute('linear') !== 'no')
    .map((ref) => ref.getAttribute('idref'))
    .filter((id) => manifest[id]);

  const chapters = [];
  for (const id of spine) {
    const { href, type } = manifest[id];
    if (!/xhtml|html/i.test(type) && !/\.x?html?$/i.test(href)) continue;
    const path = opfDir + href.split('#')[0];
    const entry = zip.file(decodeURIComponent(path)) || zip.file(path);
    if (!entry) continue;
    const html = await entry.async('text');
    let doc;
    try { doc = new DOMParser().parseFromString(html, 'application/xhtml+xml'); }
    catch (e) { doc = new DOMParser().parseFromString(html, 'text/html'); }
    if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style').forEach((n) => n.remove());
    const body = doc.querySelector('body') || doc.documentElement;
    const text = extractBlocks(body);
    if (text.trim()) chapters.push(text.trim());
  }
  if (!chapters.length) throw new Error('No readable chapters found in this EPUB.');
  return { title, text: chapters.join('\n\n') };
}

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV', 'BR', 'TR', 'BLOCKQUOTE', 'SECTION', 'ARTICLE']);
function extractBlocks(root) {
  const parts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  let pendingBreak = false;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.replace(/\s+/g, ' ');
    if (text.trim()) {
      if (pendingBreak && parts.length) parts.push('\n\n');
      parts.push(text.trim());
      pendingBreak = false;
    }
    let el = node.parentElement;
    while (el && el !== root && !BLOCKS.has(el.tagName)) el = el.parentElement;
    if (el && el !== root) pendingBreak = true;
  }
  return parts.join(' ').replace(/ \n\n /g, '\n\n');
}

/* ---------------- PDF ---------------- */
async function importPdf(file) {
  const data = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data }).promise;
  } catch (e) {
    if (/password/i.test(e?.name || '') || /password/i.test(e?.message || '')) {
      throw new Error('This PDF is password-protected and cannot be opened.');
    }
    throw new Error('Could not read this PDF.');
  }
  let title = file.name.replace(/\.pdf$/i, '');
  try {
    const meta = await pdf.getMetadata();
    if (meta?.info?.Title) title = String(meta.info.Title);
  } catch (e) { /* keep filename */ }
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines = [];
    for (const item of content.items) {
      line += item.str;
      if (item.hasEOL) { lines.push(line); line = ''; }
      else line += ' ';
    }
    if (line.trim()) lines.push(line);
    const text = lines.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text) pages.push(text);
    page.cleanup();
  }
  if (typeof pdf.cleanup === 'function') pdf.cleanup();
  if (!pages.length) throw new Error('No extractable text in this PDF (it may be scanned images).');
  return { title, text: pages.join('\n\n') };
}

/* ---------------- entry ---------------- */
export async function importBook(file, onProgress) {
  const name = file.name.toLowerCase();
  onProgress?.(`Reading ${file.name}…`);
  if (name.endsWith('.epub')) return importEpub(file);
  if (name.endsWith('.pdf')) return importPdf(file);
  const text = await file.text();
  return { title: file.name.replace(/\.(md|txt)$/i, ''), text };
}
