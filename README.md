# FF Selection Translator / FF 划词翻译

一个轻量、无自建后端的 Chrome / Edge 划词翻译扩展。

在网页中选中文字，快速连续按两次物理 `F` 键，扩展会直接调用你配置的大模型 API，并在原文附近流式显示译文。

默认使用 **DeepSeek V4 Flash**，默认翻译为**简体中文**。API Key 仅保存在当前浏览器的扩展本地存储中。

## 功能

- 选中文字后按 `FF` 立即翻译
- 默认使用 `deepseek-v4-flash`，关闭思考模式以降低延迟
- 流式显示翻译结果
- 支持简体中文、繁体中文、英文、日文、韩文及自定义目标语言
- 支持自定义 OpenAI Chat Completions 兼容接口
- 支持复制译文、重试、`Esc` 关闭和点击外部关闭
- 兼容中文输入法开启时的物理 `F` 键
- 不需要账号系统，不经过项目作者的服务器

## 浏览器要求

- Google Chrome 88+
- Microsoft Edge 88+
- 其他支持 Manifest V3 的 Chromium 浏览器通常也可以使用

Firefox 暂未适配。

## 安装

当前版本尚未发布到 Chrome Web Store，需要通过开发者模式安装。

### 方法一：下载源码

1. 在 GitHub 仓库页面点击 **Code → Download ZIP**。
2. 解压下载的 ZIP 文件。
3. 打开 Chrome 的 `chrome://extensions`，或 Edge 的 `edge://extensions`。
4. 开启右上角的**开发者模式**。
5. 点击**加载已解压的扩展程序**。
6. 选择包含 `manifest.json` 的项目目录。

### 方法二：使用 Git

```bash
git clone https://github.com/wmin0807/ff-selection-translator.git
```

然后在浏览器扩展管理页加载克隆后的目录。

安装完成后，扩展会自动打开设置页。如果没有打开，可点击浏览器工具栏中的扩展图标进入设置。

## 配置 DeepSeek

1. 前往 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key。
2. 点击浏览器工具栏中的 **FF 划词翻译**。
3. 保持服务商为 **DeepSeek**。
4. 填入 API Key。
5. 模型名称保持默认的 `deepseek-v4-flash`。
6. 选择目标语言并点击**保存配置**。

DeepSeek 的接口和模型信息可参考：

- [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)
- [模型与价格](https://api-docs.deepseek.com/quick_start/pricing)

## 使用

1. 打开一个普通网页。
2. 用鼠标选中需要翻译的文字。
3. 在 700ms 内连续按两次物理 `F` 键。
4. 等待译文在选区附近出现。

浮层支持以下操作：

- 点击**复制译文**复制结果
- 点击**重试**重新请求
- 按 `Esc`、点击关闭按钮或点击浮层外区域关闭

如果网页在安装扩展之前已经打开，请先刷新一次页面。

## 使用自定义模型

设置页选择**自定义**后，需要填写：

- 完整的 Chat Completions API 地址，例如 `https://api.example.com/v1/chat/completions`
- API Key
- 模型名称
- 目标语言

自定义服务必须兼容 OpenAI Chat Completions 请求格式，并支持以下基本字段：

```json
{
  "model": "your-model-name",
  "messages": [
    { "role": "system", "content": "请将下面这段文字翻译成简体中文，只输出译文。" },
    { "role": "user", "content": "Text to translate" }
  ],
  "stream": true,
  "temperature": 0
}
```

保存自定义服务时，浏览器会请求访问相应 API 域名的权限。公网接口建议始终使用 HTTPS。

## 隐私与安全

- API Key 使用 `chrome.storage.local` 保存在当前浏览器配置文件中，不使用云同步。
- 本项目没有自建服务端，也没有统计或分析脚本。
- 只有在你选中文字并主动按下 `FF` 后，所选文字才会发送给配置的模型服务商。
- 请求不包含网页 URL、网页标题、浏览历史或历史翻译内容。
- 本地存储不等同于系统钥匙串或硬件加密。能访问浏览器用户目录或调试扩展的人仍可能读取 Key。
- 请勿在不可信电脑上保存 API Key，也不要翻译不应发送给第三方模型服务商的敏感内容。

扩展权限用途：

| 权限 | 用途 |
| --- | --- |
| `storage` | 在浏览器本地保存设置和 API Key |
| `scripting` | 安装或更新后向已经打开的普通网页补充注入脚本 |
| `https://api.deepseek.com/*` | 从扩展后台直接请求 DeepSeek API |
| 可选的 HTTP/HTTPS 域名权限 | 仅在使用自定义模型地址时按需申请 |

## 常见问题

### 选中文字并按 `FF` 没有反应

依次检查：

1. 刷新当前网页后重试。
2. 确认是在 700ms 内快速按下两次物理 `F` 键。
3. 确认当前页面不是 `chrome://`、`edge://`、Chrome Web Store 或其他浏览器保护页面。
4. 打开 `chrome://extensions`，确认扩展已经启用且没有显示错误。
5. 如果刚替换了源码，点击扩展卡片上的**重新加载**，然后再次刷新目标网页。

### 浮层提示“尚未配置 API Key”

点击扩展图标进入设置页，填写对应服务商的 API Key 并保存。

### 提示 401、余额不足或请求频率过高

这些错误来自模型服务商。请检查 Key 是否有效、账户余额和服务商的频率限制。

### 自定义 API 提示“无法连接”

请检查完整接口地址、网络状态以及保存配置时是否允许了相应域名权限。接口地址通常需要以 `/chat/completions` 结尾。

## 项目结构

```text
.
├── manifest.json       # Manifest V3 配置
├── background.js       # API 请求、SSE 流解析与配置读取
├── content.js          # 选区、FF 快捷键和翻译浮层
├── core.js             # 可测试的配置与请求构造逻辑
├── options.html        # 设置页
├── options.css
├── options.js
├── docs/               # 产品需求与技术设计
└── tests/              # 单元测试与浏览器测试页面
```

## 本地开发

项目没有运行时依赖。修改源码后，在扩展管理页点击**重新加载**并刷新测试网页即可。

需要 Node.js 18 或更高版本来运行检查：

```bash
npm test
npm run check
```

## 技术设计

完整需求、架构、请求格式和安全边界见 [docs/requirements-and-design.md](docs/requirements-and-design.md)。

## License

[MIT](LICENSE)
