// js/tools/compare-pdf.js — Tool: So sánh 2 file PDF
import { PDFEngine } from '../utils/pdf-engine.js';
import { showToast, showLoading, hideLoading, formatFileSize } from '../utils/ui-helpers.js';

class ComparePdfTool {
  constructor() {
    this.state = {
      fileA: null, fileB: null,  // {name, size, bytes, pdfjsDoc, text: string, pages: number}
      diffs: []
    };
  }

  init() { this.render(); this.setupEvents(); }

  render() {
    const c = document.getElementById('tool-container');
    c.innerHTML = `
      <div class="compare-dual">
        <div class="compare-side">
          <div class="upload-zone" id="zone-a"><div class="upload-icon">📄</div><h3>File A (bản gốc)</h3><p class="sub">Kéo thả hoặc click để chọn</p></div>
          <input type="file" id="file-a" accept=".pdf,application/pdf" hidden>
        </div>
        <div class="compare-vs">VS</div>
        <div class="compare-side">
          <div class="upload-zone" id="zone-b"><div class="upload-icon">📄</div><h3>File B (bản so sánh)</h3><p class="sub">Kéo thả hoặc click để chọn</p></div>
          <input type="file" id="file-b" accept=".pdf,application/pdf" hidden>
        </div>
      </div>
      <div id="results-area" style="display:none;"></div>`;
  }

  setupEvents() {
    for (const side of ['a', 'b']) {
      const zone = document.getElementById(`zone-${side}`);
      const input = document.getElementById(`file-${side}`);
      zone.addEventListener('click', () => input.click());
      input.addEventListener('change', e => { if (e.target.files[0]) this.handleFile(side, e.target.files[0]); });
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) this.handleFile(side, e.dataTransfer.files[0]); });
    }
  }

  async handleFile(side, file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) { showToast('Chọn file PDF', 'error'); return; }
    const zone = document.getElementById(`zone-${side}`);
    zone.className = 'upload-zone compact';
    zone.innerHTML = `<span class="upload-icon">📄</span><div class="upload-text"><h3>${this.esc(file.name)}</h3><span class="sub">${formatFileSize(file.size)} — Đang đọc...</span></div>`;

    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const { pdfjsDoc, pageCount } = await PDFEngine.load(buf);
      const text = await this.extractText(pdfjsDoc);
      this.state[`file${side.toUpperCase()}`] = { name: file.name, size: file.size, bytes, pdfjsDoc, text, pages: pageCount };
      zone.querySelector('.sub').textContent = `${formatFileSize(file.size)} · ${pageCount} trang ✅`;

      if (this.state.fileA && this.state.fileB) this.showCompare();
    } catch (e) {
      zone.querySelector('.sub').textContent = '❌ Lỗi đọc file';
      console.error(e);
    }
  }

  extractText(doc) {
    const texts = [];
    const promises = [];
    for (let i = 1; i <= doc.numPages; i++) {
      promises.push(
        doc.getPage(i).then(page =>
          page.getTextContent().then(tc => texts.push(tc.items.map(it => it.str).join(' ')))
        )
      );
    }
    return Promise.all(promises).then(() => texts.join('\n'));
  }

  showCompare() {
    const r = document.getElementById('results-area');
    r.style.display = 'block';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = '🔍 So sánh ngay';
    btn.style.cssText = 'display:block;margin:20px auto;padding:14px 40px;font-size:1rem;';
    btn.addEventListener('click', () => this.compare());
    r.innerHTML = '';
    r.appendChild(btn);
  }

  async compare() {
    const btn = document.querySelector('#results-area .btn-primary');
    btn.disabled = true; btn.textContent = '⏳ Đang so sánh...';

    const a = this.state.fileA, b = this.state.fileB;
    const linesA = a.text.split('\n').filter(l => l.trim());
    const linesB = b.text.split('\n').filter(l => l.trim());

    // Simple diff: longest common subsequence approach
    const maxLen = Math.max(linesA.length, linesB.length);
    const diffs = [];
    let matchCount = 0;

    for (let i = 0; i < maxLen; i++) {
      const la = linesA[i] || '';
      const lb = linesB[i] || '';
      if (la.trim() === lb.trim()) {
        diffs.push({ type: 'match', a: la, b: lb });
        matchCount++;
      } else if (!la) {
        diffs.push({ type: 'added', a: '', b: lb });
      } else if (!lb) {
        diffs.push({ type: 'removed', a: la, b: '' });
      } else {
        // Find character-level diff for similar lines
        const charDiff = this.charDiff(la, lb);
        diffs.push({ type: 'changed', a: la, b: lb, charDiff });
      }
    }

    const percent = linesA.length > 0 ? Math.round(matchCount / linesA.length * 100) : 0;
    this.renderDiff(a, b, diffs, percent, matchCount, maxLen);
  }

  charDiff(a, b) {
    const result = [];
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        result.push({ type: 'same', char: a[i] });
        i++; j++;
      } else {
        if (i < a.length) { result.push({ type: 'rem', char: a[i] }); i++; }
        if (j < b.length) { result.push({ type: 'add', char: b[j] }); j++; }
      }
    }
    return result;
  }

  renderDiff(a, b, diffs, percent, matchCount, total) {
    const r = document.getElementById('results-area');
    const color = percent >= 90 ? 'var(--success)' : percent >= 50 ? 'var(--warning)' : 'var(--danger)';

    r.innerHTML = `
      <div class="convert-card" style="max-width:900px;">
        <div style="text-align:center;margin-bottom:16px;">
          <span style="font-size:2rem;display:block;color:${color};">${percent}% khớp</span>
          <span style="font-size:0.85rem;color:var(--text-muted);">${matchCount}/${total} dòng khớp</span>
        </div>

        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <div style="flex:1;">
            <h4 style="margin:0 0 6px;">📄 ${this.esc(a.name)} (${a.pages} trang)</h4>
          </div>
          <div style="flex:1;">
            <h4 style="margin:0 0 6px;">📄 ${this.esc(b.name)} (${b.pages} trang)</h4>
          </div>
        </div>

        <div class="diff-list" style="max-height:500px;overflow-y:auto;">
          ${diffs.map((d, i) => `
            <div class="diff-line diff-${d.type}">
              <span class="diff-num">${i+1}</span>
              <div class="diff-content">
                <div class="diff-a">${d.a ? this.esc(d.a) : '<span style="color:var(--text-muted);">(trống)</span>'}</div>
                <div class="diff-b">${d.b ? this.esc(d.b) : '<span style="color:var(--text-muted);">(trống)</span>'}</div>
                ${d.charDiff ? `<div class="diff-char-detail">${d.charDiff.map(c => {
                  if (c.type === 'same') return `<span class="dc-same">${this.esc(c.char)}</span>`;
                  if (c.type === 'rem') return `<span class="dc-rem">${this.esc(c.char)}</span>`;
                  return `<span class="dc-add">${this.esc(c.char)}</span>`;
                }).join('')}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

const tool = new ComparePdfTool();
export default tool;
