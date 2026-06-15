// js/app.js — App shell: sidebar, routing, theme toggle

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
import comparePdfTool from './tools/compare-pdf.js';
import batesNumberingTool from './tools/bates-numbering.js';
import scanToPdfTool from './tools/scan-to-pdf.js';
import repairPdfTool from './tools/repair-pdf.js';

const TOOLS = [
  { id: 'reorder', name: 'Sắp xếp trang PDF', icon: '📑', status: 'active', group: 'edit' },
  { id: 'merge', name: 'Trộn PDF', icon: '🔀', status: 'active', group: 'edit' },
  { id: 'split', name: 'Tách trang PDF', icon: '✂️', status: 'active', group: 'edit' },
  { id: 'rotate', name: 'Xoay trang PDF', icon: '🔄', status: 'active', group: 'edit' },
  { id: 'delete', name: 'Xóa trang PDF', icon: '🗑️', status: 'active', group: 'edit' },

  { id: 'pdf-to-office', name: 'PDF → Word/Excel/PPT', icon: '📄➡️📝', status: 'active', group: 'convert' },
  { id: 'office-to-pdf', name: 'Word/Excel/PPT → PDF', icon: '📝➡️📄', status: 'active', group: 'convert' },
  { id: 'pdf-to-jpg', name: 'PDF → JPG', icon: '📄➡️🖼️', status: 'active', group: 'convert' },
  { id: 'jpg-to-pdf', name: 'JPG → PDF', icon: '🖼️➡️📄', status: 'active', group: 'convert' },
  { id: 'html-to-pdf', name: 'HTML → PDF', icon: '🌐➡️📄', status: 'active', group: 'convert' },

  { id: 'crop', name: 'Cắt lề PDF', icon: '✂️', status: 'active', group: 'advanced' },
  { id: 'watermark', name: 'Watermark', icon: '💧', status: 'active', group: 'advanced' },
  { id: 'header-footer', name: 'Header & Footer', icon: '📋', status: 'active', group: 'advanced' },
  { id: 'grayscale', name: 'Grayscale', icon: '⬛⬜', status: 'active', group: 'advanced' },
  { id: 'flatten', name: 'Flatten PDF', icon: '🔨', status: 'active', group: 'advanced' },
  { id: 'redact', name: 'Redact (che ND)', icon: '⬛', status: 'active', group: 'advanced' },
  { id: 'compress', name: 'Nén PDF', icon: '📦', status: 'active', group: 'advanced' },
  { id: 'page-num', name: 'Thêm số trang', icon: '🔢', status: 'active', group: 'advanced' },
  { id: 'lock', name: 'Khóa / Mở khóa PDF', icon: '🔒', status: 'active', group: 'advanced' },
  { id: 'extract-img', name: 'Trích xuất ảnh', icon: '🖼️', status: 'active', group: 'advanced' },

  { id: 'compare', name: 'So sánh PDF', icon: '🔍', status: 'active', group: 'special' },
  { id: 'bates', name: 'Bates Numbering', icon: '🔢', status: 'active', group: 'special' },
  { id: 'scan', name: 'Scan to PDF', icon: '📸', status: 'active', group: 'special' },
  { id: 'repair', name: 'Sửa PDF lỗi', icon: '🔧', status: 'active', group: 'special' },
];

const toolMap = {
  reorder: reorderTool, merge: mergeTool, split: splitTool, rotate: rotateTool,
  delete: deleteTool, 'page-num': pageNumTool, lock: lockTool, compress: compressTool,
  'pdf-to-jpg': pdfToJpgTool, 'jpg-to-pdf': jpgToPdfTool,
  'pdf-to-office': pdfToOfficeTool, 'office-to-pdf': officeToPdfTool,
  'html-to-pdf': htmlToPdfTool, 'extract-img': extractImagesTool,
  crop: cropPdfTool, watermark: watermarkTool,
  'header-footer': headerFooterTool, grayscale: grayscaleTool,
  flatten: flattenPdfTool, redact: redactPdfTool,
  compare: comparePdfTool, bates: batesNumberingTool,
  scan: scanToPdfTool, repair: repairPdfTool,
};

function renderSidebar(activeId) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const groups = {
    edit: { label: '📑 Chỉnh sửa trang', tools: [] },
    convert: { label: '🔄 Chuyển đổi định dạng', tools: [] },
    advanced: { label: '⚙️ Công cụ nâng cao', tools: [] },
    special: { label: '🔧 Công cụ chuyên dụng', tools: [] },
  };
  TOOLS.forEach(t => { if (groups[t.group]) groups[t.group].tools.push(t); });
  sidebar.innerHTML = `<div class="sidebar-header"><h1>Chỉnh Sửa PDF</h1><p class="subtitle">Công cụ văn phòng miễn phí</p></div><nav class="tool-nav">${Object.entries(groups).map(([,g]) => `<div class="tool-group"><div class="tool-group-label">${g.label}</div>${g.tools.map(t => `<a href="#${t.id}" class="tool-item ${t.id===activeId?'active':''} ${t.status}" data-tool="${t.id}"><span class="tool-icon">${t.icon}</span><span class="tool-name">${t.name}</span></a>`).join('')}</div>`).join('')}</nav><div class="sidebar-footer"><span style="font-size:0.7rem;color:var(--text-muted);">v4.0.0 · 24 tools</span><button class="theme-toggle" id="theme-toggle" title="Đổi giao diện">🌙</button></div>`;
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  updateThemeIcon();
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
  renderSidebar(h || 'reorder');
  setupMobile();
  activateTool(toolMap[h] ? h : 'reorder');
  window.addEventListener('hashchange', () => { const nh = window.location.hash.replace('#',''); if (toolMap[nh]) activateTool(nh); });
});
