(function () {
  "use strict";

  const ITEMS = [
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

  const CUTS = ["cut-a", "cut-b", "cut-c", "cut-d"];
  const DURATION = 6;
  const CUT_LEN = 1.5;

  const state = {
    photoId: null,
    lookId: "cinema",
    playing: false,
    t0: 0,
    elapsed: 0,
    cutIndex: 0,
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

  function getPhoto() {
    return ITEMS.find((i) => i.id === state.photoId) || ITEMS[0];
  }

  function getLook() {
    return LOOKS.find((l) => l.id === state.lookId) || LOOKS[0];
  }

  /* ---------- Routing ---------- */
  function route() {
    const hash = (location.hash || "#home").replace(/^#/, "") || "home";
    const name = hash.split("?")[0];
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.route === name));

    if (name === "library") renderLibrary();
    if (name === "style") {
      if (!state.photoId) {
        location.hash = "#library";
        return;
      }
      renderStyle();
    }
    if (name === "play") {
      if (!state.photoId) {
        location.hash = "#library";
        return;
      }
      startPlayback();
    } else {
      stopPlayback();
    }
    if (name === "share") {
      if (!state.photoId) {
        location.hash = "#library";
        return;
      }
      // Keep play visible under sheet
      $("#play").classList.add("active");
      openShareSheet();
    } else {
      closeShareSheet(false);
    }
  }

  function go(hash) {
    location.hash = hash.startsWith("#") ? hash : "#" + hash;
  }

  /* ---------- Library ---------- */
  function renderLibrary() {
    const grid = $("#photoGrid");
    grid.innerHTML = ITEMS.map(
      (item) => `
      <button type="button" class="photo-tile${state.photoId === item.id ? " selected" : ""}" data-photo="${item.id}" aria-label="${item.label}">
        <img src="${item.src}" alt="${item.label}" loading="lazy" />
        <span class="check">✓</span>
      </button>`
    ).join("");

    $$(".photo-tile", grid).forEach((tile) => {
      tile.addEventListener("click", () => {
        state.photoId = tile.dataset.photo;
        renderLibrary();
        $("#continueStyle").disabled = false;
      });
    });

    $("#continueStyle").disabled = !state.photoId;
  }

  /* ---------- Style ---------- */
  function renderStyle() {
    const photo = getPhoto();
    const look = getLook();
    const img = $("#stylePreview");
    img.src = photo.src;
    img.className = look.className;
    $("#lookLabel").textContent = look.name;

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

  /* ---------- Playback (listingCuts-style) ---------- */
  function applyCut(index) {
    const img = $("#stageImg");
    const look = getLook();
    CUTS.forEach((c) => img.classList.remove(c));
    img.classList.remove("anim-idle");
    // Force reflow so animation restarts
    void img.offsetWidth;
    img.className = "stage-img " + look.className + " " + CUTS[index % CUTS.length];
    const flash = $("#flash");
    flash.classList.remove("bang");
    void flash.offsetWidth;
    flash.classList.add("bang");
    state.cutIndex = index % CUTS.length;
  }

  function formatTime(t) {
    const s = Math.min(DURATION, Math.max(0, t));
    return "0:0" + Math.floor(s);
  }

  function updateScrubber(t) {
    const scrub = $("#scrubber");
    if (document.activeElement !== scrub) scrub.value = String(t);
    $("#timeNow").textContent = formatTime(t);
  }

  function tick(now) {
    if (!state.playing) return;
    const elapsed = (now - state.t0) / 1000;
    if (elapsed >= DURATION) {
      // Loop
      state.t0 = now;
      state.elapsed = 0;
      applyCut(0);
      updateScrubber(0);
    } else {
      state.elapsed = elapsed;
      const cut = Math.floor(elapsed / CUT_LEN);
      if (cut !== state.cutIndex) applyCut(cut);
      updateScrubber(elapsed);
    }
    state.raf = requestAnimationFrame(tick);
  }

  function startPlayback() {
    const photo = getPhoto();
    const look = getLook();
    const img = $("#stageImg");
    img.src = photo.src;
    $("#playLookBadge").textContent = look.name;

    stopPlayback();
    state.playing = true;
    state.elapsed = 0;
    state.cutIndex = -1;
    applyCut(0);
    state.t0 = performance.now();
    state.raf = requestAnimationFrame(tick);
  }

  function stopPlayback() {
    state.playing = false;
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = null;
    }
  }

  function seekTo(t) {
    const clamped = Math.min(DURATION, Math.max(0, Number(t)));
    state.elapsed = clamped;
    state.t0 = performance.now() - clamped * 1000;
    applyCut(Math.floor(clamped / CUT_LEN));
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
    const photo = getPhoto();
    const look = getLook();
    const text = `Tapreel · ${look.name} · 6s reel`;
    try {
      if (navigator.share) {
        // Prefer sharing the image file when possible
        let files;
        try {
          const res = await fetch(photo.src);
          const blob = await res.blob();
          const file = new File([blob], "tapreel.jpg", { type: blob.type || "image/jpeg" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            files = [file];
          }
        } catch (_) { /* ignore */ }

        if (files) {
          await navigator.share({ title: "Tapreel", text, files });
        } else {
          await navigator.share({ title: "Tapreel", text, url: location.href.split("#")[0] + "#play" });
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
    const photo = getPhoto();
    try {
      const res = await fetch(photo.src);
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
      // Fallback: open image
      window.open(photo.src, "_blank");
      toast("Opened photo to save");
    }
  }

  /* ---------- Make reel (instant ≤400ms) ---------- */
  function makeReel() {
    const btn = $("#makeReel");
    btn.disabled = true;
    btn.textContent = "Making…";
    const delay = 180 + Math.random() * 180; // ~180–360ms
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
      if (state.photoId) go("style");
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

    const scrub = $("#scrubber");
    scrub.addEventListener("input", () => {
      seekTo(scrub.value);
    });
    scrub.addEventListener("change", () => {
      if (state.playing) {
        state.t0 = performance.now() - Number(scrub.value) * 1000;
      }
    });

    // Default first photo selected for snappy demos
    state.photoId = ITEMS[0].id;
  }

  // Service worker-lite: register empty if present (optional)
  if ("serviceWorker" in navigator) {
    // Minimal offline shell via cache on first visit — register only if sw.js exists
    fetch("sw.js", { method: "HEAD" })
      .then((r) => {
        if (r.ok) navigator.serviceWorker.register("sw.js").catch(() => {});
      })
      .catch(() => {});
  }

  bind();
  window.addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#home";
  else route();
})();
