"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../core.js");

// Exercise the real content script with browser ports, DOM boundaries stubbed.
function createBrowser() {
  class Element {
    constructor() {
      this.listeners = {};
      this.attributes = {};
      this.style = {};
      this.textContent = "";
      this.value = "";
      this.isConnected = true;
      this.classList = { add() {}, remove() {} };
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    dispatch(type, event = {}) { return this.listeners[type]?.(event); }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { document.activeElement = this; }
    remove() { this.isConnected = false; }
    getBoundingClientRect() { return { width: 390, height: 300 }; }
    attachShadow() { this.shadow = new Element(); return this.shadow; }
    set innerHTML(html) {
      this.children = {};
      for (const match of html.matchAll(/<[^>]+class="([^"]+)"[^>]*>/g)) {
        const child = new Element();
        child.hidden = /\bhidden\b/.test(match[0]);
        for (const className of match[1].split(" ")) this.children[`.${className}`] = child;
      }
    }
    querySelector(selector) { return this.children[selector]; }
  }
  const document = new Element();
  document.body = new Element();
  document.activeElement = document.body;
  document.documentElement = new Element();
  document.documentElement.appendChild = (host) => { document.host = host; };
  document.createElement = () => new Element();
  const requests = [];
  const ports = [];
  let copied = "";
  const context = {
    document,
    window: { getSelection: () => null, innerWidth: 1200, innerHeight: 800 },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    navigator: { platform: "MacIntel", clipboard: { async writeText(text) { copied = text; } } },
    performance: { now: () => 1 },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: () => 1,
    clearTimeout() {},
    chrome: {
      runtime: {
        connect() {
          const port = {
            onMessage: { addListener(fn) { port.receive = fn; } },
            onDisconnect: { addListener() {} },
            postMessage(message) { if (message.type === "translate") requests.push(message); },
            disconnect() {},
          };
          ports.push(port);
          return port;
        },
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../content.js"), "utf8"), context);
  const key = (value) => document.dispatch("keydown", {
    key: value, code: value === "f" ? "KeyF" : value,
    composedPath: () => [], preventDefault() {}, stopPropagation() {},
  });
  key("f");
  key("f");
  const get = (selector) => document.host.shadow.querySelector(selector);
  const respond = (index = ports.length - 1, text = "英 /ˈæp.əl/ · 美 /ˈæp.əl/\n名词：苹果。") => {
    const request = requests[index];
    ports[index].receive({ type: "started", requestId: request.requestId,
      word: request.inputMode ? core.getEnglishWord(request.sourceText) : "",
      model: "test", targetLanguage: "简体中文" });
    ports[index].receive({ type: "delta", requestId: request.requestId, text });
    ports[index].receive({ type: "done", requestId: request.requestId });
  };
  return {
    get, respond, key, requests,
    submit(text) { get(".source").value = text; get(".translate").dispatch("click"); },
    get copied() { return copied; },
    get host() { return document.host; },
  };
}

test("manual word results display phonetics and copy the word with its meanings", async () => {
  const browser = createBrowser();
  browser.submit(" apple ");
  assert.equal(browser.requests[0].inputMode, true);
  assert.equal(browser.requests[0].sourceText, "apple");
  browser.respond();
  assert.equal(browser.get(".word").textContent, "apple");
  assert.equal(browser.get(".word-heading").hidden, false);
  assert.match(browser.get(".result").textContent, /æp/);
  await browser.get(".copy").dispatch("click");
  assert.equal(browser.copied, `apple\n${browser.get(".result").textContent}`);
});

test("retranslation resets word UI and ignores stale translation events", () => {
  const browser = createBrowser();
  browser.submit("apple");
  browser.respond();
  browser.submit("hello world");
  browser.respond(0);
  assert.equal(browser.get(".word-heading").hidden, true);
  assert.equal(browser.get(".result").textContent, "");
  browser.respond(1, "你好，世界");
  assert.equal(browser.get(".word-heading").hidden, true);
  assert.equal(browser.get(".result").textContent, "你好，世界");

  browser.submit("hello");
  browser.respond();
  assert.equal(browser.get(".word").textContent, "hello");
  assert.equal(browser.get(".word-heading").hidden, false);
  browser.key("Escape");
  assert.equal(browser.host.isConnected, false);
});
