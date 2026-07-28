/**
 * ScholarTranslate — 翻译缓存管理
 * 双层缓存：内存 LRU + chrome.storage.local 持久化
 */

class TranslationCache {
  constructor(options = {}) {
    this.maxMemoryEntries = options.maxMemoryEntries || 500;
    this.defaultTTL = options.defaultTTL || 30 * 24 * 60 * 60 * 1000; // 30 天
    this.storagePrefix = 'st_cache_';

    // 内存 LRU 缓存
    this.memoryCache = new Map();
    this.accessOrder = [];
  }

  // ============================================================
  // 缓存 Key 生成
  // ============================================================
  /**
   * 生成缓存键
   * @param {string} text - 原文
   * @param {string} from - 源语言
   * @param {string} to - 目标语言
   * @param {string} engineId - 翻译引擎 ID
   * @returns {string}
   */
  generateKey(text, from, to, engineId) {
    const normalized = text.trim().replace(/\s+/g, ' ').substring(0, 500);
    const hash = this._djb2Hash(normalized + '|' + from + '|' + to + '|' + engineId);
    return `${this.storagePrefix}${hash}`;
  }

  _djb2Hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash).toString(36);
  }

  // ============================================================
  // 内存缓存操作
  // ============================================================
  _updateAccessOrder(key) {
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(key);
  }

  _evictMemoryIfNeeded() {
    while (this.memoryCache.size > this.maxMemoryEntries) {
      const oldest = this.accessOrder.shift();
      if (oldest) this.memoryCache.delete(oldest);
    }
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * 查询缓存（先内存，再持久化存储）
   */
  async get(text, from, to, engineId) {
    const key = this.generateKey(text, from, to, engineId);

    // 1. 查内存缓存
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key);
      if (Date.now() - entry.timestamp < this.defaultTTL) {
        this._updateAccessOrder(key);
        return entry.translatedText;
      } else {
        // 过期，删除
        this.memoryCache.delete(key);
      }
    }

    // 2. 查持久化存储
    try {
      const result = await chrome.storage.local.get(key);
      if (result[key]) {
        const entry = result[key];
        if (Date.now() - entry.timestamp < this.defaultTTL) {
          // 写回内存缓存
          this.memoryCache.set(key, entry);
          this._updateAccessOrder(key);
          this._evictMemoryIfNeeded();
          return entry.translatedText;
        } else {
          // 过期，删除持久化条目
          await chrome.storage.local.remove(key);
        }
      }
    } catch (err) {
      console.warn('[ScholarTranslate] Cache storage read failed:', err.message);
    }

    return null; // 未命中
  }

  /**
   * 写入缓存
   */
  async set(text, from, to, engineId, translatedText) {
    const key = this.generateKey(text, from, to, engineId);
    const entry = {
      sourceText: text.substring(0, 500),
      translatedText: translatedText,
      from: from,
      to: to,
      engineId: engineId,
      timestamp: Date.now()
    };

    // 写内存缓存
    this.memoryCache.set(key, entry);
    this._updateAccessOrder(key);
    this._evictMemoryIfNeeded();

    // 写持久化存储
    try {
      await chrome.storage.local.set({ [key]: entry });
    } catch (err) {
      // 存储配额满了，清理旧条目后重试
      if (err.message && err.message.includes('quota')) {
        console.warn('[ScholarTranslate] Storage quota exceeded, running cleanup...');
        await this._cleanupStorage();
        try {
          await chrome.storage.local.set({ [key]: entry });
        } catch (retryErr) {
          console.warn('[ScholarTranslate] Cache storage write failed after cleanup:', retryErr.message);
        }
      } else {
        console.warn('[ScholarTranslate] Cache storage write failed:', err.message);
      }
    }
  }

  /**
   * 批量查询缓存
   * @returns {Map<string, string>} key -> translatedText 的映射（只返回命中的）
   */
  async getBatch(items) {
    // items: [{text, from, to, engineId}]
    const result = new Map();
    for (const item of items) {
      const translated = await this.get(item.text, item.from, item.to, item.engineId);
      if (translated) {
        result.set(item.text, translated);
      }
    }
    return result;
  }

  /**
   * 清除所有缓存
   */
  async clearAll() {
    this.memoryCache.clear();
    this.accessOrder = [];

    try {
      const allKeys = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(allKeys).filter(k => k.startsWith(this.storagePrefix));
      if (cacheKeys.length > 0) {
        await chrome.storage.local.remove(cacheKeys);
      }
      console.log(`[ScholarTranslate] Cleared ${cacheKeys.length} cached entries`);
    } catch (err) {
      console.warn('[ScholarTranslate] Cache clear failed:', err.message);
    }
  }

  /**
   * 获取缓存统计
   */
  async getStats() {
    let persistedCount = 0;
    try {
      const allKeys = await chrome.storage.local.get(null);
      persistedCount = Object.keys(allKeys).filter(k => k.startsWith(this.storagePrefix)).length;
    } catch (e) { /* ignore */ }

    return {
      memoryEntries: this.memoryCache.size,
      memoryLimit: this.maxMemoryEntries,
      persistedEntries: persistedCount,
      ttlDays: Math.round(this.defaultTTL / (24 * 60 * 60 * 1000))
    };
  }

  /**
   * 清理过期的持久化条目
   */
  async _cleanupStorage() {
    try {
      const allData = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(allData).filter(k => k.startsWith(this.storagePrefix));

      const now = Date.now();
      const toRemove = [];

      for (const key of cacheKeys) {
        const entry = allData[key];
        if (now - entry.timestamp > this.defaultTTL) {
          toRemove.push(key);
        }
      }

      // 如果过期清理不够，按时间排序删除最旧的 30%
      if (toRemove.length < cacheKeys.length * 0.3) {
        const sorted = cacheKeys
          .filter(k => !toRemove.includes(k))
          .sort((a, b) => (allData[a]?.timestamp || 0) - (allData[b]?.timestamp || 0));
        const additionalCount = Math.ceil(cacheKeys.length * 0.3) - toRemove.length;
        toRemove.push(...sorted.slice(0, Math.max(0, additionalCount)));
      }

      if (toRemove.length > 0) {
        await chrome.storage.local.remove(toRemove);
        console.log(`[ScholarTranslate] Cleaned up ${toRemove.length} cached entries`);
      }
    } catch (err) {
      console.warn('[ScholarTranslate] Storage cleanup failed:', err.message);
    }
  }
}

// 导出单例
const translationCache = new TranslationCache();

if (typeof self !== 'undefined') {
  self.translationCache = translationCache;
}
