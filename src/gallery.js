// A single native modal lives outside the feed, so refresh never detaches it.
const node = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
let viewer;
function gallery() {
  if (viewer) return viewer;
  const dialog = node("dialog", "media-gallery");
  dialog.id = "media-gallery";
  dialog.setAttribute("aria-label", "Community media gallery");
  const bar = node("div", "gallery-bar");
  const counter = node("span");
  counter.id = "media-counter";
  counter.setAttribute("aria-live", "polite");
  const button = (label, action) => {
    const b = node("button", "gallery-button", label);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  };
  const close = button("Close", () => dialog.close());
  const stage = node("div", "gallery-stage");
  const controls = node("div", "gallery-controls");
  const previous = button("Previous", () => show(index - 1));
  const next = button("Next", () => show(index + 1));
  const original = node("a", "gallery-original", "Open original (new tab)");
  original.target = "_blank";
  original.rel = "noopener noreferrer";
  bar.append(counter, close);
  controls.append(previous, original, next);
  dialog.append(bar, stage, controls);
  document.body.append(dialog);
  let items = [],
    index = 0,
    opener,
    scroll = 0,
    oldOverflow;
  let activeVideo, observer, touch, sessionActive = false;
  const clear = () => {
    touch = null;
    observer?.disconnect();
    observer = null;
    if (activeVideo) {
      activeVideo.pause();
      activeVideo.removeAttribute("src");
      activeVideo.load();
      activeVideo = null;
    }
    stage.replaceChildren();
  };
  function show(selected) {
    if (selected < 0 || selected >= items.length) return;
    if (dialog.open && stage.contains(document.activeElement)) close.focus();
    clear();
    index = selected;
    const item = items[index];
    counter.textContent = `Media ${index + 1} of ${items.length}`;
    if (
      (index === 0 && document.activeElement === previous) ||
      (index === items.length - 1 && document.activeElement === next)
    )
      close.focus();
    previous.disabled = index === 0;
    next.disabled = index === items.length - 1;
    original.href = item.url;
    if (item.type === "video") {
      const play = button("Play video", () => {
        const video = node("video");
        video.controls = true;
        video.playsInline = true;
        video.preload = "none";
        video.setAttribute("aria-label", item.label);
        const failure = node(
          "p",
          "gallery-failure",
          "Video unavailable in this browser. Open the original to try another player.",
        );
        failure.hidden = true;
        const hls =
          ["application/vnd.apple.mpegurl", "application/x-mpegurl"].includes(
            item.mime?.toLowerCase(),
          ) || /\.m3u8$/i.test(new URL(item.url).pathname);
        if (hls && !video.canPlayType("application/vnd.apple.mpegurl")) {
          close.focus();
          stage.replaceChildren(
            node(
              "p",
              "gallery-failure",
              "HLS playback is not supported in this browser. Open the original to try a compatible player.",
            ),
          );
          return;
        }
        activeVideo = video;
        video.addEventListener("error", () => {
          failure.hidden = false;
        });
        stage.replaceChildren(video, failure);
        close.focus();
        video.src = item.url;
        video.play().catch(() => {
          if (activeVideo === video) failure.hidden = false;
        });
        const owner = new IntersectionObserver((entries) => {
          if (activeVideo === video && observer === owner && entries.some((e) => !e.isIntersecting))
            show(index);
        });
        observer = owner;
        owner.observe(stage);
      });
      const preview = node("div", "gallery-video-preview");
      if (item.poster) {
        const poster = node("img");
        poster.src = item.poster;
        poster.alt = "";
        poster.referrerPolicy = "no-referrer";
        preview.append(poster);
      }
      preview.append(node("p", "", item.label), play);
      stage.append(preview);
      return;
    }
    const img = node("img");
    img.src = item.url;
    img.alt = item.label;
    img.referrerPolicy = "no-referrer";
    img.addEventListener(
      "error",
      () => {
        if (stage.contains(img))
          stage.replaceChildren(
            node(
              "p",
              "gallery-failure",
              "Photo unavailable. You can open the original in a new tab.",
            ),
          );
      },
      { once: true },
    );
    stage.append(img);
  }
  dialog.addEventListener("keydown", (e) => {
    const playerOwnsKey = e.composedPath().some((n) => n instanceof HTMLVideoElement);
    if (e.key === "ArrowRight" && !playerOwnsKey) {
      e.preventDefault();
      show(index + 1);
    }
    if (e.key === "ArrowLeft" && !playerOwnsKey) {
      e.preventDefault();
      show(index - 1);
    }
    if (e.key === "Tab") {
      const focusable = [
        ...dialog.querySelectorAll(
          "button:not(:disabled),a[href],video[controls]",
        ),
      ].filter((n) => !n.hidden);
      const first = focusable[0],
        last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  stage.addEventListener("touchcancel", () => { touch = null; }, { passive: true });
  stage.addEventListener(
    "touchstart",
    (e) => {
      touch = null;
      if (e.composedPath().some((n) => n instanceof HTMLVideoElement) || e.touches.length !== 1) return;
      touch = {
        id: e.touches[0].identifier,
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchend",
    (e) => {
      const end = e.changedTouches[0];
      if (
        touch &&
        end && end.identifier === touch.id &&
        !e.composedPath().some((n) => n instanceof HTMLVideoElement) &&
        Math.abs(end.clientX - touch.x) > 50 &&
        Math.abs(end.clientX - touch.x) > Math.abs(end.clientY - touch.y)
      )
        show(index + (end.clientX < touch.x ? 1 : -1));
      touch = null;
    },
    { passive: true },
  );
  const suspend = () => {
    if (dialog.open && activeVideo) show(index);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") suspend();
  });
  window.addEventListener("pagehide", suspend);
  dialog.addEventListener("cancel", clear);
  const teardown = () => {
    if (!sessionActive) return;
    sessionActive = false;
    clear();
    document.body.style.overflow = oldOverflow;
    window.scrollTo({ top: scroll, behavior: "instant" });
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else {
      const heading = document.getElementById("feed-heading");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  };
  // Native close events are queued. Retire this session synchronously so a
  // same-task reopen cannot inherit its scroll lock or be cleared by its event.
  const nativeClose = dialog.close.bind(dialog);
  dialog.close = (...args) => {
    nativeClose(...args);
    if (!dialog.open) teardown();
  };
  dialog.addEventListener("close", () => {
    if (!dialog.open) teardown();
  });
  viewer = {
    open(attachments, selected, trigger) {
      if (sessionActive) {
        if (dialog.open) dialog.close();
        else teardown();
      }
      items = attachments;
      opener = trigger;
      scroll = window.scrollY;
      oldOverflow = document.body.style.overflow;
      sessionActive = true;
      document.body.style.overflow = "hidden";
      show(selected);
      dialog.showModal();
      close.focus();
    },
    reconcile() {
      if (dialog.open && !opener?.isConnected) dialog.close();
    },
  };
  return viewer;
}
export function reconcileGallery() {
  viewer?.reconcile();
}
export function mediaGrid(attachments) {
  if (!attachments.length) return null;
  const grid = node(
    "div",
    `post-media media-grid media-count-${Math.min(4, attachments.length)}`,
  );
  attachments.slice(0, 4).forEach((item, index) => {
    const tile = node("button", "media-tile");
    tile.type = "button";
    tile.setAttribute(
      "aria-label",
      `Open ${item.type === "video" ? "video" : "photo"} ${index + 1} of ${attachments.length}: ${item.label}`,
    );
    if (item.type === "image" || item.poster) {
      const img = node("img");
      img.src = item.type === "image" ? item.url : item.poster;
      img.alt = item.type === "image" ? item.label : "";
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener(
        "error",
        () => {
          img.replaceWith(
            node(
              "span",
              "media-failure",
              item.type === "image"
                ? "Photo unavailable · Open original"
                : "Video",
            ),
          );
        },
        { once: true },
      );
      tile.append(img);
    }
    if (item.type === "video")
      tile.append(node("span", "video-badge", "▶ Video"));
    if (index === 3 && attachments.length > 4)
      tile.append(node("span", "media-more", `+${attachments.length - 4}`));
    tile.addEventListener("click", () =>
      gallery().open(attachments, index, tile),
    );
    grid.append(tile);
  });
  return grid;
}
