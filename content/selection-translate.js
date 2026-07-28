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

  // ============================================================
  // 初始化
  // ============================================================
  function init() {
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    console.log('[ScholarTranslate] Selection translate ready');
  }

  // ============================================================
  // 鼠标事件
  // ============================================================
  function onMouseUp(e) {
    // 延迟一下，确保 selection 已更新
    clearTimeout(hideTimer);
    setTimeout(() => handleSelection(e), 50);
  }

  function onMouseDown(e) {
    // 点击浮动按钮或弹窗时不关闭
    if (floatBtn && floatBtn.contains(e.target)) return;
    if (popup && popup.contains(e.target)) return;

    // 在其他地方点击时，延迟隐藏（给按钮点击事件时间触发）
    hideTimer = setTimeout(() => {
      hideAll();
    }, 200);
  }

  function onKeyDown(e) {
    // ESC 关闭翻译弹窗
    if (e.key === 'Escape') {
      hideAll();
    }
  }

  // ============================================================
  // 选中处理
  // ============================================================
  function handleSelection(e) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideFloatBtn();
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      hideFloatBtn();
      return;
    }

    // 获取选区的最后一个 range 的边界矩形
    const range = selection.getRangeAt(selection.rangeCount - 1);
    const rect = range.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideFloatBtn();
      return;
    }

    // 检查选区是否在可编辑区域
    const container = range.commonAncestorContainer;
    const editable = container.nodeType === Node.ELEMENT_NODE
      ? container.closest('input, textarea, [contenteditable="true"]')
      : container.parentElement?.closest('input, textarea, [contenteditable="true"]');
    // 可编辑区域也支持，但不自动弹出按钮（避免干扰输入）
    // 改为需要按快捷键触发

    showFloatBtn(rect, text);
  }

  // ============================================================
  // 浮动翻译按钮
  // ============================================================
  function showFloatBtn(selectionRect, selectedText) {
    if (!floatBtn) {
      floatBtn = createFloatBtn();
      document.body.appendChild(floatBtn);
    }

    // 计算按钮位置（选区末尾上方）
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // 按钮放在选区最后一行的右下方
    let left = selectionRect.right + scrollX + 6;
    let top = selectionRect.bottom + scrollY + 4;

    // 避免超出视口右边界
    if (left + 42 > window.innerWidth + scrollX) {
      left = selectionRect.left + scrollX - 42 - 6;
    }
    // 避免超出视口底部
    if (top + 30 > window.innerHeight + scrollY) {
      top = selectionRect.top + scrollY - 30 - 4;
    }

    floatBtn.style.left = left + 'px';
    floatBtn.style.top = top + 'px';
    floatBtn.style.display = 'flex';
    floatBtn.style.opacity = '1';

    // 保存选中文本供翻译使用
    floatBtn._selectedText = selectedText;

    // 3 秒后自动隐藏
    clearTimeout(floatBtn._autoHide);
    floatBtn._autoHide = setTimeout(() => {
      if (!popup || popup.style.display === 'none') {
        hideFloatBtn();
      }
    }, 3000);
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

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (isTranslating) return;
      const text = btn._selectedText;
      if (!text) return;

      await translateAndShow(text, btn);
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
        /* 暗色模式 */
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

    shadow.getElementById('st-close-btn').addEventListener('click', hideAll);
    shadow.getElementById('st-copy-btn').addEventListener('click', () => {
      const translated = shadow.getElementById('st-translated-text').textContent;
      navigator.clipboard.writeText(translated).then(() => {
        const btn = shadow.getElementById('st-copy-btn');
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '📋'; }, 1500);
      }).catch(() => {});
    });

    document.body.appendChild(el);
    return el;
  }

  function showPopup(anchorEl, originalText, translatedText) {
    if (!popup) {
      popup = createPopup();
    }

    const shadow = popup.shadowRoot;
    shadow.getElementById('st-original-text').textContent = originalText;
    const transEl = shadow.getElementById('st-translated-text');
    transEl.textContent = translatedText;
    transEl.className = 'st-popup-translation';

    // 计算弹窗位置（在按钮下方）
    const anchorRect = anchorEl.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    let left = anchorRect.left + scrollX - 200 + 16; // 居中偏左
    let top = anchorRect.bottom + scrollY + 8;

    // 确保不超出视口
    const popupWidth = 480;
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

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.display = 'block';
    popup.style.opacity = '1';

    // 更新关闭按钮事件
    shadow.getElementById('st-close-btn').onclick = hideAll;
  }

  // ============================================================
  // 翻译逻辑
  // ============================================================
  async function translateAndShow(text, anchorEl) {
    if (isTranslating) return;
    isTranslating = true;

    // 显示加载状态
    if (floatBtn) {
      floatBtn.classList.add('st-loading');
    }

    // 先显示弹窗（加载中）
    if (!popup) {
      popup = createPopup();
    }
    const shadow = popup.shadowRoot;
    shadow.getElementById('st-original-text').textContent =
      text.length > 300 ? text.substring(0, 300) + '...' : text;
    shadow.getElementById('st-translated-text').textContent = '翻译中...';
    shadow.getElementById('st-translated-text').className = 'st-popup-translation st-loading';

    // 计算位置
    const anchorRect = anchorEl.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    let left = anchorRect.left + scrollX - 200 + 16;
    let top = anchorRect.bottom + scrollY + 8;
    const popupWidth = 480;
    if (left + popupWidth > window.innerWidth + scrollX) {
      left = window.innerWidth + scrollX - popupWidth - 16;
    }
    if (left < scrollX + 16) left = scrollX + 16;
    if (top + 300 > window.innerHeight + scrollY) {
      top = anchorRect.top + scrollY - 300 - 8;
    }
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.display = 'block';
    popup.style.opacity = '1';

    try {
      // 发送翻译请求
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        payload: {
          texts: [text],
          from: 'en',
          to: 'zh-CN'
        }
      });

      if (response.success && response.results[0]) {
        const translated = response.results[0];
        if (translated !== text) {
          shadow.getElementById('st-translated-text').textContent = translated;
          shadow.getElementById('st-translated-text').className = 'st-popup-translation';
        } else {
          shadow.getElementById('st-translated-text').textContent = '（翻译结果与原文相同，请尝试其他引擎）';
          shadow.getElementById('st-translated-text').className = 'st-popup-translation';
        }
      } else {
        shadow.getElementById('st-translated-text').textContent = '翻译失败：' + (response.error || '未知错误');
        shadow.getElementById('st-translated-text').className = 'st-popup-error';
      }
    } catch (err) {
      console.error('[ScholarTranslate] Selection translate error:', err);
      shadow.getElementById('st-translated-text').textContent = '翻译失败，请检查网络连接';
      shadow.getElementById('st-translated-text').className = 'st-popup-error';
    } finally {
      isTranslating = false;
      if (floatBtn) {
        floatBtn.classList.remove('st-loading');
      }
    }
  }

  // ============================================================
  // 隐藏
  // ============================================================
  function hideAll() {
    hideFloatBtn();
    if (popup) {
      popup.style.display = 'none';
      popup.style.opacity = '0';
    }
  }

  // ============================================================
  // 消息监听（响应 popup/background 的控制指令）
  // ============================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_TRANSLATION') {
      if (message.payload.enabled === false) {
        hideAll();
      }
      sendResponse({ success: true });
    }
    if (message.type === 'SET_DISPLAY_MODE') {
      sendResponse({ success: true });
    }
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
