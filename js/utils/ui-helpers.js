// js/utils/ui-helpers.js — Toast, Loading, Modal, Progress helpers

export function showToast(message, type = 'info', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { error: '⚠️', success: '✅', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}

export function showLoading(container) {
  container.style.position = 'relative';
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loading-overlay';
  overlay.innerHTML = `
    <div class="spinner"></div>
    <span class="loading-text">Đang xử lý PDF...</span>
  `;
  container.appendChild(overlay);
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.remove();
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ============================================================
// PROGRESS BAR
// ============================================================

/**
 * Show a progress bar inside a container
 * @param {HTMLElement} container - parent element
 * @param {string} label - what's being processed (e.g. "Đang tạo thumbnail...")
 * @returns {{ el: HTMLElement, setProgress: (pct: number, text?: string) => void, done: (message?: string) => void, remove: () => void }}
 */
export function showProgress(container, label = 'Đang xử lý...') {
  const el = document.createElement('div');
  el.className = 'progress-container';
  el.id = 'progress-bar';
  el.innerHTML = `
    <div class="progress-label">
      <span>${label}</span>
      <span class="progress-text">0%</span>
    </div>
    <div class="progress-bar-track">
      <div class="progress-bar-fill" style="width:0%"></div>
    </div>
  `;

  // Insert after any existing upload zone, or at top
  const uploadZone = container.querySelector('.upload-zone');
  if (uploadZone && uploadZone.nextSibling) {
    uploadZone.parentNode.insertBefore(el, uploadZone.nextSibling);
  } else {
    container.insertBefore(el, container.firstChild);
  }

  const fill = el.querySelector('.progress-bar-fill');
  const text = el.querySelector('.progress-text');

  return {
    el,
    setProgress(pct, labelText) {
      const p = Math.min(100, Math.max(0, pct));
      fill.style.width = p + '%';
      text.textContent = labelText || Math.round(p) + '%';
    },
    done(message) {
      fill.style.width = '100%';
      el.classList.add('complete');
      if (message) {
        text.textContent = message;
        el.querySelector('.progress-label span:first-child').textContent = message;
      }
      setTimeout(() => el.remove(), 1500);
    },
    remove() {
      el.remove();
    }
  };
}

/**
 * Quick inline progress (no bar, just a status indicator)
 * @param {string} text
 * @returns {HTMLElement}
 */
export function inlineStatus(text) {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);padding:8px 0;';
  el.textContent = text;
  return el;
}

/**
 * Escape HTML to prevent XSS in innerHTML
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
