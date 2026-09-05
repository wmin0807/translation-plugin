(function initializeFFTranslator() {
  "use strict";

  if (globalThis.__ffSelectionTranslatorLoaded) return;
  globalThis.__ffSelectionTranslatorLoaded = true;

  const SHORTCUT_WINDOW_MS = 700;
  const OVERLAY_MARGIN = 12;

  const OVERLAY_CSS = `
    :host { color-scheme: light dark; }
    * { box-sizing: border-box; }
    .card {
      width: min(390px, calc(100vw - 24px));
      max-height: min(430px, calc(100vh - 24px));
      overflow: hidden;
      border: 1px solid rgba(15, 23, 42, .10);
      border-radius: 14px;
      background: rgba(255, 255, 255, .98);
      color: #172033;
      box-shadow: 0 18px 50px rgba(15, 23, 42, .18), 0 2px 8px rgba(15, 23, 42, .10);
      font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      animation: enter .13s ease-out;
    }
    @keyframes enter {
      from { opacity: 0; transform: translateY(-3px) scale(.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .header {
      height: 45px;
      padding: 0 9px 0 14px;
      display: flex;
      align-items: center;
      gap: 9px;
      border-bottom: 1px solid rgba(15, 23, 42, .08);
    }
    .mark {
      width: 25px;
      height: 25px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      color: white;
      background: linear-gradient(145deg, #4f46e5, #7c3aed);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: -.6px;
    }
    .title { font-size: 13px; font-weight: 680; white-space: nowrap; }
    .meta {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      color: #7a8498;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    button {
      appearance: none;
      border: 0;
      font: inherit;
      cursor: pointer;
    }
    .icon-button {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: transparent;
      color: #7a8498;
      font-size: 19px;
    }
    .icon-button:hover { background: #f1f4f9; color: #172033; }
    .body { max-height: 318px; overflow: auto; padding: 15px 16px 16px; }
    .loading { display: flex; align-items: center; gap: 9px; color: #667085; }
    .dots { display: inline-flex; gap: 4px; }
    .dots i {
      width: 5px;
      height: 5px;
      border-radius: 99px;
      background: #6d5ce7;
      animation: pulse .9s infinite alternate;
    }
    .dots i:nth-child(2) { animation-delay: .15s; }
    .dots i:nth-child(3) { animation-delay: .3s; }
    @keyframes pulse { to { opacity: .25; transform: translateY(-2px); } }
    .result { margin: 0; color: #20293a; white-space: pre-wrap; overflow-wrap: anywhere; }
    .cursor::after { content: ""; display: inline-block; width: 2px; height: 1em; margin-left: 2px; vertical-align: -.12em; background: #6657db; animation: blink .8s infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    .error { color: #b42318; white-space: pre-wrap; overflow-wrap: anywhere; }
    .footer {
      min-height: 42px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      padding: 6px 9px;
      border-top: 1px solid rgba(15, 23, 42, .08);
    }
    .action {
      min-height: 29px;
      padding: 4px 9px;
      border-radius: 8px;
      background: transparent;
      color: #596579;
      font-size: 12px;
    }
    .action:hover { background: #f1f4f9; color: #242c3b; }
    .action:disabled { opacity: .55; cursor: default; }
    .primary { background: #6557db; color: white; }
    .primary:hover { background: #5749ca; color: white; }
    [hidden] { display: none !important; }
    @media (prefers-color-scheme: dark) {
      .card { border-color: rgba(255,255,255,.12); background: rgba(29, 32, 41, .98); color: #f2f4f7; box-shadow: 0 18px 50px rgba(0,0,0,.44); }
      .header, .footer { border-color: rgba(255,255,255,.09); }
      .meta, .loading { color: #aeb6c5; }
      .result { color: #f1f3f7; }
      .icon-button, .action { color: #b1b8c6; }
      .icon-button:hover, .action:hover { background: #353946; color: #fff; }
      .primary, .primary:hover { background: #7567e7; color: #fff; }
      .error { color: #ff8e86; }
    }
  `;

  const INPUT_OVERLAY_CSS = `
    .source {
      width: 100%;
      min-height: 74px;
      max-height: 160px;
      resize: vertical;
      margin: 0 0 12px;
      padding: 9px 11px;
      border: 1px solid rgba(15, 23, 42, .16);
      border-radius: 10px;
      outline: none;
      background: #fff;
      color: inherit;
      font: inherit;
      line-height: 1.55;
    }
    .source:focus { border-color: #6d5ce7; box-shadow: 0 0 0 3px rgba(109, 92, 231, .16); }
    .source::placeholder { color: #98a2b3; }
    @media (prefers-color-scheme: dark) {
      .source { background: #262a35; border-color: rgba(255,255,255,.16); }
      .source:focus { border-color: #8b7cf0; box-shadow: 0 0 0 3px rgba(139, 124, 240, .22); }
      .source::placeholder { color: #7d8595; }
    }
  `;

  let pendingShortcut = null;
  let shortcutTimer = null;
  let overlayHost = null;
  let activePort = null;
  let activeRequestId = null;
  let focusToRestore = null;

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onDocumentPointerDown, true);

  function onKeyDown(event) {
    if (event.key === "Escape" && overlayHost) {
      event.preventDefault();
      dismissOverlay();
      return;
    }

    const isFKey = event.code === "KeyF" || event.key?.toLowerCase() === "f";

    if (
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      !isFKey ||
      event.composedPath().includes(overlayHost)
    ) {
      if (event.key?.length === 1 && !isFKey) {
        clearPendingShortcut();
      }
      return;
    }

    const now = performance.now();
    if (pendingShortcut && now - pendingShortcut.startedAt <= SHORTCUT_WINDOW_MS) {
      event.preventDefault();
      event.stopPropagation();
      const pending = pendingShortcut;
      clearPendingShortcut();
      if (pending.snapshot) {
        startTranslation(pending.snapshot);
      } else {
        removeStrayCharacter(pending.fInsertion);
        openInputOverlay();
      }
      return;
    }

    const snapshot = getSelectionSnapshot();
    if (snapshot) {
      event.preventDefault();
      event.stopPropagation();
      pendingShortcut = { snapshot, fInsertion: null, startedAt: now };
    } else {
      const editable = getEditableTarget();
      if (!editable) {
        event.preventDefault();
        event.stopPropagation();
      }
      const fInsertion =
        editable && Number.isInteger(editable.selectionStart)
          ? { element: editable, position: editable.selectionStart }
          : null;
      pendingShortcut = { snapshot: null, fInsertion, startedAt: now };
    }
    clearTimeout(shortcutTimer);
    shortcutTimer = setTimeout(clearPendingShortcut, SHORTCUT_WINDOW_MS);
  }

  function clearPendingShortcut() {
    pendingShortcut = null;
    clearTimeout(shortcutTimer);
    shortcutTimer = null;
  }

  function getSelectionSnapshot() {
    const activeElement = document.activeElement;
    if (isSelectableInput(activeElement)) {
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;
      if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
        const text = activeElement.value.slice(start, end).trim();
        if (text) return { text, rect: normalizeRect(activeElement.getBoundingClientRect()) };
      }
    }

    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!selection || !text || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(selection.rangeCount - 1);
    const clientRects = Array.from(range.getClientRects());
    const rect = clientRects.at(-1) || range.getBoundingClientRect();
    return { text, rect: normalizeRect(rect) };
  }

  function isSelectableInput(element) {
    if (!element) return false;
    if (element instanceof HTMLTextAreaElement) return true;
    if (!(element instanceof HTMLInputElement)) return false;
    return ["text", "search", "url", "tel", "email"].includes(element.type);
  }

  function getEditableTarget() {
    const element = document.activeElement;
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return element;
    }
    if (element?.isContentEditable) return element;
    return null;
  }

  function removeStrayCharacter(insertion) {
    if (!insertion) return;
    const { element, position } = insertion;
    if (document.activeElement !== element) return;
    if (element.selectionStart !== position + 1 || element.selectionEnd !== position + 1) return;
    if (element.value.charAt(position).toLowerCase() !== "f") return;
    element.setRangeText("", position, position + 1, "end");
  }

  function normalizeRect(rect) {
    return {
      top: Number(rect.top) || 0,
      right: Number(rect.right) || 0,
      bottom: Number(rect.bottom) || 0,
      left: Number(rect.left) || 0,
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0,
    };
  }

  function startTranslation(snapshot) {
    dismissOverlay();
    const view = createOverlay(snapshot);
    runTranslation(snapshot.text, view);
  }

  function openInputOverlay() {
    dismissOverlay();
    focusToRestore = captureFocusState();
    const view = createInputOverlay();
    view.focusInput();
  }

  function captureFocusState() {
    const element = document.activeElement;
    const isField = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
    if (!isField && !element?.isContentEditable) return null;
    const state = { element };
    if (Number.isInteger(element.selectionStart) && Number.isInteger(element.selectionEnd)) {
      state.start = element.selectionStart;
      state.end = element.selectionEnd;
    }
    return state;
  }

  function restoreFocus() {
    const state = focusToRestore;
    focusToRestore = null;
    if (!state?.element?.isConnected) return;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;
      state.element.focus();
      if (Number.isInteger(state.start) && Number.isInteger(state.end)) {
        try {
          state.element.setSelectionRange(state.start, state.end);
        } catch {
          // Some input types do not support selection ranges.
        }
      }
    });
  }

  function runTranslation(text, view) {
    cancelActiveRequest();

    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    activeRequestId = requestId;
    view.begin(requestId);

    try {
      activePort = chrome.runtime.connect({ name: "ff-translator" });
    } catch {
      view.showError("扩展连接失败，请重新加载页面后再试", false);
      return;
    }

    activePort.onMessage.addListener((message) => {
      if (message?.requestId !== activeRequestId) return;
      if (message.type === "started") {
        view.setMeta(`${message.model} · ${message.targetLanguage}`);
      } else if (message.type === "delta") {
        view.appendText(message.text);
      } else if (message.type === "done") {
        view.finish();
      } else if (message.type === "error") {
        view.showError(message.message, message.configurationRequired);
      }
    });

    activePort.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError && activeRequestId === requestId) {
        view.showError("翻译连接已断开，请重试", false);
      }
    });

    activePort.postMessage({ type: "translate", requestId, sourceText: text });
  }

  function createOverlay(snapshot) {
    const host = document.createElement("div");
    host.setAttribute("data-ff-translator", "");
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "z-index: 2147483647",
      "left: 12px",
      "top: 12px",
      "font-synthesis: none",
    ].join(";");

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>${OVERLAY_CSS}</style>
      <section class="card" role="dialog" aria-label="划词翻译结果">
        <header class="header">
          <span class="mark">FF</span>
          <span class="title">划词翻译</span>
          <span class="meta">正在连接模型…</span>
          <button class="icon-button close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="body">
          <div class="loading"><span class="dots"><i></i><i></i><i></i></span><span>正在翻译…</span></div>
          <p class="result cursor" hidden></p>
          <div class="error" hidden></div>
        </div>
        <footer class="footer">
          <button class="action settings" type="button" hidden>打开设置</button>
          <button class="action retry" type="button">重试</button>
          <button class="action primary copy" type="button" hidden>复制译文</button>
        </footer>
      </section>
    `;

    (document.documentElement || document.body).appendChild(host);
    overlayHost = host;

    const card = shadow.querySelector(".card");
    const meta = shadow.querySelector(".meta");
    const loading = shadow.querySelector(".loading");
    const result = shadow.querySelector(".result");
    const error = shadow.querySelector(".error");
    const copy = shadow.querySelector(".copy");
    const settings = shadow.querySelector(".settings");
    let viewRequestId = null;

    shadow.querySelector(".close").addEventListener("click", dismissOverlay);
    shadow.querySelector(".retry").addEventListener("click", () => startTranslation(snapshot));
    settings.addEventListener("click", () => activePort?.postMessage({ type: "open-options" }));
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(result.textContent || "");
        copy.textContent = "已复制";
        setTimeout(() => {
          if (overlayHost === host) copy.textContent = "复制译文";
        }, 1200);
      } catch {
        copy.textContent = "复制失败";
      }
    });

    requestAnimationFrame(() => positionOverlay(host, card, snapshot.rect));

    return {
      begin(requestId) {
        viewRequestId = requestId;
      },
      setMeta(text) {
        if (activeRequestId === viewRequestId) meta.textContent = text;
      },
      appendText(text) {
        if (activeRequestId !== viewRequestId) return;
        loading.hidden = true;
        error.hidden = true;
        result.hidden = false;
        result.textContent += text;
        copy.hidden = false;
      },
      finish() {
        if (activeRequestId !== viewRequestId) return;
        loading.hidden = true;
        result.classList.remove("cursor");
      },
      showError(message, configurationRequired) {
        if (activeRequestId !== viewRequestId) return;
        loading.hidden = true;
        result.hidden = true;
        result.classList.remove("cursor");
        error.hidden = false;
        error.textContent = message;
        settings.hidden = !configurationRequired;
        copy.hidden = true;
      },
    };
  }

  function createInputOverlay() {
    const host = document.createElement("div");
    host.setAttribute("data-ff-translator", "");
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "z-index: 2147483647",
      "left: 12px",
      "top: 12px",
      "font-synthesis: none",
    ].join(";");

    const shortcutHint = /mac/i.test(navigator.platform || "") ? "⌘ + Enter 翻译" : "Ctrl + Enter 翻译";

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>${OVERLAY_CSS}${INPUT_OVERLAY_CSS}</style>
      <section class="card" role="dialog" aria-label="自定义翻译">
        <header class="header">
          <span class="mark">FF</span>
          <span class="title">自定义翻译</span>
          <span class="meta">${shortcutHint}</span>
          <button class="icon-button close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="body">
          <textarea class="source" rows="3" placeholder="输入或粘贴要翻译的内容…"></textarea>
          <div class="loading" hidden><span class="dots"><i></i><i></i><i></i></span><span>正在翻译…</span></div>
          <p class="result cursor" hidden></p>
          <div class="error" hidden></div>
        </div>
        <footer class="footer">
          <button class="action settings" type="button" hidden>打开设置</button>
          <button class="action copy" type="button" hidden>复制译文</button>
          <button class="action primary translate" type="button">翻译</button>
        </footer>
      </section>
    `;

    (document.documentElement || document.body).appendChild(host);
    overlayHost = host;

    const card = shadow.querySelector(".card");
    const meta = shadow.querySelector(".meta");
    const source = shadow.querySelector(".source");
    const loading = shadow.querySelector(".loading");
    const result = shadow.querySelector(".result");
    const error = shadow.querySelector(".error");
    const copy = shadow.querySelector(".copy");
    const settings = shadow.querySelector(".settings");
    const translateButton = shadow.querySelector(".translate");
    let viewRequestId = null;

    const view = {
      begin(requestId) {
        viewRequestId = requestId;
        translateButton.disabled = true;
        loading.hidden = false;
        result.hidden = true;
        result.textContent = "";
        result.classList.add("cursor");
        error.hidden = true;
        copy.hidden = true;
        settings.hidden = true;
      },
      setMeta(text) {
        if (activeRequestId === viewRequestId) meta.textContent = text;
      },
      appendText(text) {
        if (activeRequestId !== viewRequestId) return;
        loading.hidden = true;
        error.hidden = true;
        result.hidden = false;
        result.textContent += text;
        copy.hidden = false;
      },
      finish() {
        if (activeRequestId !== viewRequestId) return;
        translateButton.disabled = false;
        loading.hidden = true;
        result.classList.remove("cursor");
      },
      showError(message, configurationRequired) {
        if (activeRequestId !== viewRequestId) return;
        translateButton.disabled = false;
        loading.hidden = true;
        result.hidden = true;
        result.classList.remove("cursor");
        error.hidden = false;
        error.textContent = message;
        settings.hidden = !configurationRequired;
        copy.hidden = true;
      },
      focusInput() {
        source.focus();
      },
    };

    function submit() {
      const text = source.value.trim();
      if (!text) {
        source.focus();
        return;
      }
      runTranslation(text, view);
    }

    shadow.querySelector(".close").addEventListener("click", dismissOverlay);
    translateButton.addEventListener("click", submit);
    settings.addEventListener("click", () => activePort?.postMessage({ type: "open-options" }));
    source.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit();
      }
    });
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(result.textContent || "");
        copy.textContent = "已复制";
        setTimeout(() => {
          if (overlayHost === host) copy.textContent = "复制译文";
        }, 1200);
      } catch {
        copy.textContent = "复制失败";
      }
    });

    requestAnimationFrame(() => positionOverlayCentered(host, card));

    return view;
  }

  function positionOverlay(host, card, selectionRect) {
    if (!host.isConnected) return;
    const cardRect = card.getBoundingClientRect();
    let left = selectionRect.left;
    let top = selectionRect.bottom + 8;

    left = Math.min(left, window.innerWidth - cardRect.width - OVERLAY_MARGIN);
    left = Math.max(OVERLAY_MARGIN, left);

    if (top + cardRect.height > window.innerHeight - OVERLAY_MARGIN) {
      top = selectionRect.top - cardRect.height - 8;
    }
    top = Math.max(OVERLAY_MARGIN, Math.min(top, window.innerHeight - cardRect.height - OVERLAY_MARGIN));

    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
  }

  function positionOverlayCentered(host, card) {
    if (!host.isConnected) return;
    const cardRect = card.getBoundingClientRect();
    const left = Math.max(OVERLAY_MARGIN, (window.innerWidth - cardRect.width) / 2);
    const top = Math.max(OVERLAY_MARGIN, (window.innerHeight - cardRect.height) / 2);
    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
  }

  function onDocumentPointerDown(event) {
    if (overlayHost && !event.composedPath().includes(overlayHost)) dismissOverlay();
  }

  function dismissOverlay() {
    cancelActiveRequest();
    overlayHost?.remove();
    overlayHost = null;
    restoreFocus();
  }

  function cancelActiveRequest() {
    if (activePort) {
      try {
        activePort.postMessage({ type: "cancel" });
        activePort.disconnect();
      } catch {
        // The service worker may already have disconnected.
      }
    }
    activePort = null;
    activeRequestId = null;
  }
})();
