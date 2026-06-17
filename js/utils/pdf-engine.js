// js/utils/pdf-engine.js — Wrapper for pdf-lib + PDF.js
import { showToast, showProgress } from './ui-helpers.js';

export class PDFEngine {

  /**
   * Load a PDF from ArrayBuffer using both pdf-lib and PDF.js
   * @param {ArrayBuffer} arrayBuffer
   * @returns {{ pdfDoc, pdfjsDoc, bytes: Uint8Array, pageCount: number }}
   */
  static async load(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);

    // Load with pdf-lib (for editing)
    const pdfDoc = await PDFLib.PDFDocument.load(bytes, {
      ignoreEncryption: true
    });

    // Load with PDF.js (for rendering thumbnails)
    const pdfjsDoc = await pdfjsLib.getDocument({
      data: bytes.slice(),
      disableAutoFetch: true,
      disableStream: false
    }).promise;

    return {
      pdfDoc,
      pdfjsDoc,
      bytes,
      pageCount: pdfjsDoc.numPages
    };
  }

  /**
   * Render thumbnails for all pages — sync version (legacy, blocks UI)
   */
  static async renderThumbnails(pdfjsDoc, scale = 0.3) {
    const pages = [];
    for (let i = 1; i <= pdfjsDoc.numPages; i++) {
      const page = await pdfjsDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push({
        index: i - 1,
        thumbnail: canvas.toDataURL('image/png', 0.7),
        width: viewport.width,
        height: viewport.height
      });
    }
    return pages;
  }

  /**
   * Render thumbnails with progress — chunked, non-blocking
   * Renders in batches of CHUNK_SIZE pages, yielding to browser between batches.
   * 
   * @param {PDFDocumentProxy} pdfjsDoc
   * @param {number} scale
   * @param {HTMLElement} container - DOM element to show progress bar in
   * @param {Function} onPage - optional callback(index, thumbnail) per page
   * @returns {Promise<Array<{index, thumbnail, width, height}>>}
   */
  static async renderThumbnailsWithProgress(pdfjsDoc, scale = 0.3, container = null, onPage = null) {
    const CHUNK_SIZE = 4;
    const total = pdfjsDoc.numPages;
    const pages = [];
    let progressBar = null;

    if (container) {
      progressBar = showProgress(container, `Đang tạo thumbnail ${total} trang...`);
    }

    for (let i = 1; i <= total; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE - 1, total);
      const chunk = [];

      for (let j = i; j <= end; j++) {
        const page = await pdfjsDoc.getPage(j);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const thumb = {
          index: j - 1,
          thumbnail: canvas.toDataURL('image/png', 0.7),
          width: viewport.width,
          height: viewport.height
        };
        chunk.push(thumb);
        pages.push(thumb);
        if (onPage) onPage(j - 1, thumb);
      }

      // Update progress
      if (progressBar) {
        const pct = Math.round((end / total) * 100);
        progressBar.setProgress(pct, `${end}/${total} trang`);
      }

      // Yield to browser
      if (end < total) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    if (progressBar) {
      progressBar.done(`✓ ${total} trang`);
    }

    return pages;
  }

  /**
   * Render a single page at full resolution (for preview, sign, redact)
   */
  static async renderPageFull(pdfjsDoc, pageNum, scale = 1.5) {
    const page = await pdfjsDoc.getPage(pageNum + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { canvas, viewport };
  }

  /**
   * Reorder pages and return new PDF bytes
   */
  static async reorderAndSave(pdfDoc, newOrder) {
    const newDoc = await PDFLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(pdfDoc, newOrder);
    for (const page of copiedPages) newDoc.addPage(page);
    return await newDoc.save();
  }

  /**
   * Download a Uint8Array as a file
   */
  static download(bytes, fileName) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Download a data URL as a file (for images)
   */
  static downloadDataUrl(dataUrl, fileName) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Merge multiple PDFs into one
   */
  static async mergePDFs(docs) {
    const merged = await PDFLib.PDFDocument.create();
    for (const { pdfDoc } of docs) {
      const pageCount = pdfDoc.getPageCount();
      const indices = Array.from({ length: pageCount }, (_, i) => i);
      const copiedPages = await merged.copyPages(pdfDoc, indices);
      for (const page of copiedPages) merged.addPage(page);
    }
    return await merged.save();
  }

  /**
   * Extract a range of pages into a new PDF
   */
  static async extractPages(pdfDoc, pageIndices) {
    const newDoc = await PDFLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(pdfDoc, pageIndices);
    for (const page of copiedPages) newDoc.addPage(page);
    return await newDoc.save();
  }

  /**
   * Rotate specific pages by given angles (absolute)
   */
  static async rotatePages(pdfDoc, rotations) {
    const pages = pdfDoc.getPages();
    for (const [pageIndex, angle] of rotations.entries()) {
      if (pageIndex < pages.length) {
        pages[pageIndex].setRotation(PDFLib.degrees(angle));
      }
    }
    return await pdfDoc.save();
  }

  /**
   * Delete pages — keep only specified indices
   */
  static async deletePages(pdfDoc, keepIndices) {
    return await PDFEngine.extractPages(pdfDoc, keepIndices);
  }

  /**
   * Insert a PDF into another at a specific position
   * @param {PDFDocument} targetDoc - the target document
   * @param {PDFDocument} insertDoc - the document to insert
   * @param {number} position - 0-based index where to insert (0 = before first page)
   * @returns {Promise<Uint8Array>}
   */
  static async insertPDF(targetDoc, insertDoc, position) {
    const result = await PDFLib.PDFDocument.create();
    const totalPages = targetDoc.getPageCount();
    const insertPages = insertDoc.getPageCount();

    // Pages before insertion point
    if (position > 0) {
      const before = await result.copyPages(targetDoc, 
        Array.from({ length: position }, (_, i) => i));
      before.forEach(p => result.addPage(p));
    }

    // Inserted pages
    const inserted = await result.copyPages(insertDoc,
      Array.from({ length: insertPages }, (_, i) => i));
    inserted.forEach(p => result.addPage(p));

    // Pages after insertion point
    if (position < totalPages) {
      const after = await result.copyPages(targetDoc,
        Array.from({ length: totalPages - position }, (_, i) => position + i));
      after.forEach(p => result.addPage(p));
    }

    return await result.save();
  }

  /**
   * Stamp an image onto specific pages of a PDF
   * @param {PDFDocument} pdfDoc 
   * @param {Uint8Array} imageBytes - PNG/JPG bytes
   * @param {Array<{page:number, x:number, y:number, width:number, height:number, opacity?:number}>} placements
   * @returns {Promise<Uint8Array>}
   */
  static async stampImage(pdfDoc, imageBytes, placements) {
    const pages = pdfDoc.getPages();
    let image;
    const ext = imageBytes[0] === 0x89 ? 'png' : 'jpg';
    
    if (ext === 'png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      image = await pdfDoc.embedJpg(imageBytes);
    }

    const dims = image.scale(1);

    for (const p of placements) {
      if (p.page < pages.length) {
        const page = pages[p.page];
        const { width: pw, height: ph } = page.getSize();
        
        // Calculate actual dimensions
        const w = p.width || dims.width;
        const h = p.height || dims.height;
        const x = p.x ?? (pw - w) / 2;
        const y = p.y ?? (ph - h) / 2;
        const opacity = p.opacity ?? 0.85;

        page.drawImage(image, {
          x, y, width: w, height: h,
          opacity
        });
      }
    }

    return await pdfDoc.save();
  }
}
