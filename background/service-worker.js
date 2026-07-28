/**
 * ScholarTranslate — Background Service Worker
 * 核心调度：翻译请求路由、缓存管理、设置读写、消息路由
 */

// 加载 lib 文件
importScripts('../lib/translator.js', '../lib/cache.js');

// ============================================================
// 默认设置
// ============================================================
const DEFAULT_SETTINGS = {
  enabled: true,
  preferredEngine: 'google-gtx',
  sourceLang: 'en',
  targetLang: 'zh-CN',
  displayMode: 'bilingual',
  engines: {
    'deepseek': { apiKey: '' },
    'openai': { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
  }
};

// ============================================================
// 设置管理
// ============================================================
async function getSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
  // 同步更新翻译引擎配置
  configureEngines(settings);
}

function configureEngines(settings) {
  // 配置 DeepSeek
  if (settings.engines?.deepseek?.apiKey) {
    translatorManager.configureLLM('deepseek', {
      apiKey: settings.engines.deepseek.apiKey
    });
    if (!translatorManager.engineOrder.includes('deepseek')) {
      translatorManager.engineOrder.push('deepseek');
    }
  }

  // 配置 OpenAI
  if (settings.engines?.openai?.apiKey) {
    translatorManager.configureLLM('openai', {
      apiKey: settings.engines.openai.apiKey,
      baseUrl: settings.engines.openai.baseUrl || 'https://api.openai.com/v1',
      model: settings.engines.openai.model || 'gpt-4o-mini'
    });
    if (!translatorManager.engineOrder.includes('openai')) {
      translatorManager.engineOrder.push('openai');
    }
  }
}

// ============================================================
// 翻译请求处理
// ============================================================

/**
 * 处理批量翻译请求
 */
async function handleTranslateRequest(texts, from, to, preferredEngine) {
  const results = [];

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (!text || !text.trim()) {
      results.push('');
      continue;
    }

    // 1. 查缓存
    const cached = await translationCache.get(text, from, to, preferredEngine || 'google-gtx');
    if (cached) {
      results.push(cached);
      continue;
    }

    results.push(null); // 占位，标记待翻译
  }

  // 2. 收集所有未命中的文本索引
  const uncachedIndices = [];
  const uncachedTexts = [];
  results.forEach((r, i) => {
    if (r === null) {
      uncachedIndices.push(i);
      uncachedTexts.push(texts[i]);
    }
  });

  // 3. 批量翻译未命中的文本
  if (uncachedTexts.length > 0) {
    const translated = await translatorManager.translate(
      uncachedTexts, from, to, preferredEngine
    );

    // 4. 写回缓存并填充结果
    for (let i = 0; i < uncachedTexts.length; i++) {
      const originalIdx = uncachedIndices[i];
      const translatedText = translated[i] || uncachedTexts[i];

      results[originalIdx] = translatedText;

      // 写入缓存（异步，不阻塞返回）
      translationCache.set(
        uncachedTexts[i], from, to,
        preferredEngine || 'google-gtx',
        translatedText
      ).catch(e => console.warn('[ScholarTranslate] Cache write error:', e));
    }
  }

  return results;
}

// ============================================================
// 消息路由
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      // ---------- 翻译请求 ----------
      case 'TRANSLATE': {
        const { texts, from, to, engine } = message.payload;
        const settings = await getSettings();

        if (!settings.enabled) {
          sendResponse({ success: false, error: '翻译已禁用', results: texts.map(t => t) });
          return;
        }

        const preferredEngine = engine || settings.preferredEngine;
        const sourceLang = from || settings.sourceLang;
        const targetLang = to || settings.targetLang;

        try {
          const results = await handleTranslateRequest(texts, sourceLang, targetLang, preferredEngine);
          sendResponse({ success: true, results });
        } catch (err) {
          console.error('[ScholarTranslate] Translation error:', err);
          sendResponse({ success: false, error: err.message, results: texts.map(t => t) });
        }
        break;
      }

      // ---------- 获取设置 ----------
      case 'GET_SETTINGS': {
        const settings = await getSettings();
        sendResponse({ success: true, settings });
        break;
      }

      // ---------- 保存设置 ----------
      case 'SAVE_SETTINGS': {
        const settings = message.payload.settings;
        await saveSettings(settings);
        sendResponse({ success: true });
        break;
      }

      // ---------- 缓存统计 ----------
      case 'GET_CACHE_STATS': {
        const stats = await translationCache.getStats();
        sendResponse({ success: true, stats });
        break;
      }

      // ---------- 清除缓存 ----------
      case 'CLEAR_CACHE': {
        await translationCache.clearAll();
        sendResponse({ success: true });
        break;
      }

      // ---------- 打开设置页 ----------
      case 'OPEN_OPTIONS': {
        chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
        break;
      }

      // ---------- 翻译单个文本（用于测试） ----------
      case 'TRANSLATE_SINGLE': {
        const { text, from, to, engine } = message.payload;
        const settings = await getSettings();
        const results = await handleTranslateRequest(
          [text],
          from || settings.sourceLang,
          to || settings.targetLang,
          engine || settings.preferredEngine
        );
        sendResponse({ success: true, translated: results[0] });
        break;
      }

      // ---------- 代理获取 PDF 文件（解决 file:// CORS 问题）----------
      case 'FETCH_PDF': {
        const { url } = message.payload;
        console.log('[ScholarTranslate] Fetching PDF via service worker:', url);
        try {
          const response = await fetch(url);
          if (!response.ok) {
            sendResponse({ success: false, error: `HTTP ${response.status}` });
            return;
          }
          const arrayBuffer = await response.arrayBuffer();
          // 转为 base64 传输
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          sendResponse({ success: true, data: base64 });
        } catch (err) {
          console.error('[ScholarTranslate] PDF fetch error:', err);
          sendResponse({ success: false, error: err.message });
        }
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
    }
  })();

  // 返回 true 表示异步 sendResponse
  return true;
});

// ============================================================
// 安装 & 启动
// ============================================================
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[ScholarTranslate] Extension installed');

  // 初始化默认设置
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await saveSettings(DEFAULT_SETTINGS);
  }

  // 初始化显示模式
  const mode = await chrome.storage.local.get('displayMode');
  if (!mode.displayMode) {
    await chrome.storage.local.set({ displayMode: 'bilingual' });
  }

  // 配置已保存的 API 引擎
  const settings = await getSettings();
  configureEngines(settings);
});

// 启动时也加载设置
(async () => {
  const settings = await getSettings();
  configureEngines(settings);
  console.log('[ScholarTranslate] Service worker started. Engines:', translatorManager.engineOrder);
})();
