"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../core.js");

test("background sends the detected target to the API and UI on each request", async () => {
  const requests = [];
  const settings = Object.freeze({ deepseekApiKey: "test-key", targetLanguage: "简体中文" });
  const listener = { addListener() {} };
  const context = {
    importScripts() {},
    FFTranslatorCore: core,
    chrome: {
      runtime: { onInstalled: listener, onConnect: listener },
      action: { onClicked: listener },
      storage: { local: { async get() { return settings; } } },
    },
    async fetch(url, options) {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { choices: [{ message: { content: "translated" } }] }; },
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../background.js"), "utf8"), context);

  for (const [sourceText, inputMode, targetLanguage, word] of [
    ["你好", true, "英文", ""],
    ["hello world", true, "简体中文", ""],
    ["請幫我確認 API 設定", true, "英文", ""],
    ["apple", true, "简体中文", "apple"],
    ["你好", false, "简体中文", ""],
  ]) {
    const events = [];
    const requestId = requests.length;
    await context.translate({ sourceText, inputMode, requestId },
      new AbortController().signal, (event) => events.push(event));
    assert.equal(events[0].type, "started");
    assert.equal(events[0].targetLanguage, targetLanguage);
    assert.equal(events[0].word, word);
    const prompt = requests[requestId].messages[0].content;
    if (word) {
      assert.match(prompt, /用简体中文给出词性和常用释义/);
    } else {
      assert.equal(prompt, core.createSystemPrompt(targetLanguage));
    }
    assert.equal(events[1].text, "translated");
    assert.equal(events[2].type, "done");
  }
});
