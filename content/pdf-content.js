/**
 * ScholarTranslate — PDF 内容脚本
 * 负责：PDF 页面的文本提取、全文翻译、译文侧边栏
 */

(function () {
  'use strict';

  let sidePanel = null;
  let isTranslating = false;
  let translatedPages = new Set();

  // ============================================================
  // 初始化
  // ============================================================
  async function init() {
    // 只在 PDF 页面激活
    const isPDF = isPDFPage();
    if (!isPDF) return;

    console.log('[ScholarTranslate] PDF content script initialized');

    // 等待 PDF 渲染完成
    await waitForPDFContent();

    // 创建翻译侧栏
    sidePanel = createSidePanel();

    // 自动翻译可见页面
    await translateVisiblePages();
  }

  function isPDFPage() {
    const url = window.location.href;
    // 直接 PDF URL
    if (url.endsWith('.pdf')) return true;
    // Google Scholar PDF 查看器
    if (url.includes('scholar.googleusercontent.com')) return true;
    // 通用 PDF 查看器
    if (url.includes('pdf.js') || url.includes('pdf_viewer')) return true;
    // 检查页面中是否有 PDF 查看器
    if (document.querySelector('.pdfViewer, .textLayer, #viewer.pdfViewer')) return true;
    return false;
  }

  async function waitForPDFContent(maxWait = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      // 检查多种 PDF 渲染方式
      const textLayer = document.querySelector('.textLayer');
      const textLayerSpans = document.querySelectorAll('.textLayer span');
      const pdfViewer = document.querySelector('.pdfViewer, #viewerContainer');

      if ((textLayer && textLayerSpans.length > 0) || pdfViewer) {
        console.log('[ScholarTranslate] PDF content detected');
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log('[ScholarTranslate] PDF content not detected within timeout');
    return false;
  }

  // ============================================================
  // PDF 文本提取
  // ============================================================
  function extractPageText(pageElement) {
    // pdf.js textLayer 中的文本
    const textSpans = pageElement.querySelectorAll('.textLayer span');
    if (textSpans.length > 0) {
      return Array.from(textSpans)
        .map(span => span.textContent.trim())
        .filter(t => t.length > 0)
        .join(' ');
    }

    // 备用：提取页面所有可见文本
    const text = pageElement.textContent.trim();
    return text.replace(/\s+/g, ' ');
  }

  function getVisiblePages() {
    // pdf.js 使用 .page 类
    const allPages = document.querySelectorAll('.page[data-page-number]');
    const visible = [];

    for (const page of allPages) {
      const rect = page.getBoundingClientRect();
      // 页面在视口内或附近
      if (rect.top < window.innerHeight + 500 && rect.bottom > -500) {
        visible.push(page);
      }
    }

    // 如果没有找到 .page 元素，尝试整个 textLayer
    if (visible.length === 0) {
      const textLayer = document.querySelector('.textLayer');
      if (textLayer) {
        visible.push(textLayer);
      }
    }

    return visible;
  }

  function getAllPages() {
    return document.querySelectorAll('.page[data-page-number]');
  }

  // ============================================================
  // 翻译侧栏
  // ============================================================
  function createSidePanel() {
    // 检查是否已创建
    if (document.getElementById('st-pdf-panel')) {
      return document.getElementById('st-pdf-panel');
    }

    const panel = document.createElement('div');
    panel.id = 'st-pdf-panel';

    // 使用 Shadow DOM 隔离样式
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
          transform: translateX(0);
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
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .st-panel-content .st-translated-paragraph {
          margin-bottom: 8px;
          padding: 6px 10px;
          background: #f8f9fa;
          border-radius: 6px;
          border-left: 3px solid #4285f4;
        }
        .st-panel-content .st-loading {
          color: #999;
          font-style: italic;
          text-align: center;
          padding: 20px;
        }
        .st-toggle-btn {
          position: fixed;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 28px;
          height: 64px;
          background: #4285f4;
          color: white;
          border: none;
          border-radius: 8px 0 0 8px;
          cursor: pointer;
          font-size: 12px;
          writing-mode: vertical-lr;
          z-index: 99999;
          opacity: 0;
          transition: opacity 0.2s;
          box-shadow: -2px 0 8px rgba(0,0,0,0.1);
        }
        .st-toggle-btn:hover {
          opacity: 1 !important;
          width: 32px;
        }
      </style>
      <div class="st-panel-header">
        <span>📖 论文翻译</span>
        <button id="st-panel-close" title="关闭翻译面板">×</button>
      </div>
      <div class="st-panel-content" id="st-panel-content">
        <div class="st-loading">正在提取文本并翻译...</div>
      </div>
    `;

    document.body.appendChild(panel);

    // 切换按钮（面板关闭时显示）
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'st-toggle-btn';
    toggleBtn.textContent = '翻译';
    toggleBtn.onclick = () => {
      panel.classList.remove('hidden');
      toggleBtn.style.opacity = '0';
    };
    document.body.appendChild(toggleBtn);

    // 关闭按钮
    shadow.getElementById('st-panel-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      toggleBtn.style.opacity = '1';
    });

    // 鼠标靠近右侧边缘时显示切换按钮
    document.addEventListener('mousemove', (e) => {
      if (panel.classList.contains('hidden')) {
        if (e.clientX > window.innerWidth - 40) {
          toggleBtn.style.opacity = '1';
        } else {
          toggleBtn.style.opacity = '0';
        }
      }
    });

    return panel;
  }

  // ============================================================
  // 翻译逻辑
  // ============================================================
  async function translateVisiblePages() {
    if (isTranslating) return;
    isTranslating = true;

    try {
      const pages = getVisiblePages();
      const settings = await loadSettings();

      for (const page of pages) {
        const pageNum = page.getAttribute('data-page-number') || '?';
        if (translatedPages.has(pageNum)) continue;

        const text = extractPageText(page);
        if (text.length < 20) {
          translatedPages.add(pageNum);
          continue;
        }

        // 分段翻译（每段最多 800 字符）
        const chunks = splitIntoChunks(text, 800);

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
            appendTranslation(pageNum, response.results[0]);
          }
        }

        translatedPages.add(pageNum);
      }

      updatePanelContent();

    } catch (err) {
      console.error('[ScholarTranslate] PDF translation error:', err);
    } finally {
      isTranslating = false;
    }
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

  // ============================================================
  // 翻译结果展示
  // ============================================================
  const translations = []; // {pageNum, text}

  function appendTranslation(pageNum, translatedText) {
    translations.push({ pageNum, text: translatedText });
  }

  function updatePanelContent() {
    const shadow = sidePanel.shadowRoot;
    if (!shadow) return;

    const content = shadow.getElementById('st-panel-content');
    if (!content) return;

    if (translations.length === 0) {
      content.innerHTML = '<div class="st-loading">正在翻译中...</div>';
      return;
    }

    // 按页码分组
    const grouped = {};
    for (const t of translations) {
      if (!grouped[t.pageNum]) grouped[t.pageNum] = [];
      grouped[t.pageNum].push(t.text);
    }

    let html = '';
    for (const [pageNum, texts] of Object.entries(grouped)) {
      html += `<div class="st-page-section">`;
      html += `<div class="st-page-label">📄 第 ${pageNum} 页</div>`;
      for (const text of texts) {
        html += `<div class="st-translated-paragraph">${escapeHtml(text)}</div>`;
      }
      html += `</div>`;
    }

    if (isTranslating) {
      html += '<div class="st-loading">翻译中...</div>';
    }

    content.innerHTML = html;
  }

  // ============================================================
  // 设置
  // ============================================================
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
  // 滚动事件 — 翻译新出现的页面
  // ============================================================
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      translateVisiblePages();
    }, 800);
  }, { passive: true });

  // ============================================================
  // 启动
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[ScholarTranslate] PDF content script loaded');
})();
