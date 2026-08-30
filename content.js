(function initializeFFTranslator() {
  "use strict";

  if (globalThis.__ffSelectionTranslatorLoaded) return;
  globalThis.__ffSelectionTranslatorLoaded = true;

  const SHORTCUT_WINDOW_MS = 700;
  const OVERLAY_MARGIN = 12;

  let pendingShortcut = null;
  let shortcutTimer = null;
  let overlayHost = null;
  let activePort = null;
  let activeRequestId = null;

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
      const snapshot = pendingShortcut.snapshot;
      clearPendingShortcut();
      startTranslation(snapshot);
      return;
    }

    const snapshot = getSelectionSnapshot();
    if (!snapshot) {
      clearPendingShortcut();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    pendingShortcut = { snapshot, startedAt: now };
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

    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    activeRequestId = requestId;
    const view = createOverlay(snapshot, requestId);

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

    activePort.postMessage({ type: "translate", requestId, sourceText: snapshot.text });
  }

  function createOverlay(snapshot, requestId) {
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
      <style>
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
      </style>
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
      setMeta(text) {
        if (activeRequestId === requestId) meta.textContent = text;
      },
      appendText(text) {
        if (activeRequestId !== requestId) return;
        loading.hidden = true;
        error.hidden = true;
        result.hidden = false;
        result.textContent += text;
        copy.hidden = false;
      },
      finish() {
        if (activeRequestId !== requestId) return;
        loading.hidden = true;
        result.classList.remove("cursor");
      },
      showError(message, configurationRequired) {
        if (activeRequestId !== requestId) return;
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

  function onDocumentPointerDown(event) {
    if (overlayHost && !event.composedPath().includes(overlayHost)) dismissOverlay();
  }

  function dismissOverlay() {
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
    overlayHost?.remove();
    overlayHost = null;
  }
})();
