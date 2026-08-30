(function initializeOptions() {
  "use strict";

  const { DEFAULT_SETTINGS, normalizeSettings, createSystemPrompt } = FFTranslatorCore;
  const form = document.querySelector("#settings-form");
  const deepseekFields = document.querySelector("#deepseek-fields");
  const customFields = document.querySelector("#custom-fields");
  const targetLanguageSelect = document.querySelector("#target-language-select");
  const customLanguageField = document.querySelector("#custom-language-field");
  const customLanguageInput = document.querySelector("#custom-language");
  const promptPreview = document.querySelector("#prompt-preview");
  const status = document.querySelector("#status");
  const saveButton = document.querySelector("#save-button");

  loadSettings().catch((error) => showStatus(error.message, true));

  form.addEventListener("change", (event) => {
    if (event.target.name === "provider") updateProviderVisibility();
    if (event.target === targetLanguageSelect) updateLanguageVisibility();
    updatePromptPreview();
  });
  customLanguageInput.addEventListener("input", updatePromptPreview);
  form.addEventListener("submit", saveSettings);

  document.querySelectorAll(".reveal").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.textContent = reveal ? "隐藏" : "显示";
    });
  });

  async function loadSettings() {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    const settings = normalizeSettings(stored);

    const providerRadio = form.querySelector(`input[name="provider"][value="${settings.provider}"]`);
    providerRadio.checked = true;
    document.querySelector("#deepseek-api-key").value = settings.deepseekApiKey;
    document.querySelector("#deepseek-model").value = settings.deepseekModel;
    document.querySelector("#custom-api-url").value = settings.customApiUrl;
    document.querySelector("#custom-api-key").value = settings.customApiKey;
    document.querySelector("#custom-model").value = settings.customModel;

    const knownLanguage = Array.from(targetLanguageSelect.options).some(
      (option) => option.value !== "custom" && option.value === settings.targetLanguage,
    );
    targetLanguageSelect.value = knownLanguage ? settings.targetLanguage : "custom";
    customLanguageInput.value = knownLanguage ? "" : settings.targetLanguage;

    updateProviderVisibility();
    updateLanguageVisibility();
    updatePromptPreview();
  }

  async function saveSettings(event) {
    event.preventDefault();
    showStatus("");

    const provider = form.elements.provider.value;
    const targetLanguage = getTargetLanguage();
    const customApiUrl = document.querySelector("#custom-api-url").value.trim();
    const values = normalizeSettings({
      provider,
      deepseekApiKey: document.querySelector("#deepseek-api-key").value,
      deepseekModel: document.querySelector("#deepseek-model").value,
      customApiUrl,
      customApiKey: document.querySelector("#custom-api-key").value,
      customModel: document.querySelector("#custom-model").value,
      targetLanguage,
    });

    try {
      validateForm(values);
      saveButton.disabled = true;
      saveButton.textContent = "保存中…";

      if (provider === "custom") {
        const permissionPattern = toOriginPattern(customApiUrl);
        const granted = await requestOriginPermission(permissionPattern);
        if (!granted) throw new Error("未获得自定义 API 域名的访问权限，配置尚未保存");
      }

      await chrome.storage.local.set(values);
      showStatus("已保存。Key 仅存储在当前浏览器本地。", false);
    } catch (error) {
      showStatus(error.message || String(error), true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "保存配置";
    }
  }

  function validateForm(settings) {
    if (!settings.targetLanguage) throw new Error("请填写目标语言");
    if (settings.provider === "deepseek") {
      if (!settings.deepseekApiKey) throw new Error("请填写 DeepSeek API Key");
      if (!settings.deepseekModel) throw new Error("请填写 DeepSeek 模型名称");
      return;
    }

    if (!settings.customApiUrl) throw new Error("请填写自定义 API 地址");
    if (!settings.customApiKey) throw new Error("请填写自定义 API Key");
    if (!settings.customModel) throw new Error("请填写自定义模型名称");
    toOriginPattern(settings.customApiUrl);
  }

  function toOriginPattern(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("自定义 API 地址格式不正确");
    }
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error("自定义 API 地址必须使用 HTTP 或 HTTPS");
    }
    return `${url.protocol}//${url.host}/*`;
  }

  function requestOriginPermission(origin) {
    return new Promise((resolve, reject) => {
      chrome.permissions.request({ origins: [origin] }, (granted) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(granted);
      });
    });
  }

  function updateProviderVisibility() {
    const custom = form.elements.provider.value === "custom";
    deepseekFields.hidden = custom;
    customFields.hidden = !custom;
  }

  function updateLanguageVisibility() {
    customLanguageField.hidden = targetLanguageSelect.value !== "custom";
  }

  function getTargetLanguage() {
    return targetLanguageSelect.value === "custom"
      ? customLanguageInput.value.trim()
      : targetLanguageSelect.value;
  }

  function updatePromptPreview() {
    promptPreview.textContent = createSystemPrompt(getTargetLanguage() || "目标语言");
  }

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }
})();
