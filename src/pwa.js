export const INSTALL_PREFERENCE = "anmore-install-dismissed-at";
const COOLDOWN = 7 * 86400000;
export function createInstallState(storage, now = Date.now) {
  let dismissed = 0;
  try {
    const value = Number(storage?.getItem(INSTALL_PREFERENCE));
    if (Number.isFinite(value) && value > 0 && value <= now())
      dismissed = value;
  } catch {
    /* Optional preference only; no storage is required. */
  }
  return {
    eligible() {
      return !dismissed || now() - dismissed >= COOLDOWN;
    },
    dismiss() {
      dismissed = now();
      try {
        storage?.setItem(INSTALL_PREFERENCE, String(dismissed));
      } catch {
        /* Keep in memory. */
      }
    },
  };
}

export function setupWorker(win = window, doc = document) {
  if (!("serviceWorker" in win.navigator)) return;
  const sw = win.navigator.serviceWorker;
  const $ = (id) => doc.getElementById(id);
  let registration,
    armed = false;
  const pending = () => {
    $("app-update").hidden = !(registration?.waiting && sw.controller);
  };
  $("update-confirm").addEventListener("change", () => {
    $("update-reload").disabled = !$("update-confirm").checked;
  });
  $("update-reload").addEventListener("click", () => {
    if (!$("update-confirm").checked || $("zap-dialog").open) return;
    if (!registration?.waiting) return;
    armed = true;
    $("update-reload").disabled = true;
    registration.waiting.postMessage({ type: "ACTIVATE_OFFLINE_UPDATE" });
  });
  sw.addEventListener("controllerchange", () => {
    pending();
    // No forced refresh in other tabs or on first installation/legacy retirement.
    if (armed && !$("zap-dialog").open) {
      armed = false;
      win.location.reload();
    }
  });
  sw.register("./sw.js", { scope: "./", updateViaCache: "none" })
    .then((r) => {
      registration = r;
      pending();
      r.addEventListener("updatefound", () => {
        r.installing?.addEventListener("statechange", pending);
      });
    })
    .catch(() => {
      $("install-status").textContent =
        "Offline landing is unavailable in this browser session. You can still read online and use install help.";
    });
}

export function setupInstall(win = window, doc = document) {
  const $ = (id) => doc.getElementById(id);
  let storage;
  try {
    storage = win.localStorage;
  } catch {
    /* Privacy mode. */
  }
  const state = createInstallState(storage);
  let deferred = null,
    pending = false,
    completed = false;
  const standalone = () =>
    win.matchMedia("(display-mode: standalone)").matches ||
    win.navigator.standalone === true;
  const render = () => {
    const hidden = standalone() || completed;
    $("install-area").hidden = hidden;
    $("install-invitation").hidden = hidden || !state.eligible();
    $("install-native").hidden = hidden || !deferred;
    $("install-native").disabled = pending;
  };
  $("install-instructions").textContent = installInstructions(win.navigator);
  $("install-dismiss").addEventListener("click", () => {
    state.dismiss();
    render();
    $("install-help").querySelector("summary").focus({ preventScroll: true });
  });
  $("install-show-help").addEventListener("click", () => {
    $("install-help").open = true;
    $("install-help").scrollIntoView({ block: "center" });
    $("install-help").querySelector("summary").focus();
  });
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (!standalone() && !completed && !pending) deferred = event;
    render();
  });
  $("install-native").addEventListener("click", async () => {
    if (!deferred || pending || standalone() || completed) return;
    const event = deferred;
    deferred = null;
    pending = true;
    render();
    try {
      const result = await event.prompt();
      const choice = event.userChoice ? await event.userChoice : result;
      if (completed) return;
      if (choice?.outcome === "accepted") {
        state.dismiss();
        $("install-status").textContent =
          "Installation requested. Your browser will finish adding the app.";
      } else {
        state.dismiss();
        $("install-status").textContent =
          "Not installed. You can try again from your browser menu, or follow the instructions above.";
      }
    } catch {
      if (!completed)
        $("install-status").textContent =
          "The install prompt could not open. Use your browser menu or the instructions above.";
    } finally {
      pending = false;
      render();
    }
  });
  win.addEventListener("appinstalled", () => {
    completed = true;
    deferred = null;
    state.dismiss();
    render();
  });
  win
    .matchMedia("(display-mode: standalone)")
    .addEventListener?.("change", render);
  render();
}

export function installInstructions({
  userAgent = "",
  maxTouchPoints = 0,
} = {}) {
  if (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  )
    return "Open this site in Safari. Tap Share (you may need More), then Add to Home Screen. Turn on Open as Web App if offered, then tap Add. If you are in another app’s browser, open Safari first.";
  if (/Android/.test(userAgent))
    return "Use Install app above when available, or your browser menu’s Install app or Add to Home screen option. In an in-app browser, open this page in Chrome or another supporting browser first. If unavailable, bookmark this page.";
  return "Look for your browser’s install icon in the address bar, or Install app / Install page as app in its menu. Availability varies by browser; if unavailable, bookmark this page. Safari on Mac may offer File → Add to Dock.";
}
