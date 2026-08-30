"use strict";

importScripts("core.js");

const {
  DEFAULT_SETTINGS,
  normalizeSettings,
  getProviderConfig,
  validateProviderConfig,
  createRequestBody,
  getCompletionText,
} = FFTranslatorCore;

chrome.runtime.onInstalled.addListener(async (details) => {
  const saved = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...saved });

  if (details.reason === "install") {
    await chrome.runtime.openOptionsPage();
  }

  await injectIntoExistingTabs();
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ff-translator") return;

  let activeController = null;
  let disconnected = false;

  const send = (message) => {
    if (!disconnected) port.postMessage(message);
  };

  port.onDisconnect.addListener(() => {
    disconnected = true;
    activeController?.abort();
  });

  port.onMessage.addListener((message) => {
    if (message?.type === "cancel") {
      activeController?.abort();
      activeController = null;
      return;
    }

    if (message?.type === "open-options") {
      chrome.runtime.openOptionsPage();
      return;
    }

    if (message?.type !== "translate") return;

    activeController?.abort();
    activeController = new AbortController();
    translate(message, activeController.signal, send).catch((error) => {
      if (error?.name === "AbortError") return;
      send({
        type: "error",
        requestId: message.requestId,
        message: toFriendlyError(error),
        configurationRequired: /API Key|模型名称|API 地址/.test(error?.message || ""),
      });
    });
  });
});

async function translate(message, signal, send) {
  const sourceText = String(message.sourceText || "").trim();
  if (!sourceText) throw new Error("没有可翻译的文字");

  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const settings = normalizeSettings(stored);
  const config = getProviderConfig(settings);
  validateProviderConfig(config);

  send({
    type: "started",
    requestId: message.requestId,
    model: config.model,
    targetLanguage: config.targetLanguage,
  });

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(createRequestBody(config, sourceText, true)),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream") && response.body) {
    await readEventStream(response.body, message.requestId, send, signal);
  } else {
    const payload = await response.json();
    const text = getCompletionText(payload);
    if (!text) throw new Error("模型返回了空内容");
    send({ type: "delta", requestId: message.requestId, text });
  }

  send({ type: "done", requestId: message.requestId });
}

async function readEventStream(body, requestId, send, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedText = false;

  const processLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    const delta = payload?.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) {
      receivedText = true;
      send({ type: "delta", requestId, text: delta });
    }
  };

  while (true) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach(processLine);
    if (done) break;
  }

  if (buffer) processLine(buffer);
  if (!receivedText) throw new Error("模型返回了空内容");
}

async function readApiError(response) {
  let detail = "";
  try {
    const payload = await response.json();
    detail = payload?.error?.message || payload?.message || "";
  } catch {
    try {
      detail = (await response.text()).slice(0, 240);
    } catch {
      detail = "";
    }
  }
  const suffix = detail ? `：${detail}` : "";
  return `接口请求失败（${response.status}）${suffix}`;
}

function toFriendlyError(error) {
  const message = error?.message || String(error || "未知错误");
  if (/Failed to fetch/i.test(message)) {
    return "无法连接模型 API，请检查 API 地址、网络和站点权限";
  }
  return message;
}

async function injectIntoExistingTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) =>
        chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["content.js"],
        }),
      ),
  );
}
