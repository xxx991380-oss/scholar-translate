/**
 * ScholarTranslate — Popup 控制面板逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 加载设置
  const settings = await loadSettings();

  // ============================================================
  // 绑定 UI 元素
  // ============================================================
  const enabledToggle = document.getElementById('enabled-toggle');
  const displayModeSelect = document.getElementById('display-mode');
  const engineSelect = document.getElementById('engine-select');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const cacheStats = document.getElementById('cache-stats');

  // ============================================================
  // 初始化 UI 状态
  // ============================================================
  enabledToggle.checked = settings.enabled !== false;
  displayModeSelect.value = settings.displayMode || 'bilingual';
  engineSelect.value = settings.preferredEngine || 'google-gtx';

  // ============================================================
  // 事件处理
  // ============================================================

  // 翻译开关
  enabledToggle.addEventListener('change', async () => {
    settings.enabled = enabledToggle.checked;
    await saveSettings(settings);

    // 通知当前标签页刷新翻译状态
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('scholar.google')) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'TOGGLE_TRANSLATION',
        payload: { enabled: settings.enabled }
      }).catch(() => {}); // 忽略非 Scholar 页面的错误
    }
  });

  // 显示模式
  displayModeSelect.addEventListener('change', async () => {
    settings.displayMode = displayModeSelect.value;
    await saveSettings(settings);

    // 通知标签页切换模式
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SET_DISPLAY_MODE',
        payload: { mode: settings.displayMode }
      }).catch(() => {});
    }
  });

  // 翻译引擎
  engineSelect.addEventListener('change', async () => {
    settings.preferredEngine = engineSelect.value;
    await saveSettings(settings);
  });

  // 清除缓存
  clearCacheBtn.addEventListener('click', async () => {
    if (confirm('确定要清除所有翻译缓存吗？')) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
      clearCacheBtn.textContent = '✅ 缓存已清除';
      setTimeout(() => {
        clearCacheBtn.textContent = '🗑️ 清除缓存';
      }, 2000);
      updateCacheStats();
    }
  });

  // 打开设置页
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ============================================================
  // 缓存统计
  // ============================================================
  async function updateCacheStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CACHE_STATS' });
      if (response.success) {
        const { memoryEntries, persistedEntries } = response.stats;
        cacheStats.innerHTML = `
          缓存：<span>${memoryEntries}</span> 条（内存）
          · <span>${persistedEntries}</span> 条（持久化）
        `;
      }
    } catch (e) {
      cacheStats.textContent = '缓存状态获取失败';
    }
  }

  updateCacheStats();
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
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: { settings }
    });
  } catch (e) {
    console.warn('[ScholarTranslate] Save settings from popup failed:', e);
  }
}
