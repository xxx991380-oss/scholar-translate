/**
 * ScholarTranslate — PDF 内容脚本
 * 自己解析 PDF 提取文字，渲染到可选中翻译的面板中
 */

(function () {
  'use strict';

  console.log('[ScholarTranslate] PDF content script START — URL:', window.location.href);

  let sidePanel = null;
  let toggleBtn = null;
  let isTranslating = false;
  let pdfTextPages = [];  // 每页的原文 [{pageNum, text}]

  // ============================================================
  // 初始化
  // ============================================================
  async function init() {
    if (!isPDFPage()) {
      console.log('[ScholarTranslate] Not a PDF page, skipping');
      return;
    }

    console.log('[ScholarTranslate] PDF page detected');

    // 检查 pdf.js 是否可用
    if (typeof pdfjsLib === 'undefined') {
      console.warn('[ScholarTranslate] pdfjsLib not available, PDF text extraction disabled');
      return;
    }

    // 设置 worker 路径
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    console.log('[ScholarTranslate] pdf.js ready');

    // 创建 UI
    sidePanel = createSidePanel();
    sidePanel.classList.add('hidden');
    toggleBtn = createToggleBtn();

    // 显示侧栏并开始提取文字
    sidePanel.classList.remove('hidden');
    if (toggleBtn) toggleBtn.style.opacity = '0';

    // 提取 PDF 文字
    await extractPdfText();
  }

  function isPDFPage() {
    const fullUrl = window.location.href;
    const url = fullUrl.split('#')[0];
    if (url.startsWith('file://')) return true;
    if (url.endsWith('.pdf')) return true;
    if (url.includes('scholar.googleusercontent.com')) return true;
    if (url.includes('pdf.js') || url.includes('pdf_viewer')) return true;
    if (document.querySelector('.pdfViewer, .textLayer, #viewer.pdfViewer, #viewerContainer')) return true;
    return false;
  }

  // ============================================================
  // 提取 PDF 文字
  // ============================================================
  async function extractPdfText() {
    const url = window.location.href.split('#')[0]; // 去掉 fragment

    updatePanelStatus('正在加载 PDF...');

    try {
      // 通过 Service Worker 代理获取 PDF（绕过 file:// CORS 限制）
      const swResponse = await chrome.runtime.sendMessage({
        type: 'FETCH_PDF',
        payload: { url }
      });

      if (!swResponse.success) {
        throw new Error(swResponse.error || 'Failed to fetch PDF');
      }

      // 解码 base64
      const binaryStr = atob(swResponse.data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      updatePanelStatus('正在解析 PDF...');

      // 用 pdf.js 解析
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdfDoc.numPages;

      console.log(`[ScholarTranslate] PDF loaded: ${totalPages} pages`);

      pdfTextPages = [];

      for (let i = 1; i <= totalPages; i++) {
        updatePanelStatus(`正在提取第 ${i} / ${totalPages} 页...`);

        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map(item => item.str)
          .filter(s => s && s.trim())
          .join(' ');

        if (pageText.trim()) {
          pdfTextPages.push({ pageNum: i, text: pageText });
        }
      }

      console.log(`[ScholarTranslate] Extracted text from ${pdfTextPages.length} pages`);
      renderPdfText();
    } catch (err) {
      console.error('[ScholarTranslate] PDF extraction failed:', err);
      updatePanelStatus('PDF 解析失败: ' + err.message + '\n\n请确保 PDF 文件可访问。');
    }
  }

  // ============================================================
  // 渲染 PDF 文字到面板
  // ============================================================
  function renderPdfText() {
    const shadow = sidePanel.shadowRoot;
    const content = shadow.getElementById('st-panel-content');

    if (pdfTextPages.length === 0) {
      content.innerHTML = '<div class="st-hint">未提取到文字内容，可能为扫描版 PDF。</div>';
      return;
    }

    let html = '';
    for (const page of pdfTextPages) {
      html += `<div class="st-page-section">`;
      html += `<div class="st-page-label">📄 第 ${page.pageNum} 页</div>`;
      html += `<div class="st-pdf-text" data-st-page="${page.pageNum}">${escapeHtml(page.text)}</div>`;
      html += `</div>`;
    }

    content.innerHTML = html;
  }

  function updatePanelStatus(message) {
    if (!sidePanel || !sidePanel.shadowRoot) return;
    const content = sidePanel.shadowRoot.getElementById('st-panel-content');
    if (content) {
      content.innerHTML = `<div class="st-hint" style="text-align:center;padding:24px;">${escapeHtml(message)}</div>`;
    }
  }

  // ============================================================
  // 侧栏 UI
  // ============================================================
  function createSidePanel() {
    if (document.getElementById('st-pdf-panel')) {
      return document.getElementById('st-pdf-panel');
    }

    const panel = document.createElement('div');
    panel.id = 'st-pdf-panel';

    const shadow = panel.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          right: 0;
          top: 0;
          width: 400px;
          height: 100vh;
          background: #fff;
          box-shadow: -2px 0 16px rgba(0,0,0,0.12);
          z-index: 99998;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          transition: transform 0.25s ease;
        }
        :host(.hidden) {
          transform: translateX(100%);
        }
        .st-panel-header {
          padding: 12px 16px;
          background: #4285f4;
          color: white;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .st-panel-header button {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .st-panel-header button:hover {
          background: rgba(255,255,255,0.35);
        }
        .st-panel-toolbar {
          padding: 10px 16px;
          background: #f8f9fa;
          border-bottom: 1px solid #eee;
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        .st-panel-toolbar button {
          flex: 1;
          padding: 8px 6px;
          border: 1px solid #ddd;
          background: #fff;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          color: #333;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .st-panel-toolbar button:hover {
          background: #f0f0f0;
        }
        .st-panel-toolbar button.primary {
          background: #4285f4;
          color: white;
          border-color: #4285f4;
          font-weight: 500;
        }
        .st-panel-toolbar button:disabled {
          opacity: 0.5;
          pointer-events: none;
        }
        .st-panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          font-size: 13px;
          line-height: 1.75;
          color: #333;
          user-select: text;
          -webkit-user-select: text;
        }
        .st-panel-content .st-page-section {
          margin-bottom: 24px;
          border-bottom: 1px solid #eee;
          padding-bottom: 20px;
        }
        .st-panel-content .st-page-label {
          font-size: 11px;
          color: #4285f4;
          font-weight: 600;
          margin-bottom: 10px;
          position: sticky;
          top: 0;
          background: #fff;
          padding: 4px 0;
          z-index: 1;
        }
        .st-panel-content .st-pdf-text {
          white-space: pre-wrap;
          word-break: break-word;
          cursor: text;
        }
        .st-panel-content .st-hint {
          color: #999;
          font-size: 13px;
          text-align: center;
          padding: 60px 20px;
          line-height: 1.8;
        }
        .st-panel-content .st-trans-result {
          margin-top: 10px;
          padding: 8px 12px;
          background: #f0f4ff;
          border-left: 3px solid #4285f4;
          border-radius: 0 6px 6px 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 13px;
          color: #1a56db;
        }
        @media (prefers-color-scheme: dark) {
          :host { background: #1e1e1e; }
          .st-panel-toolbar { background: #2a2a2a; border-bottom-color: #333; }
          .st-panel-toolbar button { background: #333; color: #ddd; border-color: #444; }
          .st-panel-content { color: #ccc; }
          .st-panel-content .st-page-label { background: #1e1e1e; }
          .st-page-section { border-bottom-color: #333; }
          .st-panel-content .st-trans-result { background: #1a2332; }
        }
      </style>
      <div class="st-panel-header">
        <span>📖 论文文字</span>
        <button id="st-panel-close" title="关闭面板">×</button>
      </div>
      <div class="st-panel-toolbar">
        <button class="primary" id="st-btn-current-page">📄 翻译当前页</button>
        <button id="st-btn-all-pages">📚 翻译全文</button>
        <button id="st-btn-clear">🗑️ 清除</button>
      </div>
      <div class="st-panel-content" id="st-panel-content">
        <div class="st-hint">正在加载 PDF...</div>
      </div>
    `;

    document.body.appendChild(panel);

    // 事件
    shadow.getElementById('st-panel-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      if (toggleBtn) toggleBtn.style.opacity = '1';
    });
    shadow.getElementById('st-btn-current-page').addEventListener('click', translateCurrentPage);
    shadow.getElementById('st-btn-all-pages').addEventListener('click', translateAllPages);
    shadow.getElementById('st-btn-clear').addEventListener('click', () => {
      renderPdfText();
    });

    return panel;
  }

  function createToggleBtn() {
    const btn = document.createElement('button');
    btn.id = 'st-pdf-toggle-btn';
    btn.textContent = '文字';
    Object.assign(btn.style, {
      position: 'fixed', right: '4px', top: '50%',
      transform: 'translateY(-50%)',
      width: '26px', height: '60px',
      background: '#4285f4', color: 'white',
      border: 'none', borderRadius: '8px 0 0 8px',
      cursor: 'pointer', fontSize: '12px',
      writingMode: 'vertical-lr',
      zIndex: '99999', opacity: '0',
      transition: 'opacity 0.2s',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.1)'
    });
    btn.addEventListener('click', () => {
      if (sidePanel) {
        sidePanel.classList.remove('hidden');
        btn.style.opacity = '0';
      }
    });
    document.body.appendChild(btn);
    document.addEventListener('mousemove', (e) => {
      if (sidePanel && sidePanel.classList.contains('hidden')) {
        btn.style.opacity = e.clientX > window.innerWidth - 40 ? '1' : '0';
      }
    });
    return btn;
  }

  // ============================================================
  // 翻译当前页
  // ============================================================
  async function translateCurrentPage() {
    if (isTranslating || pdfTextPages.length === 0) return;
    const shadow = sidePanel.shadowRoot;
    const content = shadow.getElementById('st-panel-content');
    const btn = shadow.getElementById('st-btn-current-page');

    // 找到当前可见的页面
    const scrollTop = content.scrollTop;
    const visiblePage = pdfTextPages.find((p, i) => {
      const el = content.querySelector(`[data-st-page="${p.pageNum}"]`);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    });

    if (!visiblePage && pdfTextPages.length > 0) {
      // 默认第一页
      await translatePageText(pdfTextPages[0], shadow, btn);
      return;
    }
    if (!visiblePage) return;

    await translatePageText(visiblePage, shadow, btn);
  }

  async function translatePageText(page, shadow, btn) {
    isTranslating = true;
    btn.disabled = true;
    btn.textContent = '⏳...';

    try {
      const settings = await loadSettings();
      const chunks = splitIntoChunks(page.text, 800);
      const translations = [];

      for (const chunk of chunks) {
        if (chunk.trim().length < 10) continue;
        const response = await chrome.runtime.sendMessage({
          type: 'TRANSLATE',
          payload: {
            texts: [chunk],
            from: settings.sourceLang || 'en',
            to: settings.targetLang || 'zh-CN',
            engine: settings.preferredEngine
          }
        });
        if (response && response.success && response.results[0] && response.results[0] !== chunk) {
          translations.push(response.results[0]);
        }
      }

      // 在页文本下方插入翻译
      const textEl = shadow.querySelector(`[data-st-page="${page.pageNum}"]`);
      if (textEl && translations.length > 0) {
        const existing = textEl.nextElementSibling;
        if (existing && existing.classList.contains('st-trans-result')) {
          existing.remove();
        }
        const transDiv = document.createElement('div');
        transDiv.className = 'st-trans-result';
        transDiv.textContent = translations.join('\n\n');
        textEl.parentElement.insertBefore(transDiv, textEl.nextSibling);
      }
    } catch (err) {
      console.error('[ScholarTranslate] Page translation error:', err);
    } finally {
      isTranslating = false;
      btn.disabled = false;
      btn.textContent = '📄 翻译当前页';
    }
  }

  // ============================================================
  // 翻译全文
  // ============================================================
  async function translateAllPages() {
    if (isTranslating || pdfTextPages.length === 0) return;
    if (!confirm(`翻译全部 ${pdfTextPages.length} 页？\n\n💡 也可以直接选中面板中的文字划词翻译。`)) return;

    const shadow = sidePanel.shadowRoot;
    const btn = shadow.getElementById('st-btn-all-pages');
    const content = shadow.getElementById('st-panel-content');

    isTranslating = true;
    btn.disabled = true;

    const settings = await loadSettings();

    for (let i = 0; i < pdfTextPages.length; i++) {
      const page = pdfTextPages[i];
      btn.textContent = `⏳ ${page.pageNum}/${pdfTextPages.length}`;

      const chunks = splitIntoChunks(page.text, 800);
      const translations = [];

      for (const chunk of chunks) {
        if (chunk.trim().length < 10) continue;
        const response = await chrome.runtime.sendMessage({
          type: 'TRANSLATE',
          payload: {
            texts: [chunk],
            from: settings.sourceLang || 'en',
            to: settings.targetLang || 'zh-CN',
            engine: settings.preferredEngine
          }
        });
        if (response && response.success && response.results[0] && response.results[0] !== chunk) {
          translations.push(response.results[0]);
        }
      }

      const textEl = shadow.querySelector(`[data-st-page="${page.pageNum}"]`);
      if (textEl && translations.length > 0) {
        const existing = textEl.nextElementSibling;
        if (existing && existing.classList.contains('st-trans-result')) {
          existing.remove();
        }
        const transDiv = document.createElement('div');
        transDiv.className = 'st-trans-result';
        transDiv.textContent = translations.join('\n\n');
        textEl.parentElement.insertBefore(transDiv, textEl.nextSibling);
      }
    }

    isTranslating = false;
    btn.disabled = false;
    btn.textContent = '📚 翻译全文';
  }

  // ============================================================
  // 工具函数
  // ============================================================
  function splitIntoChunks(text, maxLen) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let current = '';
    for (const s of sentences) {
      if (current.length + s.length > maxLen && current.length > 0) {
        chunks.push(current.trim());
        current = '';
      }
      current += s;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length > 0 ? chunks : [text];
  }

  async function loadSettings() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      return res.settings || {};
    } catch (e) { return {}; }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
