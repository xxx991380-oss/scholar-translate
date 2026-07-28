/**
 * ScholarTranslate — DOM 操作工具
 * TreeWalker 文本提取、翻译注入、MutationObserver、Shadow DOM UI
 */

const DOMUtils = {
  // ============================================================
  // 文本提取
  // ============================================================

  /**
   * 使用 TreeWalker 从 DOM 元素中提取文本节点
   * 排除脚本、样式和已翻译的内容
   */
  extractTextNodes(rootElement, options = {}) {
    const {
      minLength = 3,
      excludeSelectors = 'script, style, noscript, textarea, input, [contenteditable="true"], .st-translation, [data-st-translated]',
      onlyVisible = true
    } = options;

    const textNodes = [];
    const walker = document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // 排除指定选择器
          if (parent.matches(excludeSelectors)) {
            return NodeFilter.FILTER_REJECT;
          }

          // 检查祖先节点是否已被翻译
          if (parent.closest('[data-st-translated]') || parent.closest('.st-translation')) {
            return NodeFilter.FILTER_REJECT;
          }

          // 可见性检查
          if (onlyVisible) {
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }
          }

          const text = node.textContent.trim();
          return text.length >= minLength
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    return textNodes;
  },

  /**
   * 从文本节点数组中提取去重后的文本片段
   */
  extractUniqueTexts(textNodes, options = {}) {
    const {
      maxLength = 1000,
      normalize = true
    } = options;

    const seen = new Set();
    const texts = [];

    for (const node of textNodes) {
      let text = node.textContent.trim();
      if (normalize) {
        text = text.replace(/\s+/g, ' ');
      }
      const key = text.substring(0, 200);
      if (!seen.has(key) && text.length >= 3) {
        seen.add(key);
        texts.push(text.substring(0, maxLength));
      }
    }

    return texts;
  },

  // ============================================================
  // Google Scholar DOM 解析
  // ============================================================

  /**
   * 解析 Google Scholar 搜索结果
   * @returns {Array<{id: string, element: HTMLElement, titleEl: HTMLElement, titleText: string, snippetEl: HTMLElement|null, snippetText: string, authorsEl: HTMLElement|null}>}
   */
  parseScholarResults() {
    const results = [];
    const resultElements = document.querySelectorAll('div.gs_r.gs_or.gs_scl');

    for (const el of resultElements) {
      const titleEl = el.querySelector('.gs_rt');
      const authorsEl = el.querySelector('.gs_a');
      const snippetEl = el.querySelector('.gs_rs');

      const titleText = titleEl ? titleEl.textContent.replace(/^\[(PDF|HTML|BOOK|B|C|DOC)\]\s*/i, '').trim() : '';
      const snippetText = snippetEl ? snippetEl.textContent.trim() : '';

      // 生成唯一 ID
      const rawId = titleText + snippetText.substring(0, 100);
      const id = DOMUtils._hashString(rawId);

      if (titleText || snippetText) {
        results.push({ id, element: el, titleEl, titleText, snippetEl, snippetText: snippetText.substring(0, 1000), authorsEl });
      }
    }

    return results;
  },

  /**
   * 查找尚未翻译的 Scholar 结果
   */
  findUntranslatedResults() {
    const all = DOMUtils.parseScholarResults();
    return all.filter(r => !r.element.hasAttribute('data-st-translated'));
  },

  // ============================================================
  // 翻译注入
  // ============================================================

  /**
   * 在 Google Scholar 结果下方注入翻译
   */
  injectScholarTranslation(result, translatedTitle, translatedSnippet) {
    const container = document.createElement('div');
    container.className = 'st-translation';
    container.setAttribute('data-st-id', result.id);

    let html = '';

    if (translatedTitle && translatedTitle !== result.titleText) {
      html += `<div class="st-trans-title">${DOMUtils._escapeHtml(translatedTitle)}</div>`;
    }

    if (translatedSnippet && translatedSnippet !== result.snippetText) {
      html += `<div class="st-trans-snippet">${DOMUtils._escapeHtml(translatedSnippet)}</div>`;
    }

    if (!html) {
      return; // 没有新内容，不注入
    }

    container.innerHTML = html;

    // 注入到结果元素末尾
    result.element.appendChild(container);
    result.element.setAttribute('data-st-translated', 'true');

    // 为标题也添加翻译（如果标题翻译不同）
    if (translatedTitle && translatedTitle !== result.titleText && result.titleEl) {
      result.titleEl.setAttribute('data-st-original-title', result.titleText);
    }
  },

  /**
   * 注入翻译到普通文本节点
   */
  injectTextTranslation(textNode, translatedText) {
    if (!translatedText || translatedText === textNode.textContent.trim()) return;

    const parent = textNode.parentElement;
    if (!parent) return;

    // 如果父元素只有一个文本子节点，包装它
    if (parent.childNodes.length === 1 && parent.childNodes[0] === textNode) {
      // 保存原文
      const originalSpan = document.createElement('span');
      originalSpan.className = 'st-original';
      originalSpan.textContent = textNode.textContent;

      // 创建译文
      const transSpan = document.createElement('span');
      transSpan.className = 'st-translation-text';
      transSpan.textContent = translatedText;

      // 清空并重新填充
      parent.textContent = '';
      parent.appendChild(originalSpan);
      parent.appendChild(transSpan);
      parent.setAttribute('data-st-translated', 'true');
    }
  },

  // ============================================================
  // MutationObserver
  // ============================================================

  /**
   * 创建 MutationObserver 来监控动态内容
   * @param {Function} callback - 当新内容出现时的回调
   * @param {Object} options
   * @returns {MutationObserver}
   */
  createContentObserver(callback, options = {}) {
    const {
      targetSelector = '#gs_res_ccl_mid',
      resultSelector = '.gs_r.gs_or.gs_scl',
      debounceMs = 300,
      rootElement = document.body
    } = options;

    let debounceTimer = null;

    const observer = new MutationObserver((mutations) => {
      let hasNewResults = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.matches && node.matches(resultSelector)) {
              hasNewResults = true;
              break;
            }
            if (node.querySelectorAll && node.querySelectorAll(resultSelector).length > 0) {
              hasNewResults = true;
              break;
            }
          }
        }
        if (hasNewResults) break;
      }

      if (hasNewResults) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(callback, debounceMs);
      }
    });

    // 查找目标容器
    const target = rootElement.querySelector(targetSelector) || rootElement;

    observer.observe(target, {
      childList: true,
      subtree: true
    });

    return observer;
  },

  // ============================================================
  // Shadow DOM 控制面板
  // ============================================================

  /**
   * 创建 Shadow DOM 翻译控制浮层
   */
  createControlPanel(options = {}) {
    const {
      onToggleMode = () => {},
      onTranslateNow = () => {},
      onSettings = () => {}
    } = options;

    const host = document.createElement('div');
    host.id = 'st-control-panel-host';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .st-float-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #4285f4;
          color: white;
          border: none;
          cursor: pointer;
          box-shadow: 0 2px 12px rgba(0,0,0,0.2);
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .st-float-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .st-float-btn.active {
          background: #34a853;
        }
        .st-panel {
          display: none;
          position: absolute;
          bottom: 60px;
          right: 0;
          width: 220px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.15);
          padding: 12px;
          flex-direction: column;
          gap: 6px;
        }
        .st-panel.visible {
          display: flex;
        }
        .st-panel button {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 10px 12px;
          border: none;
          background: transparent;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          text-align: left;
          color: #333;
          transition: background 0.15s;
        }
        .st-panel button:hover {
          background: #f0f0f0;
        }
        .st-panel button .st-icon {
          font-size: 16px;
          width: 20px;
          text-align: center;
        }
        .st-mode-indicator {
          font-size: 11px;
          color: #888;
          padding: 4px 12px;
          text-align: center;
          border-bottom: 1px solid #eee;
          margin-bottom: 4px;
        }
      </style>
      <button class="st-float-btn" id="st-float-btn" title="ScholarTranslate — 学术翻译">译</button>
      <div class="st-panel" id="st-panel">
        <div class="st-mode-indicator" id="st-mode-label">显示模式：双语对照</div>
        <button id="st-btn-bilingual">
          <span class="st-icon">📖</span> 双语对照
        </button>
        <button id="st-btn-translation-only">
          <span class="st-icon">🇨🇳</span> 仅看译文
        </button>
        <button id="st-btn-original-only">
          <span class="st-icon">🔤</span> 仅看原文
        </button>
        <button id="st-btn-refresh">
          <span class="st-icon">🔄</span> 重新翻译
        </button>
        <button id="st-btn-settings">
          <span class="st-icon">⚙️</span> 设置
        </button>
      </div>
    `;

    const floatBtn = shadow.getElementById('st-float-btn');
    const panel = shadow.getElementById('st-panel');
    let panelVisible = false;

    floatBtn.addEventListener('click', () => {
      panelVisible = !panelVisible;
      panel.classList.toggle('visible', panelVisible);
    });

    // 点击页面其他地方关闭面板
    document.addEventListener('click', (e) => {
      if (panelVisible && !host.contains(e.target)) {
        panelVisible = false;
        panel.classList.remove('visible');
      }
    });

    // 按钮事件绑定
    shadow.getElementById('st-btn-bilingual').addEventListener('click', () => {
      onToggleMode('bilingual');
      shadow.getElementById('st-mode-label').textContent = '显示模式：双语对照';
      floatBtn.classList.add('active');
    });

    shadow.getElementById('st-btn-translation-only').addEventListener('click', () => {
      onToggleMode('translation-only');
      shadow.getElementById('st-mode-label').textContent = '显示模式：仅译文';
      floatBtn.classList.add('active');
    });

    shadow.getElementById('st-btn-original-only').addEventListener('click', () => {
      onToggleMode('original-only');
      shadow.getElementById('st-mode-label').textContent = '显示模式：仅原文';
      floatBtn.classList.remove('active');
    });

    shadow.getElementById('st-btn-refresh').addEventListener('click', () => {
      onTranslateNow();
    });

    shadow.getElementById('st-btn-settings').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      onSettings();
    });

    return {
      host,
      setMode: (mode) => {
        const labels = {
          'bilingual': '显示模式：双语对照',
          'translation-only': '显示模式：仅译文',
          'original-only': '显示模式：仅原文'
        };
        shadow.getElementById('st-mode-label').textContent = labels[mode] || labels['bilingual'];
        if (mode === 'original-only') {
          floatBtn.classList.remove('active');
        } else {
          floatBtn.classList.add('active');
        }
      },
      show: () => { host.style.display = 'block'; },
      hide: () => { host.style.display = 'none'; }
    };
  },

  // ============================================================
  // 显示模式切换
  // ============================================================

  /**
   * 设置翻译显示模式
   */
  setDisplayMode(mode) {
    const root = document.documentElement;
    root.classList.remove('st-mode-bilingual', 'st-mode-translation-only', 'st-mode-original-only');

    switch (mode) {
      case 'bilingual':
        root.classList.add('st-mode-bilingual');
        break;
      case 'translation-only':
        root.classList.add('st-mode-translation-only');
        break;
      case 'original-only':
        root.classList.add('st-mode-original-only');
        break;
    }

    // 保存到 storage
    chrome.storage.local.set({ displayMode: mode });
  },

  /**
   * 获取当前显示模式
   */
  async getDisplayMode() {
    try {
      const result = await chrome.storage.local.get('displayMode');
      return result.displayMode || 'bilingual';
    } catch (e) {
      return 'bilingual';
    }
  },

  // ============================================================
  // 辅助函数
  // ============================================================

  _hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash).toString(36);
  },

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

if (typeof self !== 'undefined') {
  self.DOMUtils = DOMUtils;
}
