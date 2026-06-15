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

// Tool registry
const TOOLS = [
  { id: 'reorder',  name: 'Sắp xếp trang PDF',    icon: '📑', status: 'active' },
  { id: 'merge',    name: 'Trộn PDF',              icon: '🔀', status: 'active' },
  { id: 'split',    name: 'Tách trang PDF',        icon: '✂️', status: 'active' },
  { id: 'rotate',   name: 'Xoay trang PDF',        icon: '🔄', status: 'active' },
  { id: 'delete',   name: 'Xóa trang PDF',         icon: '🗑️', status: 'active' },
  { id: 'compress', name: 'Nén PDF',               icon: '📦', status: 'active' },
  { id: 'page-num', name: 'Thêm số trang',          icon: '🔢', status: 'active' },
  { id: 'lock',     name: 'Khóa / Mở khóa PDF',    icon: '🔒', status: 'active' },
];

const toolMap = {
  reorder: reorderTool,
  merge: mergeTool,
  split: splitTool,
  rotate: rotateTool,
  delete: deleteTool,
  'page-num': pageNumTool,
  lock: lockTool,
  compress: compressTool,
};

function renderSidebar(activeId = 'reorder') {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <h1>Chỉnh Sửa PDF</h1>
      <p class="subtitle">Công cụ văn phòng miễn phí</p>
    </div>
    <nav class="tool-nav">
      ${TOOLS.map(t => `
        <a href="#${t.id}" class="tool-item ${t.id === activeId ? 'active' : ''} ${t.status}"
           data-tool="${t.id}">
          <span class="tool-icon">${t.icon}</span>
          <span class="tool-name">${t.name}</span>
          ${t.status === 'coming-soon' ? '<span class="badge">Sắp ra mắt</span>' : ''}
        </a>
      `).join('')}
    </nav>
    <div class="sidebar-footer">
      <span style="font-size: 0.7rem; color: var(--text-muted);">v1.0.0</span>
      <button class="theme-toggle" id="theme-toggle" title="Đổi giao diện">🌙</button>
    </div>
  `;

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  updateThemeIcon();

  // Sidebar navigation
  sidebar.querySelectorAll('.tool-item.active, .tool-item:not(.coming-soon)').forEach(item => {
    item.addEventListener('click', (e) => {
      const toolId = item.dataset.tool;
      if (item.classList.contains('coming-soon')) {
        e.preventDefault();
        return;
      }
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
  // Update sidebar active state
  document.querySelectorAll('.tool-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tool === toolId);
  });

  // Update URL hash
  window.location.hash = toolId;

  // Load tool
  const tool = toolMap[toolId];
  if (tool) {
    tool.init();
  }

  // Close mobile sidebar
  document.getElementById('sidebar')?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.classList.remove('open');
}

// Mobile menu
function setupMobile() {
  // Create menu button
  const btn = document.createElement('button');
  btn.className = 'menu-btn';
  btn.innerHTML = '☰';
  btn.id = 'menu-btn';
  document.body.appendChild(btn);

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebar-overlay';
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

// Init
document.addEventListener('DOMContentLoaded', () => {
  // Theme from localStorage
  const savedTheme = localStorage.getItem('pdf-tools-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Render sidebar
  renderSidebar();

  // Setup mobile
  setupMobile();

  // Activate tool from hash or default to reorder
  const hash = window.location.hash.replace('#', '');
  const activeTool = toolMap[hash] ? hash : 'reorder';
  activateTool(activeTool);

  // Handle hash changes
  window.addEventListener('hashchange', () => {
    const newHash = window.location.hash.replace('#', '');
    if (toolMap[newHash]) {
      activateTool(newHash);
    }
  });
});
