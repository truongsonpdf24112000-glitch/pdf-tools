// js/utils/pdf-engine.js — Wrapper for pdf-lib + PDF.js
import { showToast } from './ui-helpers.js';

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
   * Render thumbnails for all pages
   * @param {PDFDocumentProxy} pdfjsDoc
   * @param {number} scale - render scale (default 0.3)
   * @returns {Promise<Array<{index, thumbnail, width, height}>>}
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

      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;

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
   * Reorder pages and return new PDF bytes
   * Creates a fresh PDFDocument, copies pages in desired order
   * @param {PDFDocument} pdfDoc - original pdf-lib doc
   * @param {number[]} newOrder - array of page indices in new order
   * @returns {Promise<Uint8Array>}
   */
  static async reorderAndSave(pdfDoc, newOrder) {
    const newDoc = await PDFLib.PDFDocument.create();

    // Copy pages from original doc in new order
    const copiedPages = await newDoc.copyPages(pdfDoc, newOrder);

    for (const page of copiedPages) {
      newDoc.addPage(page);
    }

    const pdfBytes = await newDoc.save();
    return pdfBytes;
  }

  /**
   * Download a Uint8Array as a file
   * @param {Uint8Array} bytes
   * @param {string} fileName
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
   * @param {string} dataUrl - data:image/...;base64,...
   * @param {string} fileName
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
   * @param {Array<{pdfDoc: PDFDocument, fileName: string}>} docs - ordered list
   * @returns {Promise<Uint8Array>}
   */
  static async mergePDFs(docs) {
    const merged = await PDFLib.PDFDocument.create();

    for (const { pdfDoc } of docs) {
      const pageCount = pdfDoc.getPageCount();
      const indices = Array.from({ length: pageCount }, (_, i) => i);
      const copiedPages = await merged.copyPages(pdfDoc, indices);
      for (const page of copiedPages) {
        merged.addPage(page);
      }
    }

    return await merged.save();
  }

  /**
   * Extract a range of pages into a new PDF
   * @param {PDFDocument} pdfDoc
   * @param {number[]} pageIndices - 0-based indices to keep
   * @returns {Promise<Uint8Array>}
   */
  static async extractPages(pdfDoc, pageIndices) {
    const newDoc = await PDFLib.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(pdfDoc, pageIndices);
    for (const page of copiedPages) {
      newDoc.addPage(page);
    }
    return await newDoc.save();
  }

  /**
   * Rotate specific pages by given angles
   * @param {PDFDocument} pdfDoc
   * @param {Map<number, number>} rotations - pageIndex -> angle (90, 180, 270)
   * @returns {Promise<Uint8Array>}
   */
  static async rotatePages(pdfDoc, rotations) {
    const pages = pdfDoc.getPages();
    
    for (const [pageIndex, angle] of rotations.entries()) {
      if (pageIndex < pages.length) {
        const page = pages[pageIndex];
        // Set rotation tuyệt đối theo góc người dùng chọn, không cộng dồn với rotation gốc
        page.setRotation(PDFLib.degrees(angle));
      }
    }

    return await pdfDoc.save();
  }

  /**
   * Return a fresh copy of pdfDoc as bytes (for delete: copy only kept pages)
   * @param {PDFDocument} pdfDoc
   * @param {number[]} keepIndices - 0-based indices to keep
   * @returns {Promise<Uint8Array>}
   */
  static async deletePages(pdfDoc, keepIndices) {
    return await PDFEngine.extractPages(pdfDoc, keepIndices);
  }
}
