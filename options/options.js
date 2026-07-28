/**
 * ScholarTranslate — 设置页面逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 加载当前设置
  let settings = await loadSettings();

  // ============================================================
  // UI 元素
  // ============================================================
  const enabledToggle = document.getElementById('enabled-toggle');
  const engineSelect = document.getElementById('engine-select');
  const sourceLangSelect = document.getElementById('source-lang');
  const targetLangSelect = document.getElementById('target-lang');
  const displayModeSelect = document.getElementById('display-mode');
  const deepseekApiKey = document.getElementById('deepseek-api-key');
  const openaiApiKey = document.getElementById('openai-api-key');
  const openaiBaseUrl = document.getElementById('openai-base-url');
  const openaiModel = document.getElementById('openai-model');
  const saveBtn = document.getElementById('save-btn');
  const resetBtn = document.getElementById('reset-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const refreshStatsBtn = document.getElementById('refresh-stats-btn');

  // ============================================================
  // 初始化表单
  // ============================================================
  function formFromSettings(s) {
    enabledToggle.checked = s.enabled !== false;
    engineSelect.value = s.preferredEngine || 'google-gtx';
    sourceLangSelect.value = s.sourceLang || 'en';
    targetLangSelect.value = s.targetLang || 'zh-CN';
    displayModeSelect.value = s.displayMode || 'bilingual';
    deepseekApiKey.value = s.engines?.deepseek?.apiKey || '';
    openaiApiKey.value = s.engines?.openai?.apiKey || '';
    openaiBaseUrl.value = s.engines?.openai?.baseUrl || 'https://api.openai.com/v1';
    openaiModel.value = s.engines?.openai?.model || 'gpt-4o-mini';
  }

  formFromSettings(settings);

  // ============================================================
  // 保存
  // ============================================================
  saveBtn.addEventListener('click', async () => {
    const updatedSettings = {
      enabled: enabledToggle.checked,
      preferredEngine: engineSelect.value,
      sourceLang: sourceLangSelect.value,
      targetLang: targetLangSelect.value,
      displayMode: displayModeSelect.value,
      engines: {
        deepseek: {
          apiKey: deepseekApiKey.value.trim()
        },
        openai: {
          apiKey: openaiApiKey.value.trim(),
          baseUrl: openaiBaseUrl.value.trim() || 'https://api.openai.com/v1',
          model: openaiModel.value
        }
      }
    };

    await saveSettings(updatedSettings);
    settings = updatedSettings;
    showToast('✅ 设置已保存', 'success');
  });

  // ============================================================
  // 恢复默认
  // ============================================================
  resetBtn.addEventListener('click', async () => {
    if (!confirm('确定要恢复所有设置为默认值吗？这将清除 API Key 配置。')) return;

    const defaults = {
      enabled: true,
      preferredEngine: 'google-gtx',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      displayMode: 'bilingual',
      engines: {
        deepseek: { apiKey: '' },
        openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
      }
    };

    await saveSettings(defaults);
    settings = defaults;
    formFromSettings(defaults);
    showToast('✅ 已恢复默认设置', 'success');
  });

  // ============================================================
  // 缓存管理
  // ============================================================
  clearCacheBtn.addEventListener('click', async () => {
    if (!confirm('确定要清除所有翻译缓存吗？此操作不可撤销。')) return;
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    showToast('✅ 缓存已清除', 'success');
    updateCacheStats();
  });

  refreshStatsBtn.addEventListener('click', updateCacheStats);

  async function updateCacheStats() {
    const el = document.getElementById('cache-stats');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CACHE_STATS' });
      if (response.success) {
        const { memoryEntries, memoryLimit, persistedEntries, ttlDays } = response.stats;
        el.innerHTML = `
          内存缓存：<span>${memoryEntries}</span> / ${memoryLimit} 条
          · 持久化缓存：<span>${persistedEntries}</span> 条
          · 过期时间：<span>${ttlDays}</span> 天
        `;
      }
    } catch (e) {
      el.textContent = '获取缓存状态失败';
    }
  }

  updateCacheStats();

  // ============================================================
  // Toast 提示
  // ============================================================
  function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
});

// ============================================================
// 工具函数
// ============================================================
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    return response.settings || {};
  } catch (e) {
    return {};
  }
}

async function saveSettings(settings) {
  await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    payload: { settings }
  });
}
