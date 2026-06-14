/* ============================================================
   TOP LADS — Sport-luxe scroll experience
   ============================================================ */
gsap.registerPlugin(ScrollTrigger);

/* ---------- Lenis smooth scroll (cinematic) ---------- */
let lenis = null;
if (typeof Lenis !== "undefined") {
  try {
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.5,
      lerp: 0.10,
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } catch (e) {
    console.warn("Lenis init failed", e);
  }
}

/* ============================================================
   SIDE NAV — golf ball rolls along a wavy SVG putt-line
   ============================================================ */
const sideNav     = document.querySelector(".side-nav");
const snSvg       = document.querySelector(".sn-svg");
const snPathBg    = document.getElementById("snPathBg");
const snPathFill  = document.getElementById("snPathFill");
const snMarkerGrp = document.getElementById("snMarkerGroup");
const snLabels    = Array.from(document.querySelectorAll(".sn-labels li"));
const golfBall    = document.getElementById("golfBall");
const ballShadow  = document.getElementById("ballShadow");
const ballFlag    = document.getElementById("ballFlag");
let   flagShown   = false;
const FLAG_THRESHOLD = 0.998;   // effectively at 100%; 99% hides it

/* Section markers placed along the path at these % offsets */
const NAV_MARKERS = [
  { t: 0.00, target: "#hero" },
  { t: 0.18, target: "#scrub" },
  { t: 0.62, target: "#events" },
  { t: 0.76, target: "#membership" },
  { t: 0.88, target: "#sponsors" },
  { t: 0.97, target: "#contact" },
];

/* Set up stroke-dasharray on the gradient-fill path so we can grow it */
const PATH_TOTAL = snPathFill.getTotalLength();
snPathFill.style.strokeDasharray  = PATH_TOTAL;
snPathFill.style.strokeDashoffset = PATH_TOTAL;

/* Create SVG marker circles + position labels on first paint */
function buildMarkers() {
  snMarkerGrp.innerHTML = "";
  NAV_MARKERS.forEach((m, i) => {
    const pt = snPathBg.getPointAtLength(PATH_TOTAL * m.t);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", pt.x);
    c.setAttribute("cy", pt.y);
    c.setAttribute("r", 3.2);
    c.setAttribute("class", "sn-marker");
    c.dataset.idx = i;
    c.addEventListener("click", () => {
      const tgt = document.querySelector(m.target);
      if (!tgt) return;
      if (lenis) lenis.scrollTo(tgt, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else tgt.scrollIntoView({ behavior: "smooth" });
    });
    snMarkerGrp.appendChild(c);

    /* Position the matching hover label in pixel space */
    positionLabel(i, pt);
  });
}

/* Convert an SVG-viewBox point to pixel position relative to side-nav */
function viewBoxToPx(pt) {
  const rect = snSvg.getBoundingClientRect();
  return {
    x: (pt.x / 80)  * rect.width,
    y: (pt.y / 700) * rect.height,
  };
}
function positionLabel(i, viewBoxPt) {
  const li = snLabels[i];
  if (!li) return;
  const px = viewBoxToPx(viewBoxPt);
  li.style.left = (px.x + 24) + "px";
  li.style.top  = px.y + "px";
}

/* Reposition markers + labels on resize (rebuild label positions, SVG path stays) */
function relayoutNav() {
  NAV_MARKERS.forEach((m, i) => {
    const pt = snPathBg.getPointAtLength(PATH_TOTAL * m.t);
    positionLabel(i, pt);
  });
}
window.addEventListener("resize", relayoutNav);

buildMarkers();

/* Ball position + spin state */
let ballX = 0, ballY = 0;
let ballRotation = 0;
let spinVelocity = 0;       // current rotational velocity (decays)
let lastScrollY = 0;        // for native-scroll fallback velocity tracking
let lastScrollT = performance.now();

/* Compute position & active marker (no transform applied here) */
function updateSideNav(scrollY) {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const p = Math.max(0, Math.min(1, scrollY / maxScroll));

  // Grow the gradient-fill path
  snPathFill.style.strokeDashoffset = (PATH_TOTAL * (1 - p)).toFixed(2);

  // Compute ball XY along the path (transform applied in rAF loop)
  const pt = snPathBg.getPointAtLength(PATH_TOTAL * p);
  const px = viewBoxToPx(pt);
  ballX = px.x;
  ballY = px.y;

  // Flag pop at the very end
  const shouldShow = p >= FLAG_THRESHOLD;
  if (shouldShow !== flagShown) {
    flagShown = shouldShow;
    ballFlag.classList.toggle("show", shouldShow);
  }

  // Active marker
  const viewportMid = window.innerHeight * 0.4;
  let activeIdx = 0, minDist = Infinity;
  NAV_MARKERS.forEach((m, i) => {
    const tgt = document.querySelector(m.target);
    if (!tgt) return;
    const top = tgt.getBoundingClientRect().top;
    const dist = Math.abs(top - viewportMid);
    if (dist < minDist) { minDist = dist; activeIdx = i; }
  });
  Array.from(snMarkerGrp.children).forEach((el, i) => {
    el.classList.toggle("active", i === activeIdx);
  });
  snLabels.forEach((li, i) => li.classList.toggle("active", i === activeIdx));
}

/* Capture scroll velocity each tick — Lenis or native */
if (lenis) {
  lenis.on("scroll", ({ scroll, velocity }) => {
    updateSideNav(scroll);
    // Lenis velocity is px/ms. Scale to a spin force.
    spinVelocity = (velocity || 0) * 18;
  });
} else {
  window.addEventListener("scroll", () => {
    const now = performance.now();
    const dt = Math.max(1, now - lastScrollT);
    const dy = window.scrollY - lastScrollY;
    spinVelocity = (dy / dt) * 18;
    lastScrollY = window.scrollY;
    lastScrollT = now;
    updateSideNav(window.scrollY);
  });
}

/* rAF loop: apply position + rotation. Spin velocity decays each frame
   so when scrolling stops the ball comes to rest naturally. */
function ballRenderLoop() {
  spinVelocity *= 0.86;                 // friction
  if (Math.abs(spinVelocity) < 0.01) spinVelocity = 0;
  ballRotation += spinVelocity;

  // Ball: rotates
  golfBall.style.transform =
    `translate(${ballX}px, ${ballY}px) rotate(${ballRotation.toFixed(2)}deg)`;

  // Shadow: follows the ball but NEVER rotates; squishes a touch on fast spin
  const speed = Math.min(Math.abs(spinVelocity) / 20, 1);
  const sx = 1 + speed * 0.25;
  const sy = 1 - speed * 0.20;
  const op = 0.75 - speed * 0.35;
  ballShadow.style.transform =
    `translate(${ballX}px, ${ballY}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
  ballShadow.style.opacity = op.toFixed(3);

  // Flag follows the ball (no rotation)
  ballFlag.style.transform = `translate(${ballX}px, ${ballY}px)`;

  requestAnimationFrame(ballRenderLoop);
}
requestAnimationFrame(ballRenderLoop);

window.addEventListener("load", () => { relayoutNav(); updateSideNav(window.scrollY); });

/* ============================================================
   HERO INTRO
   ============================================================ */
window.addEventListener("load", () => {
  const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
  gsap.set(".hero-title .word", { yPercent: 110 });
  tl.to(".hero-title .word", { yPercent: 0, duration: 1.35, stagger: 0.14 }, 0.1);
  tl.from(".eyebrow", { y: 20, opacity: 0, duration: 1 }, 0.2);
  tl.from(".hero-sub", { y: 20, opacity: 0, duration: 1 }, 0.6);
  tl.from(".hero-cta-row > *", { y: 20, opacity: 0, duration: 1, stagger: 0.08 }, 0.8);
  tl.from(".nav-inner > *", { y: -20, opacity: 0, duration: 1, stagger: 0.08 }, 0);
  tl.from(".hero-scroll-cue", { opacity: 0, duration: 1 }, 1.2);
});

/* Mouse parallax intentionally removed — caused the right-edge gap
   on the scrub stage. The frame canvas now fills the viewport. */

/* ============================================================
   MOBILE / LOW-MEMORY DETECTION
   361 ImageBitmaps × ~8MB each blows past iOS Safari's per-tab
   memory ceiling. On mobile we swap the canvas for a regular
   <video> element that decodes one frame at a time.
   ============================================================ */
const IS_MOBILE =
  window.matchMedia("(max-width: 900px)").matches ||
  window.matchMedia("(pointer: coarse)").matches ||
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/* ============================================================
   SCROLL-DRIVEN IMAGE SEQUENCE (desktop only)
   ============================================================ */
const TOTAL_FRAMES = 361;
const FRAME_PATH   = (i) => `frames/f_${String(i).padStart(3, "0")}.jpg`;

const canvas       = document.getElementById("scrubCanvas");
const ctx          = canvas.getContext("2d", { alpha: false });
const stage        = document.getElementById("videoStage");
const canvasEl     = document.querySelector(".video-wrap canvas");
const vignetteEl   = document.querySelector(".video-vignette");
const tintEl       = document.querySelector(".video-tint");
const preloader    = document.getElementById("preloader");
const plFill       = document.getElementById("plFill");
const plPct        = document.getElementById("plPct");

/* Scrub text choreography */
const scrubWords = Array.from(document.querySelectorAll(".sw"));

function updateScrubText(p) {
  // Subtle velocity tilt during hold — keep small because the
  // extruded text-shadow is a 2D projection and big rotations skew it.
  const tilt = Math.max(-6, Math.min(6, spinVelocity * 0.5));

  scrubWords.forEach((w, idx) => {
    const start = parseFloat(w.dataset.start);
    const end   = parseFloat(w.dataset.end);
    const range = end - start;

    // Each word gets a different rotation axis flavor for variety
    const axisY = idx === 1;  // middle word swivels on Y, others tilt on X

    let opacity = 0, scale = 0.92, y = 60, z = -200, rot = -30, blur = 8;

    if (p < start) {
      opacity = 0; scale = 0.88; y = 60;  z = -240; rot = -32; blur = 10;
    } else if (p > end) {
      opacity = 0; scale = 1.10; y = -60; z = -320; rot = 32;  blur = 10;
    } else {
      const seg = (p - start) / range; // 0..1 within active range
      if (seg < 0.25) {
        // ENTER — comes in from back, rotated
        const k = seg / 0.25;
        opacity = k;
        scale   = 0.88 + k * 0.12;
        y       = 60 - k * 60;
        z       = -240 + k * 240;
        rot     = -32 + k * 32;          // rotates up to flat
        blur    = 10 - k * 10;
      } else if (seg > 0.75) {
        // EXIT — tilts forward, falls back into space
        const k = (seg - 0.75) / 0.25;
        opacity = 1 - k;
        scale   = 1 + k * 0.10;
        y       = -k * 50;
        z       = -k * 320;
        rot     = k * 32;
        blur    = k * 8;
      } else {
        // HOLD — flat on, with velocity tilt
        opacity = 1; scale = 1; y = 0; z = 0; blur = 0;
        rot = tilt;
      }
    }

    const rotAxis = axisY ? `rotateY(${rot.toFixed(2)}deg)` : `rotateX(${rot.toFixed(2)}deg)`;
    w.style.opacity   = opacity.toFixed(3);
    w.style.transform =
      `translate(-50%, -50%) translate3d(0, ${y.toFixed(1)}px, ${z.toFixed(1)}px) ${rotAxis} scale(${scale.toFixed(3)})`;
    w.style.filter    = `blur(${blur.toFixed(2)}px)`;
  });
}

const bitmaps = new Array(TOTAL_FRAMES);
let loaded = 0;
let firstFrameReady = false;
let allFramesReady = false;

/* Canvas sizing — DPR-aware (capped at 1.75 for perf) */
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width  = w + "px";
  canvas.style.height = h + "px";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // re-draw last shown frame after resize
  drawFrame(currentDrawnIdx);
}
window.addEventListener("resize", resizeCanvas);

/* Draw a single frame (cover-fit) */
let currentDrawnIdx = 0;
function drawFrame(idx) {
  idx = Math.max(0, Math.min(TOTAL_FRAMES - 1, idx | 0));
  const bmp = bitmaps[idx];
  if (!bmp) return;
  const cw = canvas.width, ch = canvas.height;
  const iw = bmp.width, ih = bmp.height;
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale, dh = ih * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.drawImage(bmp, dx, dy, dw, dh);
  currentDrawnIdx = idx;
}

/* Preload — fetch + decode to ImageBitmap (no draw-time decode lag) */
async function loadFrame(i) {
  try {
    const res = await fetch(FRAME_PATH(i + 1));
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    bitmaps[i] = bmp;
  } catch (e) {
    // Fallback: HTMLImageElement
    await new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => { bitmaps[i] = img; resolve(); };
      img.onerror = resolve;
      img.src = FRAME_PATH(i + 1);
    });
  }
  loaded++;
  const pct = Math.round((loaded / TOTAL_FRAMES) * 100);
  plFill.style.width = pct + "%";
  plPct.textContent = String(pct).padStart(2, "0") + "%";

  if (i === 0 && bitmaps[0] && !firstFrameReady) {
    firstFrameReady = true;
    resizeCanvas();
    drawFrame(0);
  }
  if (loaded >= Math.ceil(TOTAL_FRAMES * 0.5)) {
    preloader.classList.add("gone");
  }
  if (loaded === TOTAL_FRAMES) {
    allFramesReady = true;
    ScrollTrigger.refresh();
  }
}
async function preloadAllFrames() {
  // Parallel with concurrency limit (6 at a time)
  const CONCURRENCY = 6;
  let next = 0;
  async function worker() {
    while (next < TOTAL_FRAMES) {
      const i = next++;
      await loadFrame(i);
    }
  }
  const workers = Array.from({ length: CONCURRENCY }, worker);
  await Promise.all(workers);
}

/* ----------------- MOBILE PATH ----------------- */
function setupMobileVideo() {
  // Replace the canvas with a looping <video> so iOS Safari doesn't OOM
  const wrap = document.querySelector(".video-wrap");
  if (canvas && canvas.parentNode === wrap) wrap.removeChild(canvas);

  const v = document.createElement("video");
  v.src = "Toplads_BG_scrub.mp4";
  v.muted = true;
  v.loop = true;
  v.autoplay = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "true");
  v.setAttribute("webkit-playsinline", "true");
  v.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
  wrap.appendChild(v);
  v.play().catch(() => {});

  // Skip the preloader immediately
  const pl = document.getElementById("preloader");
  if (pl) pl.classList.add("gone");

  // Shorten the scroll stage so mobile users aren't trapped in an empty 400vh
  const scrub = document.getElementById("scrub");
  if (scrub) scrub.style.height = "150vh";

  firstFrameReady = true;
  allFramesReady  = true;
}

if (IS_MOBILE) {
  setupMobileVideo();
} else {
  preloadAllFrames();
}

/* ============================================================
   Render loop — interpolates currentIdx toward targetIdx every
   frame so the scrub stays smooth even between scroll ticks.
   Desktop only; mobile uses a plain <video> element.
   ============================================================ */
let targetIdx  = 0;
let currentIdx = 0;
function renderLoop() {
  if (firstFrameReady && !IS_MOBILE) {
    currentIdx += (targetIdx - currentIdx) * 0.25;
    const idx = Math.round(currentIdx);
    if (idx !== currentDrawnIdx) drawFrame(idx);
  }
  requestAnimationFrame(renderLoop);
}
if (!IS_MOBILE) requestAnimationFrame(renderLoop);

/* Scroll → target frame + reveal arc */
ScrollTrigger.create({
  trigger: "#scrollStage",
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    const p = self.progress;

    // Target frame is set every scroll update; render loop catches up
    targetIdx = p * (TOTAL_FRAMES - 1);

    /* Color reveal arc — desktop canvas only */
    if (!IS_MOBILE && canvasEl) {
      let brightness;
      if (p < 0.55)      brightness = 0.85;
      else if (p < 0.95) brightness = 0.85 + ((p - 0.55) / 0.40) * 0.15;
      else               brightness = 1.0;
      canvasEl.style.filter = `brightness(${brightness.toFixed(3)}) saturate(${(1.05 + p * 0.05).toFixed(3)})`;
    }

    const vigOp = p < 0.5 ? 1 : Math.max(0, 1 - (p - 0.5) / 0.35);
    vignetteEl.style.opacity = vigOp.toFixed(3);
    tintEl.style.opacity = vigOp.toFixed(3);

    document.body.classList.toggle("is-revealing", p > 0.82);

    // Expose progress to other modules (Three.js 3D scrub text)
    window.APP_SCROLL_P = p;
    window.APP_SCROLL_VEL = spinVelocity;

    // CSS-based scrub text (fallback while 3D loads)
    updateScrubText(p);
  },
});

/* Fade hero title out as soon as scroll starts so the video reads clean */
gsap.to(".hero-inner", {
  opacity: 0,
  y: -40,
  ease: "power2.out",
  scrollTrigger: {
    trigger: "#hero",
    start: "top top",
    end: "bottom top",
    scrub: 0.5,
  },
});
gsap.to(".hero-scroll-cue", {
  opacity: 0,
  ease: "none",
  scrollTrigger: {
    trigger: "#hero",
    start: "top top",
    end: "30% top",
    scrub: 0.5,
  },
});

/* After the scrub completes, fade the video stage out so the dark
   content sections take over cleanly, and restore the dark body bg. */
ScrollTrigger.create({
  trigger: "#events",
  start: "top 95%",
  end: "top 40%",
  scrub: 0.4,
  onUpdate: (self) => {
    stage.style.opacity = (1 - self.progress).toFixed(3);
    // Once we're more than halfway out of the reveal, switch body back to dark
    if (self.progress > 0.3) document.body.classList.remove("is-revealing");
  },
});

/* ============================================================
   GENERIC PARALLAX LAYERS (data-parallax)
   ============================================================ */
const parallaxEls = document.querySelectorAll("[data-parallax]");
parallaxEls.forEach((el) => {
  const speed = parseFloat(el.dataset.parallax);
  if (isNaN(speed) || speed === 0) return;
  gsap.to(el, {
    yPercent: speed * 100,
    ease: "none",
    scrollTrigger: {
      trigger: el.closest(".section, .hero, .scroll-stage") || el,
      start: "top bottom",
      end: "bottom top",
      scrub: 0.6,
    },
  });
});

/* Watermarks (big background numbers) — horizontal drift on scroll */
gsap.utils.toArray(".watermark").forEach((wm) => {
  gsap.fromTo(wm,
    { x: 60 },
    {
      x: -120,
      ease: "none",
      scrollTrigger: {
        trigger: wm.closest(".section"),
        start: "top bottom",
        end: "bottom top",
        scrub: 0.8,
      },
    }
  );
});

/* ============================================================
   SECTION REVEALS
   ============================================================ */
document.querySelectorAll(".display-h2").forEach((h) => {
  gsap.from(h, {
    y: 60, opacity: 0,
    duration: 1.2, ease: "expo.out",
    scrollTrigger: { trigger: h, start: "top 82%" },
  });
});

document.querySelectorAll(".section-num").forEach((n) => {
  gsap.from(n, {
    y: 20, opacity: 0,
    duration: 0.9, ease: "power3.out",
    scrollTrigger: { trigger: n, start: "top 90%" },
  });
});

gsap.utils.toArray(".event").forEach((row, i) => {
  gsap.from(row, {
    y: 40, opacity: 0,
    duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: row, start: "top 88%" },
    delay: i * 0.05,
  });
});

gsap.utils.toArray(".tier").forEach((t, i) => {
  gsap.from(t, {
    y: 50, opacity: 0,
    duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: ".tiers", start: "top 80%" },
    delay: i * 0.1,
  });
  t.addEventListener("mousemove", (e) => {
    const r = t.getBoundingClientRect();
    t.style.setProperty("--mx", `${e.clientX - r.left}px`);
    t.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});

gsap.from(".ci-row", {
  y: 24, opacity: 0, duration: 0.9, stagger: 0.1, ease: "power3.out",
  scrollTrigger: { trigger: ".contact", start: "top 75%" },
});
gsap.from(".contact-form", {
  y: 40, opacity: 0, duration: 1.1, ease: "power3.out",
  scrollTrigger: { trigger: ".contact", start: "top 75%" },
});
gsap.from(".footer-tag", {
  y: 30, opacity: 0, duration: 1.1, ease: "power3.out",
  scrollTrigger: { trigger: ".footer", start: "top 85%" },
});

/* Refresh after fonts/images settle */
window.addEventListener("load", () => setTimeout(() => ScrollTrigger.refresh(), 400));
