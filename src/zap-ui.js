import QRCode from "qrcode";
import { createZap, zapAmount } from "./zaps.js";
const $ = (id) => document.getElementById(id);
export function setupZaps({ getPost, getState, recheck }) {
  const dialog = $("zap-dialog"),
    attempts = new Map();
  let selected,
    opener,
    epoch = 0,
    expiryTimer;
  const message = (text) => {
    $("zap-message").textContent = text;
  };
  function clearInvoice() {
    clearTimeout(expiryTimer);
    $("zap-invoice").hidden = true;
    $("zap-wallet").removeAttribute("href");
    $("zap-invoice-text").value = "";
    const c = $("zap-qr");
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
  }
  async function showInvoice(result, token) {
    if (!dialog.open || token !== epoch || !getPost(result.postId)) return;
    clearInvoice();
    if (result.expiresAt <= Math.floor(Date.now() / 1000)) {
      message(
        "This invoice has expired. Check your wallet before reloading to create another.",
      );
      return;
    }
    await QRCode.toCanvas($("zap-qr"), result.uri, {
      width: 600,
      margin: 4,
      errorCorrectionLevel: "M",
    });
    if (!dialog.open || token !== epoch || !getPost(result.postId)) {
      clearInvoice();
      return;
    }
    $("zap-wallet").href = result.uri;
    $("zap-invoice-text").value = result.uri;
    $("zap-expiry").textContent =
      `${result.msats / 1000n} sats to the community group. Expires ${new Date(result.expiresAt * 1000).toLocaleTimeString()}.`;
    $("zap-invoice").hidden = false;
    message(
      "Invoice checked against this exact post, community recipient and amount. No payment has been sent by this site.",
    );
    expiryTimer = setTimeout(
      () => {
        clearInvoice();
        message(
          "This invoice has expired. Check your wallet before reloading to create another.",
        );
      },
      Math.min(2147483647, result.expiresAt * 1000 - Date.now()),
    );
  }
  function invalidate() {
    epoch++;
    selected = undefined;
    clearInvoice();
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener("close", () => {
    epoch++;
    selected = undefined;
    clearInvoice();
    if (opener?.isConnected) opener.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (!dialog.open || event.key !== "Tab") return;
    const controls = [
      ...dialog.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      ),
    ].filter((node) => node.getClientRects().length > 0);
    const first = controls[0],
      last = controls.at(-1),
      active = document.activeElement;
    if (!first) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    if (
      !dialog.contains(active) ||
      (event.shiftKey && active === first) ||
      (!event.shiftKey && active === last)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  $("close-zap").addEventListener("click", () => dialog.close());
  $("create-zap").addEventListener("click", async () => {
    const id = selected,
      token = epoch;
    if (!getPost(id) || attempts.has(id)) return;
    const sats = $("zap-amount").value;
    try {
      zapAmount(sats, getState().authority);
    } catch (error) {
      message(error.message);
      return;
    }
    if (attempts.size >= 32) {
      message(
        "This session reached the invoice safety limit. No invoice was requested.",
      );
      return;
    }
    // One attempt per post per page session, including unknown callback outcomes.
    attempts.set(id, { pending: true });
    $("create-zap").disabled = true;
    $("zap-amount").disabled = true;
    message(
      "Rechecking this post and the community recipient before requesting one invoice…",
    );
    try {
      const authority = await recheck(id);
      if (token !== epoch || !dialog.open || !getPost(id))
        throw Error("Post check changed. No new invoice was requested.");
      const result = await createZap(getPost(id), authority, sats);
      attempts.set(id, {
        result,
        recipient: authority.recipient,
        issuer: authority.issuer,
      });
      await showInvoice(result, token);
    } catch (error) {
      attempts.set(id, { error: true });
      if (dialog.open && token === epoch)
        message(
          error.message ||
            "Zap invoice unavailable. No payment was sent. Check your wallet before trying elsewhere.",
        );
    }
  });
  $("copy-zap").addEventListener("click", async () => {
    const text = $("zap-invoice-text").value;
    if (!text || $("zap-invoice").hidden) return;
    try {
      await navigator.clipboard.writeText(text);
      message("Lightning invoice copied. This does not send payment.");
    } catch {
      $("zap-invoice-text").focus();
      $("zap-invoice-text").select();
      message(
        "Clipboard unavailable. Select and copy the exact invoice above.",
      );
    }
  });
  return {
    invalidate,
    open(id, button) {
      const post = getPost(id);
      if (!post) return;
      selected = id;
      opener = button;
      const token = ++epoch;
      clearInvoice();
      $("zap-post").textContent =
        post.content.slice(0, 220) || "Photo community update";
      $("zap-post-id").textContent = id;
      $("zap-amount").value = "21";
      const state = getState(),
        attempt = attempts.get(id);
      $("create-zap").disabled = !state.authority || !!attempt;
      $("zap-amount").disabled = !state.authority || !!attempt;
      message(
        state.authority
          ? "Choose an amount, then request one post-bound invoice. The request uses a fresh anonymous signing key in memory only."
          : state.error ||
              "Community zap verification is unavailable. No invoice can be created.",
      );
      dialog.showModal();
      if (
        attempt?.result &&
        attempt.recipient === state.authority?.recipient &&
        attempt.issuer === state.authority?.issuer
      )
        showInvoice(attempt.result, token).catch(() =>
          message("QR rendering failed. No payment was sent."),
        );
      else if (attempt)
        message(
          "This post already has an invoice attempt in this session. Check your wallet; reload only when you are ready to start a separate request.",
        );
    },
  };
}
