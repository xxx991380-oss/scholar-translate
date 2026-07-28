/**
 * ScholarTranslate — 划词翻译脚本
 * 选中文字后弹出翻译按钮，点击即可翻译选中内容
 */

(function () {
  'use strict';

  console.log('[ScholarTranslate] Selection translate START — URL:', window.location.href);

  let floatBtn = null;
  let popup = null;
  let isTranslating = false;
  let hideTimer = null;
  let lastSelectionRect = null;  // 保存选区位置，用于弹窗定位
  let savedText = '';           // 保存选中文本

  // ============================================================
  // 初始化
  // ============================================================
  function init() {
    // 使用 selectionchange 作为主要检测方式（PDF 查看器可能拦截 mouseup）
    document.addEventListener('selectionchange', onSelectionChange);
    // mouseup 作为辅助（快速触发）
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);

    // 调试：检查页面中是否有 iframe
    const iframes = document.querySelectorAll('iframe');
    console.log('[ScholarTranslate] Selection translate ready. Iframes found:', iframes.length);
    if (iframes.length > 0) {
      for (const f of iframes) {
        console.log('[ScholarTranslate] Iframe src:', f.src);
      }
    }
  }

  // ============================================================
  // 选区变化 — 主要检测方式
  // ============================================================
  let selectionDebounce = null;
  let eventCount = 0;

  function onSelectionChange() {
    eventCount++;
    // 每 10 次打印一次，避免日志刷屏
    if (eventCount % 10 === 1) {
      const sel = window.getSelection();
      console.log('[ScholarTranslate] selectionchange #' + eventCount +
        ' collapsed=' + (sel ? sel.isCollapsed : 'null') +
        ' text=' + (sel ? JSON.stringify(sel.toString().substring(0, 30)) : 'null'));
    }

    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(() => {
      checkSelection();
    }, 200);
  }

  function checkSelection() {
    if (isTranslating) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      if (!isTranslating) hideFloatBtn();
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      if (!isTranslating) hideFloatBtn();
      return;
    }

    try {
      const range = selection.getRangeAt(selection.rangeCount - 1);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        if (!isTranslating) hideFloatBtn();
        return;
      }
      console.log('[ScholarTranslate] Selection detected:', text.substring(0, 50) + '...');
      showFloatBtn(rect, text);
    } catch (e) {
      console.warn('[ScholarTranslate] Selection check error:', e);
    }
  }

  // ============================================================
  // 鼠标事件（辅助）
  // ============================================================
  function onMouseUp(e) {
    if (floatBtn && floatBtn.contains(e.target)) return;
    if (popup && popup.contains(e.target)) return;
    clearTimeout(hideTimer);
    // 立即检查一次（比 selectionchange 更快）
    setTimeout(checkSelection, 50);
  }

  function onMouseDown(e) {
    if (floatBtn && floatBtn.contains(e.target)) return;
    if (popup && popup.contains(e.target)) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!isTranslating) hideAll();
    }, 300);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      hideAll();
      window.getSelection().removeAllRanges();
    }
  }

  // ============================================================
  // 浮动翻译按钮
  // ============================================================
  function showFloatBtn(selectionRect, selectedText) {
    if (!floatBtn) {
      floatBtn = createFloatBtn();
      document.body.appendChild(floatBtn);
    }

    // 保存选区信息和文本
    lastSelectionRect = selectionRect;
    savedText = selectedText;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let left = selectionRect.right + scrollX + 6;
    let top = selectionRect.bottom + scrollY + 4;

    // 避免超出视口
    if (left + 42 > window.innerWidth + scrollX) {
      left = selectionRect.left + scrollX - 42 - 6;
    }
    if (top + 30 > window.innerHeight + scrollY) {
      top = selectionRect.top + scrollY - 30 - 4;
    }

    floatBtn.style.left = left + 'px';
    floatBtn.style.top = top + 'px';
    floatBtn.style.display = 'flex';
    floatBtn.style.opacity = '1';

    clearTimeout(floatBtn._autoHide);
    // 5 秒后自动隐藏
    floatBtn._autoHide = setTimeout(() => {
      if (!isTranslating && (!popup || popup.style.display === 'none')) {
        hideFloatBtn();
      }
    }, 5000);
  }

  function createFloatBtn() {
    const btn = document.createElement('div');
    btn.id = 'st-float-translate-btn';
    btn.innerHTML = `
      <style>
        #st-float-translate-btn {
          position: absolute;
          z-index: 2147483646;
          display: none;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: #4285f4;
          color: white;
          border-radius: 50%;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.2s;
          user-select: none;
          pointer-events: auto;
        }
        #st-float-translate-btn:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          background: #3367d6;
        }
        #st-float-translate-btn.st-loading {
          background: #999;
          pointer-events: none;
          animation: st-spin 0.8s linear infinite;
        }
        @keyframes st-spin {
          to { transform: rotate(360deg); }
        }
      </style>
      译
    `;

    // 使用 mousedown 而不是 click，避免浏览器清空选区后再触发
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isTranslating) return;
      if (!savedText) return;

      // 保持按钮可见（不清除）
      clearTimeout(floatBtn._autoHide);

      translateAndShow(savedText);
    });

    return btn;
  }

  function hideFloatBtn() {
    if (floatBtn) {
      floatBtn.style.opacity = '0';
      floatBtn.style.display = 'none';
    }
  }

  // ============================================================
  // 翻译弹窗
  // ============================================================
  function createPopup() {
    const el = document.createElement('div');
    el.id = 'st-translate-popup';

    const shadow = el.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          position: absolute;
          z-index: 2147483647;
          display: none;
          max-width: 480px;
          min-width: 200px;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          font-size: 13px;
          line-height: 1.65;
          pointer-events: auto;
          animation: st-popup-in 0.2s ease-out;
        }
        @keyframes st-popup-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .st-popup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px 6px;
        }
        .st-popup-label {
          font-size: 11px;
          color: #888;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .st-popup-actions {
          display: flex;
          gap: 4px;
        }
        .st-popup-actions button {
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          border-radius: 50%;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          transition: background 0.15s, color 0.15s;
        }
        .st-popup-actions button:hover {
          background: #f0f0f0;
          color: #333;
        }
        .st-popup-original {
          padding: 6px 14px;
          color: #555;
          font-size: 12.5px;
          border-bottom: 1px solid #f0f0f0;
          max-height: 80px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .st-popup-translation {
          padding: 10px 14px 14px;
          color: #1a56db;
          font-size: 14px;
          white-space: pre-wrap;
          word-break: break-word;
          min-height: 20px;
        }
        .st-popup-translation.st-loading {
          color: #bbb;
          font-style: italic;
        }
        .st-popup-error {
          padding: 10px 14px 14px;
          color: #d93025;
          font-size: 12.5px;
        }
        @media (prefers-color-scheme: dark) {
          :host {
            background: #1e1e1e;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          }
          .st-popup-label { color: #888; }
          .st-popup-original { color: #bbb; border-bottom-color: #333; }
          .st-popup-translation { color: #7db5f5; }
          .st-popup-actions button:hover { background: #333; color: #ddd; }
        }
      </style>
      <div class="st-popup-header">
        <span class="st-popup-label">📖 翻译</span>
        <div class="st-popup-actions">
          <button id="st-copy-btn" title="复制译文">📋</button>
          <button id="st-close-btn" title="关闭">✕</button>
        </div>
      </div>
      <div class="st-popup-original" id="st-original-text"></div>
      <div class="st-popup-translation st-loading" id="st-translated-text">翻译中...</div>
    `;

    shadow.getElementById('st-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      hideAll();
    });
    shadow.getElementById('st-copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const translated = shadow.getElementById('st-translated-text').textContent;
      navigator.clipboard.writeText(translated).then(() => {
        const copyBtn = shadow.getElementById('st-copy-btn');
        copyBtn.textContent = '✅';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
      }).catch(() => {});
    });

    document.body.appendChild(el);
    return el;
  }

  // ============================================================
  // 弹窗定位
  // ============================================================
  function positionPopup() {
    if (!popup) return;

    // 优先使用保存的选区位置，其次使用按钮位置
    let anchorRect;
    if (lastSelectionRect) {
      anchorRect = lastSelectionRect;
    } else if (floatBtn && floatBtn.style.display !== 'none') {
      anchorRect = floatBtn.getBoundingClientRect();
    } else {
      // 降级：屏幕中央
      anchorRect = {
        left: window.innerWidth / 2,
        right: window.innerWidth / 2,
        top: window.innerHeight / 2,
        bottom: window.innerHeight / 2
      };
    }

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const popupWidth = 480;

    // 弹窗出现在选区/按钮的下方
    let left = anchorRect.left + scrollX - 200;
    let top = anchorRect.bottom + scrollY + 8;

    // 确保不超出视口
    if (left + popupWidth > window.innerWidth + scrollX) {
      left = window.innerWidth + scrollX - popupWidth - 16;
    }
    if (left < scrollX + 16) {
      left = scrollX + 16;
    }
    // 如果下方空间不够，放到上方
    if (top + 300 > window.innerHeight + scrollY) {
      top = anchorRect.top + scrollY - 300 - 8;
    }
    if (top < scrollY + 8) {
      top = scrollY + 60;
    }

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  // ============================================================
  // 翻译逻辑
  // ============================================================
  async function translateAndShow(text) {
    if (isTranslating) return;
    isTranslating = true;

    if (floatBtn) {
      floatBtn.classList.add('st-loading');
    }

    // 创建弹窗
    if (!popup) {
      popup = createPopup();
    }
    const shadow = popup.shadowRoot;
    shadow.getElementById('st-original-text').textContent =
      text.length > 300 ? text.substring(0, 300) + '...' : text;
    shadow.getElementById('st-translated-text').textContent = '翻译中...';
    shadow.getElementById('st-translated-text').className = 'st-popup-translation st-loading';

    // 定位弹窗
    positionPopup();
    popup.style.display = 'block';
    popup.style.opacity = '1';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        payload: {
          texts: [text],
          from: 'en',
          to: 'zh-CN'
        }
      });

      if (response && response.success && response.results[0]) {
        const translated = response.results[0];
        if (translated !== text) {
          shadow.getElementById('st-translated-text').textContent = translated;
          shadow.getElementById('st-translated-text').className = 'st-popup-translation';
        } else {
          shadow.getElementById('st-translated-text').textContent = '（翻译结果与原文相同，请尝试更换翻译引擎）';
          shadow.getElementById('st-translated-text').className = 'st-popup-translation';
        }
      } else {
        shadow.getElementById('st-translated-text').textContent = '翻译失败：' + ((response && response.error) || '未知错误');
        shadow.getElementById('st-translated-text').className = 'st-popup-error';
      }
    } catch (err) {
      console.error('[ScholarTranslate] Selection translate error:', err);
      shadow.getElementById('st-translated-text').textContent = '翻译失败：无法连接到翻译服务，请检查网络';
      shadow.getElementById('st-translated-text').className = 'st-popup-error';
    } finally {
      isTranslating = false;
      if (floatBtn) {
        floatBtn.classList.remove('st-loading');
        hideFloatBtn();
      }
    }
  }

  // ============================================================
  // 隐藏
  // ============================================================
  function hideAll() {
    clearTimeout(hideTimer);
    lastSelectionRect = null;
    savedText = '';
    hideFloatBtn();
    if (popup) {
      popup.style.display = 'none';
      popup.style.opacity = '0';
    }
    isTranslating = false;
  }

  // ============================================================
  // 消息监听
  // ============================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_TRANSLATION') {
      if (message.payload.enabled === false) hideAll();
      sendResponse({ success: true });
    }
    return true;
  });

  // ============================================================
  // 启动
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
