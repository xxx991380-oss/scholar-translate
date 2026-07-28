<p align="center">
  <img src="icons/icon128.png" width="96" alt="ScholarTranslate">
</p>

<h1 align="center">ScholarTranslate</h1>

<p align="center">
  <strong>Google Scholar 学术论文双语翻译助手</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?logo=googlechrome" alt="Manifest V3">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Browser-Edge%20%7C%20Chrome-brightgreen" alt="Browser Support">
  <img src="https://img.shields.io/badge/Privacy-First-important" alt="Privacy">
</p>

<p align="center">
  <a href="#features">✨ 功能</a> •
  <a href="#installation">📦 安装</a> •
  <a href="#usage">🎯 使用</a> •
  <a href="#architecture">🏗️ 架构</a> •
  <a href="#translation-engines">🌐 翻译引擎</a> •
  <a href="#contributing">🤝 贡献</a>
</p>

---

## ✨ 功能 / Features

- 🔤 **标题 & 摘要翻译** — Google Scholar 搜索结果页自动翻译论文标题和摘要
- ✋ **划词翻译** — 选中任意文字弹出翻译按钮，点击即译，不翻译全文
- 📄 **PDF 手动翻译** — 打开 PDF 论文，右侧面板手动触发当前页/全文翻译
- 📖 **双语对照显示** — 保留原文同时显示译文，三种模式一键切换（双语/仅译文/仅原文）
- 🆓 **免费即用** — 默认使用 Google 翻译引擎，零配置开箱即用
- 🤖 **AI 引擎可选** — 支持 DeepSeek、OpenAI GPT，学术术语翻译更精准
- 🔍 **动态内容监控** — 搜索、翻页、无限滚动等动态加载内容自动翻译
- 🌙 **暗色模式适配** — 自动跟随系统主题
- 🔒 **隐私优先** — 全部数据本地存储，无追踪、无遥测、无中间服务器
- ⚡ **双层缓存** — 内存 LRU + chrome.storage 持久化，翻译秒出

---

## 📦 安装 / Installation

### 方式一：开发者模式加载（推荐）

1. 下载本项目源码
   ```bash
   git clone https://github.com/xxx991380-oss/scholar-translate.git
   ```
2. 打开 Edge/Chrome 浏览器
3. 访问 `edge://extensions/` 或 `chrome://extensions/`
4. 打开右上角 **「开发人员模式」** / **「Developer mode」**
5. 点击 **「加载解压缩的扩展」** / **「Load unpacked」**
6. 选择 `scholar-translate` 文件夹
7. ⚠️ **重要**：点击扩展详情 → 开启 **「允许访问文件 URL」** / **「Allow access to file URLs」**（这样才能翻译本地 PDF）
8. 🎉 完成！打开 [Google Scholar](https://scholar.google.com) 试试吧

### 方式二：Edge 加载项 / Chrome 应用商店（即将上线）

> 🚧 正在准备商店上架，敬请期待。

---

## 🎯 使用 / Usage

### Google Scholar 搜索页

1. 访问 [scholar.google.com](https://scholar.google.com) 搜索论文
2. 搜索结果会自动显示中文翻译（在摘要下方）
3. 点击右下角蓝色 **「译」** 按钮切换显示模式

### PDF 论文阅读

1. 在 Google Scholar 中点击论文打开 PDF（或打开本地 PDF 文件）
2. 页面右侧边缘出现 **「翻译」** 切换按钮，点击打开翻译面板
3. 点击 **「翻译当前页」** 翻译正在查看的页面
4. 点击 **「翻译全文」** 翻译整篇论文
5. 💡 **推荐**：使用下面划词翻译，更快更方便

### 划词翻译（任意页面）

1. 在 PDF 或网页中 **选中想要翻译的文字**
2. 选区旁自动弹出蓝色 **「译」** 按钮
3. 点击按钮 → 弹出翻译弹窗（原文 + 译文）
4. 点击 📋 图标可复制译文
5. 点击 ✕ 或按 ESC 关闭弹窗

### 弹出面板

点击浏览器工具栏的扩展图标：
- 开关翻译
- 切换显示模式（双语对照 / 仅译文 / 仅原文）
- 选择翻译引擎
- 查看缓存统计
- 清除缓存

### 详细设置

右键扩展图标 → 选项，或点击弹出面板中的 ⚙️ 按钮：
- 配置 DeepSeek / OpenAI API Key
- 自定义源语言和目标语言
- 调整缓存策略
- 设置默认显示模式

---

## 🏗️ 架构 / Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Popup UI                          │
│  (翻译开关、语言选择、引擎切换、缓存管理)              │
└─────────────────────┬───────────────────────────────┘
                      │ chrome.runtime.sendMessage
┌─────────────────────▼───────────────────────────────┐
│            Background Service Worker                │
│  - 翻译请求路由 & 负载均衡                            │
│  - 多翻译引擎适配（GTX / DeepLX / DeepSeek / OpenAI） │
│  - 翻译缓存管理（LRU + chrome.storage.local）         │
│  - 用户设置读写                                       │
└─────────────────────┬───────────────────────────────┘
                      │ chrome.runtime.sendMessage
┌─────────────────────▼───────────────────────────────┐
│              Content Scripts                        │
│                                                     │
│  scholar-content.js    pdf-content.js               │
│  (Google Scholar 页)   (PDF 阅读页面)                │
│                                                     │
│  - TreeWalker 文本提取                               │
│  - 翻译结果双语注入                                  │
│  - MutationObserver 动态内容监控                      │
│  - Shadow DOM 翻译控制浮层                            │
└─────────────────────────────────────────────────────┘
```

### 关键设计决策

| 决策 | 理由 |
|------|------|
| **Manifest V3** | 最新的 Chrome 扩展标准，Edge 完全兼容 |
| **Service Worker + 消息传递** | 解耦翻译请求与页面 DOM 操作 |
| **TreeWalker 提取文本** | 不破坏 DOM 结构和框架（React/Vue）的事件绑定 |
| **追加翻译而非替换** | 保留原文结构，支持双语对照和回退 |
| **Shadow DOM UI** | 隔离扩展 UI 样式，不受页面 CSS 污染 |
| **双层缓存** | 内存缓存秒级响应 + chrome.storage 跨页面持久化 |

### 项目结构

```
scholar-translate/
├── manifest.json                   # MV3 manifest
├── icons/                          # 扩展图标 (16/48/128)
├── lib/
│   ├── translator.js               # 翻译引擎抽象层
│   ├── cache.js                    # LRU 缓存实现
│   └── dom-utils.js               # DOM 操作工具集
├── background/
│   └── service-worker.js           # 后台服务核心调度
├── content/
│   ├── scholar-content.js          # Scholar 页面内容脚本
│   ├── pdf-content.js              # PDF 页面内容脚本
│   ├── pdf-bridge.js               # MAIN world 注入桥接
│   └── styles.css                  # 双语翻译样式
├── popup/
│   ├── popup.html                  # 弹出控制面板
│   └── popup.js
├── options/
│   ├── options.html                # 详细设置页
│   └── options.js
└── _locales/zh_CN/messages.json    # 国际化
```

---

## 🌐 翻译引擎 / Translation Engines

| 引擎 | 类型 | 需要 API Key | 质量 | 说明 |
|------|------|:---:|------|------|
| **Google GTX** | 通用翻译 | ❌ | ★★★☆☆ | 默认引擎，即装即用 |
| **DeepLX** | DeepL 代理 | ❌ | ★★★★☆ | 社区维护的免费 DeepL 端点 |
| **DeepSeek** | LLM | ✅ | ★★★★★ | 学术术语翻译质量最高，有免费额度 |
| **OpenAI GPT** | LLM | ✅ | ★★★★★ | 支持 GPT-4o-mini/GPT-4o/GPT-4.1 |

引擎支持自动降级：当一个引擎不可用时，自动尝试下一个可用引擎。

---

## 📊 Google Scholar DOM 参考

| 目标 | 选择器 | 说明 |
|------|--------|------|
| 结果容器 | `div#gs_res_ccl_mid` | 所有搜索结果的容器 |
| 单条结果 | `div.gs_r.gs_or` | 每条论文结果 |
| 论文标题 | `.gs_rt a` | 标题链接 |
| 作者/出处 | `.gs_a` | 作者、期刊、年份 |
| 摘要 | `.gs_rs` | 论文摘要 |

---

## 🤝 贡献 / Contributing

欢迎贡献！请遵循以下规则：

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

### 开发指南

- 使用纯 JavaScript（无构建工具依赖），直接在浏览器中加载调试
- 所有 DOM 操作通过 `lib/dom-utils.js` 中的工具函数完成
- 新增翻译引擎继承 `TranslatorEngine` 基类并注册到 `TranslatorManager`
- 代码风格：保持与现有代码一致（2 空格缩进、JSDoc 注释）

### 已知增强方向

- [ ] 添加 PDF.js 完整集成（目前使用 DOM textLayer 提取）
- [ ] 发布到 Edge 加载项 / Chrome 应用商店
- [ ] 添加学术术语库自定义功能
- [ ] 支持更多学术搜索引擎（Semantic Scholar、PubMed、arXiv）
- [ ] EPUB 电子书翻译支持
- [ ] 单词级 hover 翻译

---

## 📄 许可证 / License

[MIT License](LICENSE) © 2026

---

## 🔒 隐私 / Privacy

- ✅ **无遥测**：不收集任何使用数据
- ✅ **无追踪**：不包含任何分析或追踪代码
- ✅ **本地优先**：API Key 和翻译缓存仅存储在本地浏览器
- ✅ **直连翻译**：翻译请求直接发送至翻译 API，无中间代理
- ✅ **最小权限**：仅请求必要的 `storage` 权限和已知域名访问

---

<p align="center">
  <sub>用 ❤️ 和 JavaScript 构建 | Built with ❤️ and JavaScript</sub>
</p>
