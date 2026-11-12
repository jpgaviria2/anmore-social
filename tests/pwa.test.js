import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const moduleURL = new URL("../src/pwa.js", import.meta.url);
async function pwa() {
  await assert.doesNotReject(
    () => readFile(moduleURL),
    "PWA policy module must exist",
  );
  return import(moduleURL);
}
test("install instructions distinguish iOS Safari, iPad desktop UA, Android and desktop without claiming support", async () => {
  const { installInstructions } = await pwa();
  assert.match(
    installInstructions({ userAgent: "iPhone Safari" }),
    /Safari.*Share.*Add to Home Screen.*Open as Web App.*if offered/,
  );
  assert.match(
    installInstructions({ userAgent: "Macintosh Safari", maxTouchPoints: 5 }),
    /Share/,
  );
  assert.match(
    installInstructions({ userAgent: "Android Chrome" }),
    /browser menu.*Install app.*Add to Home screen/,
  );
  assert.match(
    installInstructions({ userAgent: "Firefox Linux" }),
    /browser.*install.*bookmark/i,
  );
});

test("compact invitation needs engagement, obeys seven-day dismissal cooldown and survives denied/corrupt storage", async () => {
  const { createInstallState, INSTALL_PREFERENCE } = await pwa();
  assert.equal(typeof createInstallState, "function");
  let time = 1000000000;
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  let state = createInstallState(storage, () => time);
  assert.equal(state.eligible(), false);
  state.engage();
  assert.equal(state.eligible(), true);
  state.dismiss();
  assert.deepEqual([...values.keys()], [INSTALL_PREFERENCE]);
  assert.equal(state.eligible(), false);
  state = createInstallState(storage, () => time);
  state.engage();
  assert.equal(state.eligible(), false);
  time += 7 * 86400000 + 1;
  assert.equal(state.eligible(), true);
  for (const value of ["bad", "-5", "Infinity", String(time + 86400000)]) {
    values.set(INSTALL_PREFERENCE, value);
    const recovered = createInstallState(storage, () => time);
    recovered.engage();
    assert.equal(recovered.eligible(), true);
  }
  const denied = createInstallState(
    {
      getItem() {
        throw Error("denied");
      },
      setItem() {
        throw Error("denied");
      },
    },
    () => time,
  );
  denied.engage();
  denied.dismiss();
  assert.equal(
    denied.eligible(),
    false,
    "In-memory dismissal when persistence fails",
  );
});

function installFixture(setupInstall) {
  const listeners = {},
    nodes = new Map(),
    stored = new Map();
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        hidden: false,
        disabled: false,
        textContent: "",
        handlers: {},
        addEventListener(type, fn) {
          this.handlers[type] = fn;
        },
        querySelector() {
          return { focus() {} };
        },
        scrollIntoView() {},
      });
    return nodes.get(id);
  };
  const media = {
    matches: false,
    addEventListener(type, fn) {
      listeners.media = fn;
    },
  };
  const win = {
    navigator: { userAgent: "Chrome" },
    localStorage: {
      getItem: (k) => stored.get(k),
      setItem: (k, v) => stored.set(k, v),
    },
    matchMedia: () => media,
    addEventListener: (type, fn) => (listeners[type] = fn),
  };
  setupInstall(win, {
    getElementById: node,
    addEventListener: (type, fn) => (listeners["doc-" + type] = fn),
  });
  return { node, listeners, media, stored };
}

test("native lifecycle consumes each deferred event once, recovers rejection and suppresses pending completion after appinstalled", async () => {
  const { setupInstall } = await pwa();
  const { node, listeners, media } = installFixture(setupInstall);
  let prompts = 0,
    prevented = 0;
  listeners.beforeinstallprompt({
    preventDefault() {
      prevented++;
    },
    prompt: async () => {
      prompts++;
      return { outcome: "dismissed" };
    },
  });
  assert.equal(prevented, 1);
  assert.equal(prompts, 0);
  assert.equal(node("install-native").hidden, false);
  await node("install-native").handlers.click();
  assert.equal(prompts, 1);
  await node("install-native").handlers.click();
  assert.equal(prompts, 1);
  assert.match(node("install-status").textContent, /Not installed/);
  listeners.beforeinstallprompt({
    preventDefault() {},
    prompt: async () => {
      throw Error("denied");
    },
  });
  await node("install-native").handlers.click();
  assert.equal(node("install-native").hidden, true);
  assert.match(node("install-status").textContent, /browser menu/);
  let resolve;
  listeners.beforeinstallprompt({
    preventDefault() {},
    prompt: () => new Promise((r) => (resolve = r)),
  });
  const pending = node("install-native").handlers.click();
  listeners.appinstalled();
  resolve({ outcome: "accepted" });
  await pending;
  assert.equal(node("install-area").hidden, true);
  assert.equal(node("install-invitation").hidden, true);
  const standalone = installFixture(setupInstall);
  standalone.media.matches = true;
  standalone.listeners.media();
  assert.equal(standalone.node("install-area").hidden, true);
});
