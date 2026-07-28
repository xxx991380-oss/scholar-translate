/**
 * ScholarTranslate — 翻译引擎抽象层
 * 支持多引擎路由、自动降级、负载均衡
 */

// ============================================================
// 翻译引擎基类
// ============================================================
class TranslatorEngine {
  constructor(config = {}) {
    this.config = config;
  }

  get id() { return 'base'; }
  get name() { return 'Base'; }
  get requiresApiKey() { return false; }

  async translate(texts, from, to) {
    throw new Error('Not implemented');
  }

  supportsLanguage(lang) {
    return true;
  }

  isAvailable() {
    return true;
  }
}

// ============================================================
// Google Translate GTX（免费，无需 API Key）
// ============================================================
class GoogleGTXEngine extends TranslatorEngine {
  get id() { return 'google-gtx'; }
  get name() { return 'Google 翻译（免费）'; }
  get requiresApiKey() { return false; }

  async translate(texts, from, to) {
    const results = [];
    for (const text of texts) {
      if (!text.trim()) {
        results.push('');
        continue;
      }
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const translated = (data[0] || [])
          .filter(seg => seg && seg[0])
          .map(seg => seg[0])
          .join('');
        results.push(translated || text);
      } catch (err) {
        console.warn(`[ScholarTranslate] Google GTX translate failed:`, err.message);
        results.push(text); // 降级返回原文
      }
    }
    return results;
  }
}

// ============================================================
// DeepLX 引擎（免费 DeepL 代理）
// ============================================================
class DeepLXEngine extends TranslatorEngine {
  get id() { return 'deeplx'; }
  get name() { return 'DeepLX（免费 DeepL 代理）'; }
  get requiresApiKey() { return false; }

  async translate(texts, from, to) {
    // 转换语言代码为 DeepL 格式
    const langMap = { 'zh-CN': 'ZH', 'zh': 'ZH', 'en': 'EN', 'ja': 'JA', 'ko': 'KO' };
    const targetLang = langMap[to] || to.toUpperCase();
    const sourceLang = langMap[from] || from.toUpperCase();

    const results = [];
    for (const text of texts) {
      if (!text.trim()) { results.push(''); continue; }
      try {
        const response = await fetch('https://api.deeplx.org/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            source_lang: sourceLang,
            target_lang: targetLang
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        results.push(data.data || text);
      } catch (err) {
        console.warn(`[ScholarTranslate] DeepLX translate failed:`, err.message);
        results.push(text);
      }
    }
    return results;
  }
}

// ============================================================
// DeepSeek LLM 引擎（需 API Key）
// ============================================================
class DeepSeekEngine extends TranslatorEngine {
  get id() { return 'deepseek'; }
  get name() { return 'DeepSeek AI（需 API Key）'; }
  get requiresApiKey() { return true; }

  async translate(texts, from, to) {
    const apiKey = this.config.apiKey;
    if (!apiKey) throw new Error('DeepSeek API Key 未配置');

    const langNames = { 'zh-CN': '简体中文', 'zh': '中文', 'en': 'English', 'ja': '日本語' };
    const targetName = langNames[to] || to;
    const sourceName = langNames[from] || from;

    const results = [];
    for (const text of texts) {
      if (!text.trim()) { results.push(''); continue; }
      try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: `你是一个学术翻译助手。请将以下${sourceName}学术文本翻译成${targetName}。
翻译规则：
1. 使用标准的学术术语
2. 保留作者名、机构名、专有名词不翻译
3. 保留数学符号、化学式不变
4. 只返回翻译结果，不要添加任何解释或注释`
              },
              { role: 'user', content: text }
            ],
            temperature: 0.1,
            max_tokens: 4096
          })
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }
        const data = await response.json();
        results.push(data.choices?.[0]?.message?.content?.trim() || text);
      } catch (err) {
        console.warn(`[ScholarTranslate] DeepSeek translate failed:`, err.message);
        results.push(text);
      }
    }
    return results;
  }
}

// ============================================================
// OpenAI 引擎（需 API Key，可选）
// ============================================================
class OpenAIEngine extends TranslatorEngine {
  get id() { return 'openai'; }
  get name() { return 'OpenAI GPT（需 API Key）'; }
  get requiresApiKey() { return true; }

  async translate(texts, from, to) {
    const apiKey = this.config.apiKey;
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    if (!apiKey) throw new Error('OpenAI API Key 未配置');

    const langNames = { 'zh-CN': '简体中文', 'zh': '中文', 'en': 'English', 'ja': '日本語' };
    const targetName = langNames[to] || to;
    const sourceName = langNames[from] || from;

    const results = [];
    for (const text of texts) {
      if (!text.trim()) { results.push(''); continue; }
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: this.config.model || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `你是一个学术翻译助手。请将以下${sourceName}学术文本翻译成${targetName}。使用标准学术术语，保留专有名词、数学符号不变。只返回翻译结果。`
              },
              { role: 'user', content: text }
            ],
            temperature: 0.1,
            max_tokens: 4096
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        results.push(data.choices?.[0]?.message?.content?.trim() || text);
      } catch (err) {
        console.warn(`[ScholarTranslate] OpenAI translate failed:`, err.message);
        results.push(text);
      }
    }
    return results;
  }
}

// ============================================================
// 翻译引擎管理器
// ============================================================
class TranslatorManager {
  constructor() {
    this.engines = new Map();
    this.engineOrder = ['google-gtx', 'deeplx']; // 默认优先级
    this._registerDefaults();
  }

  _registerDefaults() {
    this.register(new GoogleGTXEngine());
    this.register(new DeepLXEngine());
  }

  register(engine) {
    this.engines.set(engine.id, engine);
  }

  getEngine(id) {
    return this.engines.get(id);
  }

  /**
   * 配置 LLM 引擎（需要 API Key）
   */
  configureLLM(id, config) {
    const engine = this.engines.get(id);
    if (engine) {
      engine.config = { ...engine.config, ...config };
    } else if (id === 'deepseek') {
      this.register(new DeepSeekEngine(config));
    } else if (id === 'openai') {
      this.register(new OpenAIEngine(config));
    }
  }

  /**
   * 主翻译接口
   * @param {string[]} texts - 待翻译文本数组
   * @param {string} from - 源语言
   * @param {string} to - 目标语言
   * @param {string} preferredEngine - 首选引擎 ID
   * @returns {Promise<string[]>} 翻译结果数组
   */
  async translate(texts, from = 'en', to = 'zh-CN', preferredEngine = null) {
    if (!texts.length) return [];

    // 过滤空文本并记录索引
    const nonEmpty = [];
    const indices = [];
    texts.forEach((text, i) => {
      if (text && text.trim()) {
        nonEmpty.push(text.trim());
        indices.push(i);
      }
    });

    if (!nonEmpty.length) return texts.map(() => '');

    // 确定引擎尝试顺序
    const tryOrder = preferredEngine
      ? [preferredEngine, ...this.engineOrder.filter(e => e !== preferredEngine)]
      : [...this.engineOrder];

    let lastError = null;
    for (const engineId of tryOrder) {
      const engine = this.engines.get(engineId);
      if (!engine) continue;

      // 跳过需要 API Key 但未配置的引擎
      if (engine.requiresApiKey && !engine.config?.apiKey) {
        continue;
      }

      try {
        const translatedNonEmpty = await engine.translate(nonEmpty, from, to);

        // 检查是否有结果（非全部为原文降级返回）
        const hasValidResults = translatedNonEmpty.some(
          (t, i) => t && t !== nonEmpty[i]
        );

        if (hasValidResults) {
          // 将结果填回原始数组
          const results = texts.map(() => '');
          indices.forEach((originalIdx, i) => {
            results[originalIdx] = translatedNonEmpty[i] || '';
          });
          return results;
        }
      } catch (err) {
        console.warn(`[ScholarTranslate] Engine ${engineId} failed:`, err.message);
        lastError = err;
      }
    }

    // 所有引擎都失败，返回原文
    console.error(`[ScholarTranslate] All engines failed. Last error:`, lastError?.message);
    return texts.map(t => t); // 返回原文
  }
}

// 导出单例
const translatorManager = new TranslatorManager();

// 如果在 Service Worker 中运行
if (typeof self !== 'undefined') {
  self.translatorManager = translatorManager;
}
