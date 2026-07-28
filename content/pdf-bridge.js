/**
 * ScholarTranslate — PDF Bridge（MAIN world 注入脚本）
 * 用于访问页面的 PDFViewerApplication 对象并提取文本
 * 通过 window.postMessage 与 ISOLATED world 的 content script 通信
 */

(function () {
  'use strict';

  // 检查并等待 PDF.js viewer 加载
  async function init() {
    // 尝试多种方式获取 PDF 文本
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      // 方式 1：通过 PDFViewerApplication（pdf.js 标准 API）
      if (typeof PDFViewerApplication !== 'undefined' && PDFViewerApplication.pdfDocument) {
        console.log('[ScholarTranslate Bridge] Found PDFViewerApplication');
        await extractViaPDFViewer();
        return;
      }

      // 方式 2：通过 PDFView（旧版 pdf.js）
      if (typeof PDFView !== 'undefined' && PDFView.pdfDocument) {
        console.log('[ScholarTranslate Bridge] Found PDFView');
        await extractViaPDFView();
        return;
      }

      // 方式 3：通过嵌入的 PDF.js
      if (typeof window.pdfjsLib !== 'undefined') {
        console.log('[ScholarTranslate Bridge] Found pdfjsLib');
        // 这种情况下，内容脚本会自行处理 pdf.js 加载
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    console.log('[ScholarTranslate Bridge] PDF viewer not detected, using DOM fallback');
    extractViaDOM();
  }

  // 通过 PDFViewerApplication 提取
  async function extractViaPDFViewer() {
    try {
      const pdfDoc = PDFViewerApplication.pdfDocument;
      const totalPages = pdfDoc.numPages;

      for (let i = 1; i <= totalPages; i++) {
        try {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map(item => item.str)
            .filter(s => s.trim())
            .join(' ');

          if (pageText.trim()) {
            window.postMessage({
              type: 'ST_PDF_TEXT',
              source: 'scholar-translate-bridge',
              pageNum: i,
              totalPages: totalPages,
              text: pageText
            }, '*');
          }
        } catch (pageErr) {
          console.warn(`[ScholarTranslate Bridge] Page ${i} extraction failed:`, pageErr);
        }
      }

      window.postMessage({
        type: 'ST_PDF_COMPLETE',
        source: 'scholar-translate-bridge',
        totalPages: totalPages
      }, '*');

    } catch (err) {
      console.error('[ScholarTranslate Bridge] PDF extraction error:', err);
      window.postMessage({
        type: 'ST_PDF_ERROR',
        source: 'scholar-translate-bridge',
        error: err.message
      }, '*');
    }
  }

  // 通过 PDFView 提取
  async function extractViaPDFView() {
    try {
      const pdfDoc = PDFView.pdfDocument;
      const totalPages = pdfDoc.numPages;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).filter(s => s.trim()).join(' ');

        if (pageText.trim()) {
          window.postMessage({
            type: 'ST_PDF_TEXT',
            source: 'scholar-translate-bridge',
            pageNum: i,
            totalPages: totalPages,
            text: pageText
          }, '*');
        }
      }

      window.postMessage({
        type: 'ST_PDF_COMPLETE',
        source: 'scholar-translate-bridge',
        totalPages: totalPages
      }, '*');

    } catch (err) {
      console.error('[ScholarTranslate Bridge] PDFView extraction error:', err);
    }
  }

  // 通过 DOM textLayer 提取（备用方案）
  function extractViaDOM() {
    const textLayers = document.querySelectorAll('.textLayer');
    if (textLayers.length === 0) return;

    for (let i = 0; i < textLayers.length; i++) {
      const text = textLayers[i].textContent.trim().replace(/\s+/g, ' ');
      if (text.length > 20) {
        window.postMessage({
          type: 'ST_PDF_TEXT',
          source: 'scholar-translate-bridge',
          pageNum: i + 1,
          totalPages: textLayers.length,
          text: text
        }, '*');
      }
    }

    window.postMessage({
      type: 'ST_PDF_COMPLETE',
      source: 'scholar-translate-bridge',
      totalPages: textLayers.length
    }, '*');
  }

  // ============================================================
  // 启动
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
