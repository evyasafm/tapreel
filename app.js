(function () {
  "use strict";

  const DEMO_ITEMS = [
    { id: "scenic1", src: "items/scenic1.jpg", label: "Mountain lake" },
    { id: "scenic2", src: "items/scenic2.jpg", label: "Forest path" },
    { id: "product1", src: "items/product1.jpg", label: "Watch" },
    { id: "product2", src: "items/product2.jpg", label: "Sunglasses" },
  ];

  const LOOKS = [
    { id: "cinema", name: "Cinema", className: "look-cinema" },
    { id: "vivid", name: "Vivid", className: "look-vivid" },
    { id: "soft", name: "Soft Film", className: "look-soft" },
    { id: "neon", name: "Night Neon", className: "look-neon" },
  ];

  const CUTS = ["cut-a", "cut-b", "cut-c", "cut-d", "cut-e", "cut-f"];
  const SOFT_WARN_PHOTOS = 80;
  const XFADE = 0.62;
  const SOFT_FLASH = true; // warm light-leak + smear

  /** Session library: demos + camera-roll object URLs */
  const libraryItems = DEMO_ITEMS.map((i) => ({ ...i }));

  const state = {
    /** Ordered selection of photo ids */
    selectedIds: [],
    lookId: "cinema",
    playing: false,
    t0: 0,
    elapsed: 0,
    /** Index of current photo segment */
    segmentIndex: -1,
    /** Which stage layer is active: "A" | "B" */
    activeLayer: "A",
    duration: 6,
    segmentLen: 6,
    raf: null,
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function getItem(id) {
    return libraryItems.find((i) => i.id === id);
  }

  function getSelectedPhotos() {
    return state.selectedIds.map(getItem).filter(Boolean);
  }

  function getLook() {
    return LOOKS.find((l) => l.id === state.lookId) || LOOKS[0];
  }

  function computeDuration(n) {
    // Punchy ~2.2s/photo — Vids-style fast morph bursts
    return Math.max(6, n * 2.2);
  }

  function formatTime(t) {
    const s = Math.max(0, t);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ":" + String(sec).padStart(2, "0");
  }

  /* ---------- Routing ---------- */
  function route() {
    const hash = (location.hash || "#home").replace(/^#/, "") || "home";
    const name = hash.split("?")[0];
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.route === name));

    if (name === "library") renderLibrary();
    if (name === "style") {
      if (!state.selectedIds.length) {
        location.hash = "#library";
        return;
      }
      renderStyle();
    }
    if (name === "play") {
      if (!state.selectedIds.length) {
        location.hash = "#library";
        return;
      }
      startPlayback();
    } else {
      stopPlayback();
    }
    if (name === "share") {
      if (!state.selectedIds.length) {
        location.hash = "#library";
        return;
      }
      $("#play").classList.add("active");
      openShareSheet();
    } else {
      closeShareSheet(false);
    }
  }

  function go(hash) {
    location.hash = hash.startsWith("#") ? hash : "#" + hash;
  }

  /* ---------- Library (multi-select with order) ---------- */
  function selectionIndex(id) {
    return state.selectedIds.indexOf(id);
  }

  function toggleSelect(id) {
    const idx = selectionIndex(id);
    if (idx >= 0) {
      state.selectedIds.splice(idx, 1);
    } else {
      state.selectedIds.push(id);
      if (state.selectedIds.length > SOFT_WARN_PHOTOS) {
        toast("Large reel — may use more memory");
      }
    }
    renderLibrary();
  }

  function renderLibrary() {
    const grid = $("#photoGrid");
    grid.innerHTML = libraryItems
      .map((item) => {
        const ord = selectionIndex(item.id);
        const selected = ord >= 0;
        return `
      <button type="button" class="photo-tile${selected ? " selected" : ""}" data-photo="${item.id}" aria-label="${item.label}${selected ? ", selected " + (ord + 1) : ""}">
        <img src="${item.src}" alt="${item.label}" loading="lazy" />
        <span class="seq-badge">${selected ? ord + 1 : ""}</span>
      </button>`;
      })
      .join("");

    $$(".photo-tile", grid).forEach((tile) => {
      tile.addEventListener("click", () => toggleSelect(tile.dataset.photo));
    });

    const n = state.selectedIds.length;
    $("#continueStyle").disabled = n < 1;
    const countEl = $("#selectionCount");
    if (countEl) {
      countEl.textContent = n + " photo" + (n === 1 ? "" : "s") + " selected";
    }
  }

  function isImageFile(file) {
    if (!file) return false;
    const t = (file.type || "").toLowerCase();
    if (t.startsWith("image/")) return true;
    // iOS Photos often sends empty type or HEIC/HEIF
    if (t === "application/octet-stream" || !t) {
      const name = file.name || "";
      if (/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif)$/i.test(name)) return true;
      // Camera / library pick with accept=image/* — trust the picker
      return true;
    }
    return false;
  }

  function appendFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return 0;
    let added = 0;
    let skipped = 0;
    list.forEach((file, i) => {
      if (!isImageFile(file)) {
        skipped++;
        return;
      }
      const id = "roll-" + Date.now() + "-" + i + "-" + Math.random().toString(36).slice(2, 7);
      const url = URL.createObjectURL(file);
      libraryItems.push({
        id,
        src: url,
        label: (file.name || "Photo").replace(/\.[^.]+$/, "") || "Photo",
      });
      state.selectedIds.push(id);
      added++;
    });
    if (added) {
      toast(added + " photo" + (added === 1 ? "" : "s") + " ready");
      if (state.selectedIds.length > SOFT_WARN_PHOTOS) {
        setTimeout(() => toast("Large reel — may use more memory"), 2300);
      }
      renderLibrary();
    } else if (skipped) {
      toast("Could not read those photos — try JPG/PNG");
    }
    return added;
  }

  function onFilePick(e) {
    const n = appendFiles(e.target.files);
    e.target.value = "";
    if (!n && e.target.files && e.target.files.length === 0) {
      // user cancelled — silent
    }
  }

  /* ---------- Style ---------- */
  function renderStyle() {
    const photos = getSelectedPhotos();
    const look = getLook();
    const first = photos[0];
    const img = $("#stylePreview");
    img.src = first.src;
    img.className = look.className;
    $("#lookLabel").textContent = look.name;

    const strip = $("#previewStrip");
    strip.innerHTML = photos
      .map(
        (p, i) => `
      <div class="strip-thumb${i === 0 ? " primary" : ""}" title="${p.label}">
        <img src="${p.src}" alt="${p.label}" />
        <span class="strip-n">${i + 1}</span>
      </div>`
      )
      .join("");

    const chips = $("#lookChips");
    chips.innerHTML = LOOKS.map(
      (l) => `
      <button type="button" class="chip${l.id === state.lookId ? " active" : ""}" data-look="${l.id}" role="option" aria-selected="${l.id === state.lookId}">
        ${l.name}
      </button>`
    ).join("");

    $$(".chip", chips).forEach((chip) => {
      chip.addEventListener("click", () => {
        state.lookId = chip.dataset.look;
        renderStyle();
      });
    });
  }

  /* ---------- Playback: continuous motion across photos ---------- */
  function layerEl(which) {
    return which === "A" ? $("#stageImgA") : $("#stageImgB");
  }

  function clearCutClasses(el) {
    CUTS.forEach((c) => el.classList.remove(c));
    el.classList.remove("anim-idle");
  }

  function applyCutOn(el, cutIndex) {
    const look = getLook();
    const vis = ["on", "off", "xfading-in", "xfading-out"].filter((c) =>
      el.classList.contains(c)
    );
    const delay = el.style.animationDelay || "";
    // Strip cut classes, keep visibility; reflow; then start cut so anim restarts
    el.className = ["stage-img", look.className].concat(vis).join(" ");
    el.style.animationDelay = "";
    void el.offsetWidth;
    el.classList.add(CUTS[cutIndex % CUTS.length]);
    if (delay) el.style.animationDelay = delay;
  }

  function softFlash() {
    if (!SOFT_FLASH) return;
    const flash = $("#flash");
    const smear = $("#smear");
    flash.classList.remove("bang");
    void flash.offsetWidth;
    flash.classList.add("bang");
    if (smear) {
      smear.classList.remove("bang");
      void smear.offsetWidth;
      smear.classList.add("bang");
    }
  }

  /**
   * Show photo at segmentIndex on the inactive layer with the next cut
   * in the global cycle, then crossfade. Cut index cycles across the
   * whole reel so motion trajectory continues (cut-b → cut-c, etc.).
   */
  function showSegment(segmentIndex, withXfade) {
    const photos = getSelectedPhotos();
    if (!photos.length) return;
    const n = photos.length;
    const idx = ((segmentIndex % n) + n) % n;
    const photo = photos[idx];
    const cutIndex = idx % CUTS.length; // cycle cuts across photos

    const incomingWhich = state.activeLayer === "A" ? "B" : "A";
    const outgoing = layerEl(state.activeLayer);
    const incoming = layerEl(incomingWhich);

    document.documentElement.style.setProperty("--cut-dur", state.segmentLen + "s");
    document.documentElement.style.setProperty("--xfade", XFADE + "s");

    incoming.src = photo.src;
    incoming.alt = photo.label || "Reel";
    incoming.style.animationDelay = "";

    // Prepare incoming under outgoing; start its continuing cut
    incoming.classList.remove("on", "xfading-in", "xfading-out");
    incoming.classList.add("off");
    applyCutOn(incoming, cutIndex);

    if (!withXfade || state.segmentIndex < 0) {
      // First frame / hard seek: show incoming immediately
      outgoing.classList.remove("on", "xfading-in", "xfading-out");
      outgoing.classList.add("off");
      incoming.classList.remove("off", "xfading-out");
      incoming.classList.add("on");
      state.activeLayer = incomingWhich;
      state.segmentIndex = idx;
      return;
    }

    // Crossfade: outgoing keeps finishing its motion; incoming already animating
    outgoing.classList.remove("xfading-in");
    outgoing.classList.add("xfading-out");
    incoming.classList.remove("off", "xfading-out");
    incoming.classList.add("xfading-in", "on");
    softFlash();

    // After fade, park outgoing
    clearTimeout(showSegment._t);
    showSegment._t = setTimeout(() => {
      outgoing.classList.remove("on", "xfading-out", "xfading-in");
      outgoing.classList.add("off");
      incoming.classList.remove("xfading-in");
      incoming.classList.add("on");
    }, XFADE * 1000);

    state.activeLayer = incomingWhich;
    state.segmentIndex = idx;
  }

  function updateScrubber(t) {
    const scrub = $("#scrubber");
    if (document.activeElement !== scrub) scrub.value = String(t);
    $("#timeNow").textContent = formatTime(t);
  }

  function tick(now) {
    if (!state.playing) return;
    let elapsed = (now - state.t0) / 1000;
    if (elapsed >= state.duration) {
      // Loop whole reel
      state.t0 = now;
      elapsed = 0;
      state.elapsed = 0;
      state.segmentIndex = -1;
      showSegment(0, false);
      updateScrubber(0);
    } else {
      state.elapsed = elapsed;
      const nPhotos = getSelectedPhotos().length;
      // Start crossfade before segment ends so photos morph mid-motion
      const lead = Math.min(XFADE * 0.55, state.segmentLen * 0.4);
      let nextSeg = 0;
      for (let i = 0; i < nPhotos; i++) {
        const start = i * state.segmentLen;
        if (elapsed + lead >= start) nextSeg = i;
      }
      nextSeg = Math.min(nPhotos - 1, nextSeg);
      if (nextSeg !== state.segmentIndex) {
        showSegment(nextSeg, true);
      }
      updateScrubber(elapsed);
    }
    state.raf = requestAnimationFrame(tick);
  }

  function startPlayback() {
    const photos = getSelectedPhotos();
    const look = getLook();
    const n = photos.length;
    state.duration = computeDuration(n);
    state.segmentLen = state.duration / n;

    document.documentElement.style.setProperty("--cut-dur", state.segmentLen + "s");
    document.documentElement.style.setProperty("--xfade", XFADE + "s");

    const scrub = $("#scrubber");
    scrub.max = String(state.duration);
    $("#timeEnd").textContent = formatTime(state.duration);
    $("#playLookBadge").textContent =
      n + " photo" + (n === 1 ? "" : "s") + " · " + look.name;

    // Reset both layers
    ["A", "B"].forEach((w) => {
      const el = layerEl(w);
      el.className = "stage-img off " + look.className;
      el.removeAttribute("src");
    });
    state.activeLayer = "A";

    stopPlayback();
    state.playing = true;
    state.elapsed = 0;
    state.segmentIndex = -1;
    showSegment(0, false);
    state.t0 = performance.now();
    state.raf = requestAnimationFrame(tick);
  }

  function stopPlayback() {
    state.playing = false;
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
    clearTimeout(showSegment._t);
  }

  function seekTo(t) {
    const clamped = Math.min(state.duration, Math.max(0, Number(t)));
    state.elapsed = clamped;
    state.t0 = performance.now() - clamped * 1000;
    const seg = Math.min(
      getSelectedPhotos().length - 1,
      Math.floor(clamped / state.segmentLen)
    );
    state.segmentIndex = -1; // force reshow without relying on stale layer
    showSegment(seg, false);
    // Restart cut mid-segment by setting negative delay via animation-delay
    const localT = clamped - seg * state.segmentLen;
    const active = layerEl(state.activeLayer);
    active.style.animationDelay = -localT + "s";
    void active.offsetWidth;
    // Re-apply cut so delay takes effect
    applyCutOn(active, seg % CUTS.length);
    active.style.animationDelay = -localT + "s";
    updateScrubber(clamped);
  }

  /* ---------- Share sheet ---------- */
  function openShareSheet() {
    $("#sheetBackdrop").classList.add("open");
    $("#shareSheet").classList.add("open");
    $("#shareSheet").setAttribute("aria-hidden", "false");
  }

  function closeShareSheet(navBack) {
    $("#sheetBackdrop").classList.remove("open");
    $("#shareSheet").classList.remove("open");
    $("#shareSheet").setAttribute("aria-hidden", "true");
    if (navBack && location.hash === "#share") {
      history.replaceState(null, "", "#play");
    }
  }

  async function shareNative(label) {
    const photos = getSelectedPhotos();
    const look = getLook();
    const n = photos.length;
    const text =
      "Tapreel · " +
      n +
      " photo" +
      (n === 1 ? "" : "s") +
      " · " +
      look.name +
      " · " +
      formatTime(computeDuration(n)) +
      " reel";
    try {
      if (navigator.share) {
        let files;
        try {
          const res = await fetch(photos[0].src);
          const blob = await res.blob();
          const file = new File([blob], "tapreel.jpg", { type: blob.type || "image/jpeg" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            files = [file];
          }
        } catch (_) { /* ignore */ }

        if (files) {
          await navigator.share({ title: "Tapreel", text, files });
        } else {
          await navigator.share({
            title: "Tapreel",
            text,
            url: location.href.split("#")[0] + "#play",
          });
        }
        toast("Shared to " + label);
      } else {
        toast("Open " + label + " and upload your reel");
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      toast("Open " + label + " and upload your reel");
    }
  }

  async function saveImage() {
    const photos = getSelectedPhotos();
    try {
      const res = await fetch(photos[0].src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tapreel-" + getLook().id + ".jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Saved");
    } catch (_) {
      window.open(photos[0].src, "_blank");
      toast("Opened photo to save");
    }
  }

  /* ---------- Make reel (instant ≤400ms) ---------- */
  function makeReel() {
    const btn = $("#makeReel");
    btn.disabled = true;
    btn.textContent = "Making…";
    const delay = 180 + Math.random() * 180;
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Make reel";
      go("play");
    }, delay);
  }

  /* ---------- Init ---------- */
  function bind() {
    $$("[data-go]").forEach((el) => {
      el.addEventListener("click", () => go(el.dataset.go));
    });

    $("#continueStyle").addEventListener("click", () => {
      if (state.selectedIds.length >= 1) go("style");
    });

    $("#makeReel").addEventListener("click", makeReel);

    $("#btnShare").addEventListener("click", () => go("share"));

    $("#sheetBackdrop").addEventListener("click", () => {
      closeShareSheet(true);
      if (location.hash === "#share") go("play");
    });

    $("#shareTikTok").addEventListener("click", () => shareNative("TikTok"));
    $("#shareReels").addEventListener("click", () => shareNative("Reels"));
    $("#shareSave").addEventListener("click", saveImage);

    const libInput = $("#fileLibrary");
    const camInput = $("#fileCamera");
    if (libInput) libInput.addEventListener("change", onFilePick);
    if (camInput) camInput.addEventListener("change", onFilePick);

    const scrub = $("#scrubber");
    scrub.addEventListener("input", () => {
      seekTo(scrub.value);
    });
    scrub.addEventListener("change", () => {
      if (state.playing) {
        state.t0 = performance.now() - Number(scrub.value) * 1000;
      }
      // Clear sticky negative delay after scrub
      const active = layerEl(state.activeLayer);
      active.style.animationDelay = "";
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("sw.js?v=5")
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch(() => {});
  }

  bind();
  window.addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#home";
  else route();
})();
