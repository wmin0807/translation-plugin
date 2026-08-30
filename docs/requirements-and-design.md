# FF 划词翻译插件：需求与实现方案

## 1. 产品目标

做一个轻量的 Chrome / Edge 浏览器扩展：用户在网页中选中一段文字后，连续按两次 `F`，扩展立即调用大模型翻译，并在选中文字下方显示一个结果浮层。

默认使用 DeepSeek V4 Flash。请求由浏览器扩展直接发送给 DeepSeek，不建设、不经过任何业务服务端。

## 2. 已确认需求

### 核心流程

1. 用户在网页中选中文字。
2. 用户在 700ms 内连续按两次物理 `F` 键（不区分大小写，兼容中文输入法状态）。
3. 扩展读取本地配置并直接请求模型 API。
4. 选中文字下方出现翻译浮层，并以流式方式展示译文。
5. 点击浮层外任意位置、按 `Esc` 或点击关闭按钮，浮层消失。

### 模型配置

- 默认服务商：DeepSeek。
- 默认 API 地址：`https://api.deepseek.com/chat/completions`。
- 默认模型：`deepseek-v4-flash`。
- 默认关闭思考模式，优先降低首字延迟。
- API Key 使用 `chrome.storage.local` 保存，不同步到云端，不发送到任何自建服务。
- 支持“自定义（OpenAI 兼容）”服务商，用户可填写完整 API 地址、API Key 和模型名称。
- 自定义 API 地址所需的浏览器网络权限，仅在用户保存该配置时申请。

### 翻译行为

- 默认目标语言：简体中文。
- 用户可在配置页切换目标语言或填写自定义语言。
- 系统提示词保持最小化：`请将下面这段文字翻译成{目标语言}，只输出译文。`
- 不携带网页标题、URL、历史消息或其他上下文。
- 仅将用户主动选中并触发快捷键的文字发送给所选模型服务商。

> 原始描述中同时出现了“翻译成中文”和“翻译为英文”。本版本以更明确、较早出现的“翻译成中文”为默认值，同时提供目标语言配置，因此也可切换为英文。

## 3. 交互细节

- 无有效选区时，`FF` 不触发插件。
- 在输入框或文本域中选中文字时，扩展会拦截这两个 `F`，避免覆盖已选内容。
- 浮层包含加载态、流式译文、复制、重试和关闭操作。
- 新的翻译请求会替换当前浮层，并取消上一个仍在进行的请求。
- 错误信息使用用户可理解的提示，例如“尚未配置 API Key”“接口返回 401”。
- 选区靠近屏幕边缘时，浮层自动调整到可见范围。

## 4. 技术方案

### 架构

```text
网页选区 + FF
      │
      ▼
Content Script ── Port 消息 ──► Manifest V3 Service Worker
      │                                  │
      │                                  ├─ 读取 chrome.storage.local
      │                                  └─ 直接请求 DeepSeek / 自定义 API
      │                                              │
      ◄────────────── 流式增量译文 ──────────────────┘
      │
      ▼
Shadow DOM 翻译浮层
```

### 模块职责

- `content.js`：读取选区、识别 `FF`、管理浮层、接收流式结果。
- `background.js`：读取配置、校验请求、调用 OpenAI Chat Completions 兼容接口、解析 SSE。
- `options.html / options.js / options.css`：服务商、Key、模型和目标语言配置。
- `manifest.json`：声明 MV3、网页注入、本地存储和 DeepSeek 域名权限。
- 安装或更新时会尝试向已打开的普通网页补充注入内容脚本；受 Chrome 保护的页面仍需排除。

### 请求格式

```json
{
  "model": "deepseek-v4-flash",
  "messages": [
    {
      "role": "system",
      "content": "请将下面这段文字翻译成简体中文，只输出译文。"
    },
    {
      "role": "user",
      "content": "用户选中的原文"
    }
  ],
  "stream": true,
  "temperature": 0,
  "thinking": { "type": "disabled" }
}
```

`thinking` 仅随 DeepSeek 请求发送，避免影响其他 OpenAI 兼容服务。

## 5. 安全与隐私边界

- “仅保存在本地”表示 Key 存储在当前浏览器配置文件的扩展本地存储中，不使用 `storage.sync`。
- 本地存储并不等同于系统钥匙串或硬件级加密；能访问该浏览器用户目录或调试该扩展的人，仍可能读取 Key。
- 扩展无法避免模型服务商接收到主动提交的选中文字；用户应遵守对应服务商的隐私条款。
- 自定义 API 可使用 HTTP，但只建议在可信的本机/内网环境使用；公网 API 应使用 HTTPS。

## 6. 范围与限制

- 首版支持 Chromium 浏览器（Chrome、Edge 等），不包含 Firefox 打包适配。
- 浏览器内部页面（如 `chrome://`）、扩展商店等禁止内容脚本运行的页面无法使用。
- 首版不包含翻译历史、账号系统、自建后端、OCR、文档翻译和自动语言检测 UI；语言判断由模型完成。

## 7. 验收标准

- 未配置 Key 时，触发翻译能得到明确引导，并可一键打开设置。
- 配置 DeepSeek Key 后，选中文字并按 `FF` 能显示简体中文译文。
- 点击外部、按 `Esc`、点击关闭按钮均可关闭浮层。
- Key 只写入 `chrome.storage.local`。
- 自定义 OpenAI 兼容地址、Key、模型能够保存并被请求使用。
- 扩展代码不依赖业务服务端或第三方统计脚本。

## 8. 官方接口依据

- DeepSeek Chat Completions：<https://api-docs.deepseek.com/api/create-chat-completion/>
- DeepSeek 模型与价格：<https://api-docs.deepseek.com/quick_start/pricing>
