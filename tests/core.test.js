"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../core.js");

test("defaults to DeepSeek V4 Flash and Simplified Chinese", () => {
  const settings = core.normalizeSettings({});
  const provider = core.getProviderConfig(settings);

  assert.equal(provider.apiUrl, "https://api.deepseek.com/chat/completions");
  assert.equal(provider.model, "deepseek-v4-flash");
  assert.equal(provider.targetLanguage, "简体中文");
});

test("creates a minimal non-thinking DeepSeek translation request", () => {
  const config = core.getProviderConfig({
    deepseekApiKey: "secret",
    targetLanguage: "英文",
  });
  const body = core.createRequestBody(config, "你好", true);

  assert.deepEqual(body.messages, [
    { role: "system", content: "请将下面这段文字翻译成英文，只输出译文。" },
    { role: "user", content: "你好" },
  ]);
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.stream, true);
  assert.equal(body.temperature, 0);
  assert.equal(Object.keys(body).length, 5);
});

test("does not send DeepSeek-specific thinking option to custom APIs", () => {
  const config = core.getProviderConfig({
    provider: "custom",
    customApiUrl: "https://example.test/v1/chat/completions",
    customApiKey: "custom-secret",
    customModel: "translator-small",
  });
  const body = core.createRequestBody(config, "Hello", true);

  assert.equal(config.model, "translator-small");
  assert.equal("thinking" in body, false);
});

test("validates API credentials, models and URL schemes", () => {
  assert.throws(
    () => core.validateProviderConfig({ apiUrl: "https://example.test", apiKey: "", model: "m" }),
    /API Key/,
  );
  assert.throws(
    () => core.validateProviderConfig({ apiUrl: "file:///tmp/api", apiKey: "k", model: "m" }),
    /HTTP/,
  );
  assert.doesNotThrow(() =>
    core.validateProviderConfig({ apiUrl: "https://example.test/v1/chat/completions", apiKey: "k", model: "m" }),
  );
});

test("manifest uses local storage and no extension server", () => {
  const manifestPath = path.join(__dirname, "..", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "scripting"]);
  assert.deepEqual(manifest.host_permissions, ["https://api.deepseek.com/*"]);
  assert.equal(manifest.background.service_worker, "background.js");
});
