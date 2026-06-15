// js/app.js — App shell: sidebar, routing, theme toggle

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

import reorderTool from './tools/reorder.js';
import mergeTool from './tools/merge.js';
import splitTool from './tools/split.js';
import rotateTool from './tools/rotate.js';
import deleteTool from './tools/delete.js';
import pageNumTool from './tools/page-num.js';
import lockTool from './tools/lock.js';
import compressTool from './tools/compress.js';

import pdfToJpgTool from './tools/pdf-to-jpg.js';
import jpgToPdfTool from './tools/jpg-to-pdf.js';
import pdfToOfficeTool from './tools/pdf-to-office.js';
import officeToPdfTool from './tools/office-to-pdf.js';
import htmlToPdfTool from './tools/html-to-pdf.js';
import extractImagesTool from './tools/extract-images.js';

import cropPdfTool from './tools/crop-pdf.js';
import watermarkTool from './tools/watermark.js';
import headerFooterTool from './tools/header-footer.js';
import grayscaleTool from './tools/grayscale-pdf.js';
import flattenPdfTool from './tools/flatten-pdf.js';
import redactPdfTool from './tools/redact-pdf.js';

const TOOLS = [
  { id: 'reorder',  name: 'Sắp xếp trang PDF',    icon: '📑', status: 'active', group: 'edit' },
  { id: 'merge',    name: 'Trộn PDF',              icon: '🔀', status: 'active', group: 'edit' },
  { id: 'split',    name: 'Tách trang PDF',        icon: '✂️', status: 'active', group: 'edit' },
  { id: 'rotate',   name: 'Xoay trang PDF',        icon: '🔄', status: 'active', group: 'edit' },
  { id: 'delete',   name: 'Xóa trang PDF',         icon: '🗑️', status: 'active', group: 'edit' },

  { id: 'pdf-to-office',  name: 'PDF → Word/Excel/PPT', icon: '📄➡️📝', status: 'active', group: 'convert' },
  { id: 'office-to-pdf',  name: 'Word/Excel/PPT → PDF', icon: '📝➡️📄', status: 'active', group: 'convert' },
  { id: 'pdf-to-jpg',     name: 'PDF → JPG',            icon: '📄➡️🖼️', status: 'active', group: 'convert' },
  { id: 'jpg-to-pdf',     name: 'JPG → PDF',            icon: '🖼️➡️📄', status: 'active', group: 'convert' },
  { id: 'html-to-pdf',    name: 'HTML → PDF',           icon: '🌐➡️📄', status: 'active', group: 'convert' },

  { id: 'crop',         name: 'Cắt lề PDF',          icon: '✂️',  status: 'active', group: 'advanced' },
  { id: 'watermark',    name: 'Watermark',            icon: '💧',  status: 'active', group: 'advanced' },
  { id: 'header-footer',name: 'Header & Footer',      icon: '📋',  status: 'active', group: 'advanced' },
  { id: 'grayscale',    name: 'Grayscale',            icon: '⬛⬜', status: 'active', group: 'advanced' },
  { id: 'flatten',      name: 'Flatten PDF',          icon: '🔨',  status: 'active', group: 'advanced' },
  { id: 'redact',       name: 'Redact (che ND)',      icon: '⬛',   status: 'active', group: 'advanced' },
  { id: 'compress',     name: 'Nén PDF',              icon: '📦',  status: 'active', group: 'advanced' },
  { id: 'page-num',     name: 'Thêm số trang',        icon: '🔢',  status: 'active', group: 'advanced' },
  { id: 'lock',         name: 'Khóa / Mở khóa PDF',   icon: '🔒',  status: 'active', group: 'advanced' },
  { id: 'extract-img',  name: 'Trích xuất ảnh',       icon: '🖼️',  status: 'active', group: 'advanced' },
];

const toolMap = {
  reorder: reorderTool, merge: mergeTool, split: splitTool,
  rotate: rotateTool, delete: deleteTool, 'page-num': pageNumTool,
  lock: lockTool, compress: compressTool,
  'pdf-to-jpg': pdfToJpgTool, 'jpg-to-pdf': jpgToPdfTool,
  'pdf-to-office': pdfToOfficeTool, 'office-to-pdf': officeToPdfTool,
  'html-to-pdf': htmlToPdfTool, 'extract-img': extractImagesTool,
  crop: cropPdfTool, watermark: watermarkTool,
  'header-footer': headerFooterTool, grayscale: grayscaleTool,
  flatten: flattenPdfTool, redact: redactPdfTool,
};

function renderSidebar(activeId = 'reorder') {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const groups = {
    edit: { label: '📑 Chỉnh sửa trang', tools: [] },
    convert: { label: '🔄 Chuyển đổi định dạng', tools: [] },
    advanced: { label: '⚙️ Công cụ nâng cao', tools: [] },
  };

  TOOLS.forEach(t => { if (groups[t.group]) groups[t.group].tools.push(t); });

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <h1>Chỉnh Sửa PDF</h1>
      <p class="subtitle">Công cụ văn phòng miễn phí</p>
    </div>
    <nav class="tool-nav">
      ${Object.entries(groups).map(([gid, g]) => `
        <div class="tool-group">
          <div class="tool-group-label">${g.label}</div>
          ${g.tools.map(t => `
            <a href="#${t.id}" class="tool-item ${t.id === activeId ? 'active' : ''} ${t.status}"
               data-tool="${t.id}">
              <span class="tool-icon">${t.icon}</span>
              <span class="tool-name">${t.name}</span>
              ${t.status === 'coming-soon' ? '<span class="badge">Sắp ra mắt</span>' : ''}
            </a>
          `).join('')}
        </div>
      `).join('')}
    </nav>
    <div class="sidebar-footer">
      <span style="font-size: 0.7rem; color: var(--text-muted);">v3.0.0 · 20 tools</span>
      <button class="theme-toggle" id="theme-toggle" title="Đổi giao diện">🌙</button>
    </div>
  `;

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  updateThemeIcon();

  sidebar.querySelectorAll('.tool-item.active, .tool-item:not(.coming-soon)').forEach(item => {
    item.addEventListener('click', (e) => {
      const toolId = item.dataset.tool;
      if (item.classList.contains('coming-soon')) { e.preventDefault(); return; }
      e.preventDefault();
      activateTool(toolId);
    });
  });
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('pdf-tools-theme', next);
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function activateTool(toolId) {
  document.querySelectorAll('.tool-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tool === toolId);
  });
  window.location.hash = toolId;
  const tool = toolMap[toolId];
  if (tool) { tool.init(); }
  document.getElementById('sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('open');
}

function setupMobile() {
  const btn = document.createElement('button');
  btn.className = 'menu-btn'; btn.innerHTML = '☰'; btn.id = 'menu-btn';
  document.body.appendChild(btn);
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay'; overlay.id = 'sidebar-overlay';
  document.body.appendChild(overlay);
  btn.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    overlay.classList.toggle('open');
  });
  overlay.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    overlay.classList.remove('open');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('pdf-tools-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  renderSidebar();
  setupMobile();
  const hash = window.location.hash.replace('#', '');
  const activeTool = toolMap[hash] ? hash : 'reorder';
  activateTool(activeTool);
  window.addEventListener('hashchange', () => {
    const newHash = window.location.hash.replace('#', '');
    if (toolMap[newHash]) { activateTool(newHash); }
  });
});
