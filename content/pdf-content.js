/**
 * ScholarTranslate — PDF 内容脚本
 * 提供手动触发的 PDF 翻译侧栏（当前页翻译 + 全文翻译按钮）
 * 划词翻译由 selection-translate.js 独立处理
 */

(function () {
  'use strict';

  let sidePanel = null;
  let toggleBtn = null;
  let isTranslating = false;

  // ============================================================
  // 初始化 — 仅创建 UI，不自动翻译
  // ============================================================
  async function init() {
    if (!isPDFPage()) return;

    console.log('[ScholarTranslate] PDF page detected, setting up manual translation panel');

    await waitForPDFContent();

    // 创建侧栏（默认隐藏）
    sidePanel = createSidePanel();
    sidePanel.classList.add('hidden');

    // 创建切换按钮
    toggleBtn = createToggleBtn();
  }

  function isPDFPage() {
    const url = window.location.href;
    if (url.endsWith('.pdf')) return true;
    if (url.includes('scholar.googleusercontent.com')) return true;
    if (url.includes('pdf.js') || url.includes('pdf_viewer')) return true;
    if (document.querySelector('.pdfViewer, .textLayer, #viewer.pdfViewer')) return true;
    return false;
  }

  async function waitForPDFContent(maxWait = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      const textLayer = document.querySelector('.textLayer');
      const textLayerSpans = document.querySelectorAll('.textLayer span');
      const pdfViewer = document.querySelector('.pdfViewer, #viewerContainer');
      if ((textLayer && textLayerSpans.length > 0) || pdfViewer) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
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
          width: 360px;
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
          transition: background 0.2s;
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
          padding: 8px 10px;
          border: 1px solid #ddd;
          background: #fff;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          color: #333;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .st-panel-toolbar button:hover {
          background: #f0f0f0;
          border-color: #bbb;
        }
        .st-panel-toolbar button.primary {
          background: #4285f4;
          color: white;
          border-color: #4285f4;
          font-weight: 500;
        }
        .st-panel-toolbar button.primary:hover {
          background: #3367d6;
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
          line-height: 1.7;
          color: #333;
        }
        .st-panel-content .st-page-section {
          margin-bottom: 20px;
          border-bottom: 1px solid #eee;
          padding-bottom: 16px;
        }
        .st-panel-content .st-page-label {
          font-size: 11px;
          color: #4285f4;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .st-panel-content .st-translated-paragraph {
          margin-bottom: 8px;
          padding: 6px 10px;
          background: #f8f9fa;
          border-radius: 6px;
          border-left: 3px solid #4285f4;
        }
        .st-panel-content .st-hint {
          color: #999;
          font-size: 12px;
          text-align: center;
          padding: 40px 20px;
          line-height: 1.8;
        }
        @media (prefers-color-scheme: dark) {
          :host { background: #1e1e1e; }
          .st-panel-toolbar { background: #2a2a2a; border-bottom-color: #333; }
          .st-panel-toolbar button { background: #333; color: #ddd; border-color: #444; }
          .st-panel-content { color: #ccc; }
          .st-panel-content .st-translated-paragraph { background: #2a2a2a; }
          .st-page-section { border-bottom-color: #333; }
        }
      </style>
      <div class="st-panel-header">
        <span>📖 论文翻译</span>
        <button id="st-panel-close" title="关闭面板">×</button>
      </div>
      <div class="st-panel-toolbar">
        <button class="primary" id="st-btn-current-page">📄 翻译当前页</button>
        <button id="st-btn-all-pages">📚 翻译全文</button>
        <button id="st-btn-clear">🗑️ 清除</button>
      </div>
      <div class="st-panel-content" id="st-panel-content">
        <div class="st-hint">
          💡 <b>划词翻译</b>：选中 PDF 中的文字即可翻译<br><br>
          📄 <b>翻译当前页</b>：翻译正在查看的这一页<br><br>
          📚 <b>翻译全文</b>：翻译整篇论文（需要一些时间）
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // 事件绑定
    shadow.getElementById('st-panel-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      if (toggleBtn) toggleBtn.style.opacity = '1';
    });

    shadow.getElementById('st-btn-current-page').addEventListener('click', () => {
      translateCurrentPage();
    });

    shadow.getElementById('st-btn-all-pages').addEventListener('click', () => {
      translateAllPages();
    });

    shadow.getElementById('st-btn-clear').addEventListener('click', () => {
      shadow.getElementById('st-panel-content').innerHTML = `
        <div class="st-hint">
          💡 <b>划词翻译</b>：选中 PDF 中的文字即可翻译<br><br>
          📄 <b>翻译当前页</b>：翻译正在查看的这一页<br><br>
          📚 <b>翻译全文</b>：翻译整篇论文（需要一些时间）
        </div>
      `;
    });

    return panel;
  }

  function createToggleBtn() {
    const btn = document.createElement('button');
    btn.id = 'st-pdf-toggle-btn';
    btn.textContent = '翻译';
    Object.assign(btn.style, {
      position: 'fixed',
      right: '4px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '26px',
      height: '60px',
      background: '#4285f4',
      color: 'white',
      border: 'none',
      borderRadius: '8px 0 0 8px',
      cursor: 'pointer',
      fontSize: '12px',
      writingMode: 'vertical-lr',
      zIndex: '99999',
      opacity: '0',
      transition: 'opacity 0.2s',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
      padding: '4px 0'
    });

    btn.addEventListener('click', () => {
      if (sidePanel) {
        sidePanel.classList.remove('hidden');
        btn.style.opacity = '0';
      }
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '1';
    });

    document.body.appendChild(btn);

    // 鼠标靠近右侧时显示按钮
    document.addEventListener('mousemove', (e) => {
      if (sidePanel && sidePanel.classList.contains('hidden')) {
        btn.style.opacity = e.clientX > window.innerWidth - 40 ? '1' : '0';
      }
    });

    return btn;
  }

  // ============================================================
  // 翻译逻辑（手动触发）
  // ============================================================
  function getVisiblePages() {
    const allPages = document.querySelectorAll('.page[data-page-number]');
    const visible = [];
    for (const page of allPages) {
      const rect = page.getBoundingClientRect();
      if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
        visible.push(page);
      }
    }
    // 如果没找到分页，尝试整个 textLayer
    if (visible.length === 0) {
      const textLayer = document.querySelector('.textLayer');
      if (textLayer) visible.push(textLayer);
    }
    return visible;
  }

  function getAllPages() {
    const pages = document.querySelectorAll('.page[data-page-number]');
    if (pages.length > 0) return Array.from(pages);
    const textLayer = document.querySelector('.textLayer');
    return textLayer ? [textLayer] : [];
  }

  function extractPageText(pageElement) {
    const textSpans = pageElement.querySelectorAll('.textLayer span');
    if (textSpans.length > 0) {
      return Array.from(textSpans)
        .map(span => span.textContent.trim())
        .filter(t => t.length > 0)
        .join(' ');
    }
    return pageElement.textContent.trim().replace(/\s+/g, ' ');
  }

  function splitIntoChunks(text, maxLen) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let current = '';
    for (const sentence of sentences) {
      if (current.length + sentence.length > maxLen && current.length > 0) {
        chunks.push(current.trim());
        current = '';
      }
      current += sentence;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length > 0 ? chunks : [text];
  }

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      return response.settings || {};
    } catch (e) {
      return {};
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================
  // 翻译当前页
  // ============================================================
  async function translateCurrentPage() {
    if (isTranslating) return;
    const shadow = sidePanel.shadowRoot;
    const content = shadow.getElementById('st-panel-content');
    const btn = shadow.getElementById('st-btn-current-page');

    isTranslating = true;
    btn.disabled = true;
    btn.textContent = '⏳ 翻译中...';
    content.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">正在翻译当前页...</div>';

    try {
      const pages = getVisiblePages();
      const settings = await loadSettings();
      let html = '';

      for (const page of pages) {
        const pageNum = page.getAttribute('data-page-number') || '?';
        const text = extractPageText(page);
        if (text.length < 20) continue;

        const chunks = splitIntoChunks(text, 800);
        const pageTranslations = [];

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
          if (response.success && response.results[0] && response.results[0] !== chunk) {
            pageTranslations.push(response.results[0]);
          }
        }

        if (pageTranslations.length > 0) {
          html += `<div class="st-page-section">`;
          html += `<div class="st-page-label">📄 第 ${pageNum} 页</div>`;
          for (const t of pageTranslations) {
            html += `<div class="st-translated-paragraph">${escapeHtml(t)}</div>`;
          }
          html += `</div>`;
        }
      }

      content.innerHTML = html || '<div style="color:#999;text-align:center;padding:20px;">当前页无可翻译文本</div>';

    } catch (err) {
      console.error('[ScholarTranslate] Page translation error:', err);
      content.innerHTML = '<div style="color:#d93025;text-align:center;padding:20px;">翻译失败，请重试</div>';
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
    if (isTranslating) return;
    if (!confirm('翻译全文需要一些时间，确定继续吗？\n\n💡 提示：你也可以选中文字直接划词翻译，更快更方便。')) return;

    const shadow = sidePanel.shadowRoot;
    const content = shadow.getElementById('st-panel-content');
    const btn = shadow.getElementById('st-btn-all-pages');

    isTranslating = true;
    btn.disabled = true;
    const allPages = getAllPages();

    const settings = await loadSettings();
    let html = '';
    let pageCount = 0;

    for (let i = 0; i < allPages.length; i++) {
      const page = allPages[i];
      const pageNum = page.getAttribute('data-page-number') || (i + 1);
      const text = extractPageText(page);
      if (text.length < 20) continue;

      content.innerHTML = `<div style="color:#999;text-align:center;padding:20px;">正在翻译第 ${pageNum} / ${allPages.length} 页...</div>`;

      const chunks = splitIntoChunks(text, 800);
      const pageTranslations = [];

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
        if (response.success && response.results[0] && response.results[0] !== chunk) {
          pageTranslations.push(response.results[0]);
        }
      }

      if (pageTranslations.length > 0) {
        html += `<div class="st-page-section">`;
        html += `<div class="st-page-label">📄 第 ${pageNum} 页</div>`;
        for (const t of pageTranslations) {
          html += `<div class="st-translated-paragraph">${escapeHtml(t)}</div>`;
        }
        html += `</div>`;
        pageCount++;
      }
    }

    content.innerHTML = html || '<div style="color:#999;text-align:center;padding:20px;">未提取到可翻译文本</div>';

    isTranslating = false;
    btn.disabled = false;
  }

  // ============================================================
  // 启动
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[ScholarTranslate] PDF content script loaded (manual translation mode)');
})();
