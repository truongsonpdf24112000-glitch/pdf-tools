// js/app.js — App shell: sidebar, routing, theme toggle

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

import editTool from './tools/edit.js';
import convertTool from './tools/convert.js';
import advancedTool from './tools/advanced.js';
import specialTool from './tools/special.js';

const TOOLS = [
  { id: 'edit', name: 'Chỉnh sửa PDF', icon: '📑', status: 'active', group: 'edit',
    desc: 'Sắp xếp, trộn, tách, xoay, xóa trang' },

  { id: 'convert', name: 'Chuyển đổi định dạng', icon: '🔄', status: 'active', group: 'convert',
    desc: 'PDF↔Office, PDF↔Ảnh, HTML→PDF' },

  { id: 'advanced', name: 'Công cụ nâng cao', icon: '⚙️', status: 'active', group: 'advanced',
    desc: 'Cắt lề, Watermark, Header/Footer, Grayscale, Flatten, Redact, Nén, Số trang, Khóa, Trích xuất ảnh' },

  { id: 'special', name: 'Công cụ chuyên dụng', icon: '🔧', status: 'active', group: 'special',
    desc: 'So sánh PDF, Bates Numbering, Scan to PDF, Sửa PDF lỗi' },
];

const toolMap = {
  edit: editTool,
  convert: convertTool,
  advanced: advancedTool,
  special: specialTool,
};

const GROUP_LABELS = {
  edit: '📑 Chỉnh sửa PDF',
  convert: '🔄 Chuyển đổi định dạng',
  advanced: '⚙️ Công cụ nâng cao',
  special: '🔧 Công cụ chuyên dụng',
};

function renderSidebar(activeId) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const groups = {};
  TOOLS.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  });

  const nav = Object.entries(groups).map(([key, tools]) => `
    <div class="tool-group">
      <div class="tool-group-label">${GROUP_LABELS[key] || key}</div>
      ${tools.map(t => `
        <a href="#${t.id}" class="tool-item ${t.id===activeId?'active':''} ${t.status}" data-tool="${t.id}">
          <span class="tool-icon">${t.icon}</span>
          <span class="tool-name">${t.name}</span>
        </a>
      `).join('')}
    </div>
  `).join('');

  sidebar.innerHTML = `
    <div class="sidebar-header" id="sidebar-home-btn" style="cursor:pointer;">
      <h1>Chỉnh Sửa PDF</h1>
      <p class="subtitle">Công cụ văn phòng miễn phí</p>
    </div>
    <nav class="tool-nav">${nav}</nav>
    <div class="sidebar-footer">
      <span style="font-size:0.7rem;color:var(--text-muted);">v5.0.0 · 4 tools</span>
      <button class="theme-toggle" id="theme-toggle" title="Đổi giao diện">🌙</button>
    </div>`;

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  updateThemeIcon();
  document.getElementById('sidebar-home-btn')?.addEventListener('click', () => showHome());
  sidebar.querySelectorAll('.tool-item:not(.coming-soon)').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); activateTool(item.dataset.tool); });
  });
}

function toggleTheme() {
  const h = document.documentElement;
  const n = h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  h.setAttribute('data-theme', n);
  localStorage.setItem('pdf-tools-theme', n);
  updateThemeIcon();
}

function updateThemeIcon() {
  const b = document.getElementById('theme-toggle');
  if (b) b.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '🌙' : '☀️';
}

function activateTool(id) {
  document.querySelectorAll('.tool-item').forEach(i => i.classList.toggle('active', i.dataset.tool === id));
  window.location.hash = id;
  const t = toolMap[id];
  if (t) t.init();
  document.getElementById('sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('open');
}

function setupMobile() {
  const b = document.createElement('button'); b.className = 'menu-btn'; b.id = 'menu-btn'; b.innerHTML = '☰';
  document.body.appendChild(b);
  const o = document.createElement('div'); o.className = 'sidebar-overlay'; o.id = 'sidebar-overlay';
  document.body.appendChild(o);
  b.addEventListener('click', () => { document.getElementById('sidebar').classList.toggle('open'); o.classList.toggle('open'); });
  o.addEventListener('click', () => { document.getElementById('sidebar').classList.remove('open'); o.classList.remove('open'); });
}

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('pdf-tools-theme') || 'dark');
  const h = window.location.hash.replace('#', '');
  renderSidebar(h || 'home');
  setupMobile();
  if (toolMap[h]) activateTool(h); else showHome();
  window.addEventListener('hashchange', () => { const nh = window.location.hash.replace('#',''); if (toolMap[nh]) activateTool(nh); else showHome(); });
});

// Show home/landing page when no tool selected
function showHome() {
  const container = document.getElementById('tool-container');
  window.location.hash = 'home';

  container.innerHTML = `
    <div class="home-hero">
      <h1 class="hero-title">Chỉnh Sửa PDF</h1>
      <p class="hero-sub">4 nhóm công cụ — miễn phí, không cần cài đặt, không cần upload</p>
      <p class="hero-desc">Xử lý <strong>100% trên trình duyệt</strong>. File của bạn <strong>không bao giờ rời khỏi máy</strong>.</p>
      <div class="hero-stats">
        <div class="hero-stat"><strong>4</strong><span>nhóm công cụ</span></div>
        <div class="hero-stat"><strong>0₫</strong><span>miễn phí</span></div>
        <div class="hero-stat"><strong>100%</strong><span>bảo mật</span></div>
      </div>
    </div>

    <div class="home-upload-zone" id="home-upload-zone">
      <div class="upload-icon">📄</div>
      <h3>Kéo thả file PDF vào đây để bắt đầu</h3>
      <p class="sub">hoặc click để chọn file</p>
      <p class="file-info">Hỗ trợ PDF, Word, Excel, PPT, JPG, PNG, HTML · Tối đa 100MB</p>
    </div>
    <input type="file" id="home-file-input" accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.bmp,.html,.htm" hidden>
  `;

  // Upload zone events
  const zone = document.getElementById('home-upload-zone');
  const input = document.getElementById('home-file-input');

  const handleFile = (file) => {
    if (!file) return;
    window.__pendingPdfFile = file;
    activateTool('edit');
  };

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
}
