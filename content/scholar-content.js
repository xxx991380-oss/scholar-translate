/**
 * ScholarTranslate — Google Scholar 内容脚本
 * 负责：搜索结果页面的标题/摘要翻译、动态内容监控、翻译注入
 */

(function () {
  'use strict';

  let controlPanel = null;
  let contentObserver = null;
  let isTranslating = false;

  // ============================================================
  // 初始化
  // ============================================================
  async function init() {
    // 检查是否在 Google Scholar 页面
    if (!window.location.hostname.includes('scholar.google')) {
      return;
    }

    // 加载显示模式
    const settings = await loadSettings();
    DOMUtils.setDisplayMode(settings.displayMode || 'bilingual');

    // 创建控制面板
    controlPanel = DOMUtils.createControlPanel({
      onToggleMode: (mode) => {
        DOMUtils.setDisplayMode(mode);
        saveSetting('displayMode', mode);
      },
      onTranslateNow: () => {
        translateScholarPage();
      },
      onSettings: () => {
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      }
    });

    // 检查翻译是否启用
    if (settings.enabled === false) {
      controlPanel.setMode('original-only');
      return;
    }

    // 开始翻译
    await translateScholarPage();

    // 安装 MutationObserver 监控动态加载的内容
    contentObserver = DOMUtils.createContentObserver(
      () => translateScholarPage(),
      { debounceMs: 500 }
    );

    console.log('[ScholarTranslate] Scholar content script initialized');
  }

  // ============================================================
  // 翻译逻辑
  // ============================================================
  async function translateScholarPage() {
    if (isTranslating) return;
    isTranslating = true;

    try {
      const untranslated = DOMUtils.findUntranslatedResults();
      if (untranslated.length === 0) {
        isTranslating = false;
        return;
      }

      const settings = await loadSettings();

      // 收集需要翻译的文本
      const titleTexts = untranslated.map(r => r.titleText).filter(Boolean);
      const snippetTexts = untranslated.map(r => r.snippetText).filter(Boolean);
      const allTexts = [...titleTexts, ...snippetTexts].filter(t => t.length >= 3);

      if (allTexts.length === 0) {
        isTranslating = false;
        return;
      }

      // 发送批量翻译请求到 Service Worker
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        payload: {
          texts: allTexts,
          from: settings.sourceLang || 'en',
          to: settings.targetLang || 'zh-CN',
          engine: settings.preferredEngine
        }
      });

      if (!response.success) {
        console.warn('[ScholarTranslate] Translation failed:', response.error);
        isTranslating = false;
        return;
      }

      const translations = response.results;

      // 按原文建立映射
      const transMap = new Map();
      for (let i = 0; i < allTexts.length; i++) {
        if (translations[i] && translations[i] !== allTexts[i]) {
          transMap.set(allTexts[i], translations[i]);
        }
      }

      // 注入翻译到每个结果
      for (const result of untranslated) {
        const translatedTitle = result.titleText ? (transMap.get(result.titleText) || '') : '';
        const translatedSnippet = result.snippetText ? (transMap.get(result.snippetText) || '') : '';

        if (translatedTitle || translatedSnippet) {
          DOMUtils.injectScholarTranslation(result, translatedTitle, translatedSnippet);
        } else {
          // 即使翻译未变化也标记为已处理，避免重复尝试
          result.element.setAttribute('data-st-translated', 'true');
        }
      }

      console.log(`[ScholarTranslate] Translated ${untranslated.length} results`);

    } catch (err) {
      console.error('[ScholarTranslate] Translate page error:', err);
    } finally {
      isTranslating = false;
    }
  }

  // ============================================================
  // 设置管理
  // ============================================================
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      return response.settings || {};
    } catch (e) {
      return {};
    }
  }

  async function saveSetting(key, value) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      const settings = response.settings || {};
      settings[key] = value;
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { settings }
      });
    } catch (e) {
      console.warn('[ScholarTranslate] Save setting failed:', e);
    }
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
