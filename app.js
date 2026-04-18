/* Pulse Desk — interactive widgets, charts, and offline support */
(function () {
  "use strict";

  const STORAGE_KEY = "pulsedesk:v1";
  const HYDRATION_GOAL = 2500; // ml
  const STEPS_GOAL = 10000;

  const state = loadState();
  hydrateDefaults(state);

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    renderGreeting();
    renderHeartChart();
    startHeartTicker();
    renderSleep();
    renderCalories();
    renderHydration();
    renderRecovery();
    renderRings();
    renderSteps();
    bindEvents();
    registerServiceWorker();
  }

  /* ---------- State ---------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      /* storage unavailable — ignore */
    }
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function hydrateDefaults(s) {
    const key = todayKey();
    if (s.day !== key) {
      s.day = key;
      s.hydrationMl = 0;
      s.steps = 6432;
    }
    if (typeof s.hydrationMl !== "number") s.hydrationMl = 0;
    if (typeof s.steps !== "number") s.steps = 6432;
    saveState();
  }

  /* ---------- Header ---------- */
  function renderGreeting() {
    const hr = new Date().getHours();
    let msg = "HELLO, TRACKER";
    if (hr < 5) msg = "LATE NIGHT, TRACKER";
    else if (hr < 12) msg = "GOOD MORNING";
    else if (hr < 17) msg = "GOOD AFTERNOON";
    else if (hr < 21) msg = "GOOD EVENING";
    else msg = "WIND DOWN MODE";
    const el = document.getElementById("greeting");
    if (el) el.textContent = msg;

    const dateEl = document.getElementById("today-date");
    if (dateEl) {
      const d = new Date();
      const opts = { weekday: "long", month: "short", day: "numeric" };
      dateEl.textContent = d.toLocaleDateString(undefined, opts).toUpperCase();
    }
  }

  /* ---------- Heart rate ---------- */
  function generateHeartSeries() {
    const pts = [];
    let val = 68;
    for (let i = 0; i < 48; i++) {
      const hour = (i / 48) * 24;
      let base = 62;
      if (hour > 6 && hour < 10) base = 78;
      else if (hour > 12 && hour < 18) base = 82;
      else if (hour > 18 && hour < 22) base = 74;
      else if (hour < 6) base = 56;
      val = val * 0.6 + (base + (Math.random() - 0.5) * 12) * 0.4;
      pts.push(Math.round(val));
    }
    return pts;
  }

  function renderHeartChart() {
    const series = generateHeartSeries();
    state._heart = series;
    const path = document.getElementById("heart-path");
    const dot = document.getElementById("heart-dot");
    if (!path || !dot) return;
    const w = 320;
    const h = 100;
    const max = Math.max(...series) + 6;
    const min = Math.min(...series) - 6;
    const range = Math.max(max - min, 1);
    const step = w / (series.length - 1);
    let d = "";
    const coords = series.map((v, i) => {
      const x = +(i * step).toFixed(2);
      const y = +(h - ((v - min) / range) * h).toFixed(2);
      return [x, y];
    });
    coords.forEach(([x, y], i) => {
      if (i === 0) d += `M ${x} ${y} `;
      else {
        const [px, py] = coords[i - 1];
        const cx = (px + x) / 2;
        d += `Q ${cx} ${py} ${x} ${y} `;
      }
    });
    path.setAttribute("d", d.trim());
    const [lx, ly] = coords[coords.length - 1];
    dot.setAttribute("cx", lx);
    dot.setAttribute("cy", ly);
    document.getElementById("heart-bpm").textContent = series[series.length - 1];
  }

  function startHeartTicker() {
    setInterval(() => {
      const bpmEl = document.getElementById("heart-bpm");
      if (!bpmEl) return;
      const cur = parseInt(bpmEl.textContent, 10) || 72;
      const delta = Math.round((Math.random() - 0.5) * 4);
      const next = Math.max(55, Math.min(98, cur + delta));
      bpmEl.textContent = next;
      bpmEl.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.06)" },
          { transform: "scale(1)" },
        ],
        { duration: 600, easing: "ease-out" }
      );
    }, 2400);
  }

  /* ---------- Sleep ---------- */
  function renderSleep() {
    const stages = [
      { t: "light", h: 30 },
      { t: "deep", h: 48 },
      { t: "rem", h: 42 },
      { t: "light", h: 36 },
      { t: "deep", h: 54 },
      { t: "rem", h: 40 },
      { t: "light", h: 28 },
      { t: "awake", h: 14 },
      { t: "light", h: 32 },
      { t: "rem", h: 44 },
      { t: "deep", h: 46 },
      { t: "light", h: 38 },
    ];
    const wrap = document.getElementById("sleep-stages");
    if (!wrap) return;
    wrap.innerHTML = "";
    stages.forEach((s) => {
      const bar = document.createElement("div");
      bar.className = `sleep__bar sleep__bar--${s.t}`;
      bar.style.height = "0%";
      bar.setAttribute("role", "listitem");
      bar.setAttribute("aria-label", `${s.t} sleep`);
      wrap.appendChild(bar);
      requestAnimationFrame(() => {
        bar.style.transition = "height 0.8s ease";
        bar.style.height = `${s.h}px`;
      });
    });
  }

  /* ---------- Calories ---------- */
  function renderCalories() {
    const intake = 1742;
    const burn = 2318;
    const goal = 2800;
    const ib = document.getElementById("cal-intake-bar");
    const bb = document.getElementById("cal-burn-bar");
    const iv = document.getElementById("cal-intake-val");
    const bv = document.getElementById("cal-burn-val");
    const delta = document.getElementById("cal-delta");
    if (!ib || !bb) return;

    setTimeout(() => {
      ib.style.width = `${Math.min(100, (intake / goal) * 100)}%`;
      bb.style.width = `${Math.min(100, (burn / goal) * 100)}%`;
    }, 120);
    animateCount(iv, 0, intake, 900);
    animateCount(bv, 0, burn, 1100);
    const net = intake - burn;
    delta.textContent = `NET · ${net > 0 ? "+" : ""}${net} KCAL`;
    delta.style.color = net < 0 ? "var(--mint)" : "var(--salmon)";
  }

  /* ---------- Hydration ---------- */
  function renderHydration() {
    const ml = Math.min(HYDRATION_GOAL, state.hydrationMl);
    const pct = ml / HYDRATION_GOAL;
    const fill = document.getElementById("hydro-fill");
    const wave = document.getElementById("hydro-wave");
    const mlEl = document.getElementById("hydro-ml");
    const pctEl = document.getElementById("hydro-pct");
    const goalEl = document.getElementById("hydro-goal-text");
    if (goalEl) goalEl.textContent = `/ ${HYDRATION_GOAL} ML`;
    if (fill) {
      const translateY = -170 * pct;
      fill.setAttribute("transform", `translate(0, ${translateY})`);
    }
    if (wave) updateWave(wave, pct);
    if (mlEl) mlEl.textContent = ml;
    if (pctEl) pctEl.textContent = `${Math.round(pct * 100)}% OF DAILY GOAL`;
  }

  function updateWave(wave, pct) {
    const topY = 190 - 170 * pct;
    const amp = 5;
    const segments = 4;
    const w = 120;
    const step = w / segments;
    let d = `M 0 ${topY} `;
    for (let i = 0; i < segments; i++) {
      const cx1 = step * i + step / 4;
      const cx2 = step * i + (step * 3) / 4;
      const cy1 = topY - amp;
      const cy2 = topY + amp;
      const ex = step * (i + 1);
      d += `C ${cx1} ${cy1}, ${cx2} ${cy2}, ${ex} ${topY} `;
    }
    d += `L 120 200 L 0 200 Z`;
    wave.setAttribute("d", d);
  }

  /* ---------- Recovery ---------- */
  function renderRecovery() {
    const val = 82;
    const fill = document.getElementById("recovery-level");
    const pct = document.getElementById("recovery-pct");
    const meter = document.getElementById("recovery-meter");
    if (fill) {
      fill.style.width = "0%";
      setTimeout(() => (fill.style.width = `${val}%`), 120);
      if (val < 30) fill.style.background = "var(--salmon)";
      else if (val < 60) fill.style.background = "var(--yellow)";
      else fill.style.background = "linear-gradient(90deg, var(--mint), var(--yellow))";
    }
    if (pct) animateCount(pct, 0, val, 1000, (v) => `${v}%`);
    if (meter) meter.setAttribute("aria-valuenow", val);
  }

  /* ---------- Rings ---------- */
  function renderRings() {
    const rings = [
      { id: "ring-move", r: 78, pct: 0.82, legendId: "ring-move-pct" },
      { id: "ring-ex", r: 58, pct: 0.64, legendId: "ring-ex-pct" },
      { id: "ring-stand", r: 38, pct: 0.91, legendId: "ring-stand-pct" },
    ];
    rings.forEach((r) => {
      const el = document.getElementById(r.id);
      const leg = document.getElementById(r.legendId);
      if (!el) return;
      const c = 2 * Math.PI * r.r;
      el.setAttribute("stroke-dasharray", c.toFixed(2));
      el.setAttribute("stroke-dashoffset", c.toFixed(2));
      requestAnimationFrame(() => {
        el.setAttribute("stroke-dashoffset", (c * (1 - r.pct)).toFixed(2));
      });
      if (leg) leg.textContent = `${Math.round(r.pct * 100)}%`;
    });
  }

  /* ---------- Steps ---------- */
  function renderSteps() {
    const count = state.steps;
    const countEl = document.getElementById("steps-count");
    const fill = document.getElementById("steps-fill");
    if (countEl) animateCount(countEl, 0, count, 900, (v) => v.toLocaleString());
    if (fill) {
      fill.style.width = "0%";
      setTimeout(
        () => (fill.style.width = `${Math.min(100, (count / STEPS_GOAL) * 100)}%`),
        120
      );
    }
  }

  /* ---------- Events ---------- */
  function bindEvents() {
    const addBtn = document.getElementById("hydro-add");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        state.hydrationMl = Math.min(HYDRATION_GOAL, state.hydrationMl + 250);
        saveState();
        renderHydration();
        pulse(addBtn);
      });
    }

    const stepsAdd = document.getElementById("steps-add");
    if (stepsAdd) {
      stepsAdd.addEventListener("click", () => {
        state.steps += 500;
        saveState();
        renderSteps();
        pulse(stepsAdd);
      });
    }

    const stepsSync = document.getElementById("steps-sync");
    if (stepsSync) {
      stepsSync.addEventListener("click", () => {
        const bump = Math.floor(Math.random() * 900 + 200);
        state.steps += bump;
        saveState();
        renderSteps();
        pulse(stepsSync);
      });
    }
  }

  /* ---------- Helpers ---------- */
  function animateCount(el, from, to, duration, fmt) {
    if (!el) return;
    const start = performance.now();
    const format = fmt || ((v) => String(v));
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      el.textContent = format(v);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function pulse(el) {
    el.animate(
      [
        { transform: "translate(0,0)" },
        { transform: "translate(2px,2px)" },
        { transform: "translate(0,0)" },
      ],
      { duration: 180, easing: "ease-out" }
    );
  }

  /* ---------- Service worker ---------- */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js", { scope: "./" })
        .catch(() => {
          /* ignore registration errors in local/file contexts */
        });
    });
  }
})();
