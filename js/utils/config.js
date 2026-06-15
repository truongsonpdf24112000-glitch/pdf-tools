// js/utils/config.js — Backend URL configuration
// Auto-detect: localhost first, then cloud fallback

const BACKEND_URLS = [
  'http://localhost:5001',                          // Local dev
  'https://pdf-tools-backend.onrender.com',          // Render cloud (Sếp tự đặt tên)
];

let cachedBackendUrl = null;

export async function getBackendUrl() {
  if (cachedBackendUrl) return cachedBackendUrl;

  // Try each URL, return first one that responds
  for (const url of BACKEND_URLS) {
    try {
      const resp = await fetch(`${url}/health`, {
        mode: 'cors',
        signal: AbortSignal.timeout(2000)
      });
      if (resp.ok) {
        cachedBackendUrl = url;
        console.log(`Backend found at: ${url}`);
        return url;
      }
    } catch {}
  }

  // All failed
  console.warn('No backend available');
  return null;
}

export default BACKEND_URLS[1]; // Cloud URL as default for production
