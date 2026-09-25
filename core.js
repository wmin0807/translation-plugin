(function exposeCore(root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    provider: "deepseek",
    deepseekApiKey: "",
    deepseekModel: "deepseek-v4-flash",
    customApiUrl: "",
    customApiKey: "",
    customModel: "",
    targetLanguage: "简体中文",
  });

  function normalizeSettings(value = {}) {
    const provider = value.provider === "custom" ? "custom" : "deepseek";
    return {
      provider,
      deepseekApiKey: String(value.deepseekApiKey || "").trim(),
      deepseekModel:
        String(value.deepseekModel || "").trim() || DEFAULT_SETTINGS.deepseekModel,
      customApiUrl: String(value.customApiUrl || "").trim(),
      customApiKey: String(value.customApiKey || "").trim(),
      customModel: String(value.customModel || "").trim(),
      targetLanguage:
        String(value.targetLanguage || "").trim() || DEFAULT_SETTINGS.targetLanguage,
    };
  }

  function getProviderConfig(value = {}) {
    const settings = normalizeSettings(value);
    if (settings.provider === "deepseek") {
      return {
        provider: "deepseek",
        apiUrl: "https://api.deepseek.com/chat/completions",
        apiKey: settings.deepseekApiKey,
        model: settings.deepseekModel,
        targetLanguage: settings.targetLanguage,
      };
    }

    return {
      provider: "custom",
      apiUrl: settings.customApiUrl,
      apiKey: settings.customApiKey,
      model: settings.customModel,
      targetLanguage: settings.targetLanguage,
    };
  }

  function validateProviderConfig(config) {
    if (!config.apiKey) {
      throw new Error("尚未配置 API Key");
    }
    if (!config.model) {
      throw new Error("尚未配置模型名称");
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(config.apiUrl);
    } catch {
      throw new Error("API 地址格式不正确");
    }

    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      throw new Error("API 地址必须使用 HTTP 或 HTTPS");
    }
  }

  function createSystemPrompt(targetLanguage) {
    return `请将下面这段文字翻译成${targetLanguage}，只输出译文。`;
  }

  function getEnglishWord(sourceText) {
    const word = String(sourceText || "").trim();
    return /^[a-zA-Z]+(?:['’\-][a-zA-Z]+)*$/.test(word) ? word : "";
  }

  function createWordPrompt(targetLanguage) {
    return `用户输入了一个英文单词。请先给出该单词的英式和美式国际音标（IPA），再用${targetLanguage}给出词性和常用释义。
只输出纯文本，格式如下：
英 /音标/ · 美 /音标/
词性：释义
有多个常见读音时，分别标明对应词性或释义。不要编造音标；无法确定时写“音标暂不可用”。如果输入不是有效英文单词，明确说明无法识别，不要编造释义。不要输出 Markdown、例句或开场白。`;
  }

  function createRequestBody(config, sourceText, stream = true, inputMode = false) {
    const body = {
      model: config.model,
      messages: [
        {
          role: "system",
          content: inputMode && getEnglishWord(sourceText)
            ? createWordPrompt(config.targetLanguage)
            : createSystemPrompt(config.targetLanguage),
        },
        { role: "user", content: sourceText },
      ],
      stream,
      temperature: 0,
    };

    if (config.provider === "deepseek") {
      body.thinking = { type: "disabled" };
    }

    return body;
  }

  function getCompletionText(payload) {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((part) => part && (part.type === "text" || typeof part.text === "string"))
        .map((part) => part.text || "")
        .join("");
    }
    return "";
  }

  const core = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    getProviderConfig,
    validateProviderConfig,
    createSystemPrompt,
    getEnglishWord,
    createRequestBody,
    getCompletionText,
  };

  root.FFTranslatorCore = core;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = core;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
