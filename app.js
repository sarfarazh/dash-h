/* Pulse Desk — router, widgets, logging, stats, settings, coach */
(function () {
  "use strict";

  const METRICS = [
    { id: "heart", label: "HEART", color: "salmon" },
    { id: "sleep", label: "SLEEP", color: "peri" },
    { id: "food", label: "FOOD", color: "yellow" },
    { id: "burn", label: "BURN", color: "salmon" },
    { id: "hydration", label: "WATER", color: "peri" },
    { id: "recovery", label: "RECOVERY", color: "mint" },
    { id: "activity", label: "RINGS", color: "peri" },
    { id: "steps", label: "STEPS", color: "yellow" },
  ];

  const state = {
    route: "home",
    logMetric: "hydration",
    sheetMetric: "hydration",
    statsRange: 7,
    chatAbort: null,
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    await PulseDB.openDB();
    wireRouter();
    wireHome();
    wireSheet();
    wireLogScreen();
    wireProfile();
    wireSettings();
    wireCoach();
    await renderAll();
    PulseDB.on("change", () => {
      renderAll();
    });
    registerServiceWorker();
    const initialRoute = (location.hash || "#home").replace("#", "") || "home";
    goto(initialRoute, { skipPush: true });
  }

  /* ---------- Router ---------- */
  function goto(route, opts) {
    const options = opts || {};
    state.route = route;
    document.querySelectorAll(".screen").forEach((s) => {
      const match = s.dataset.screen === route;
      s.hidden = !match;
      s.classList.toggle("screen--active", match);
    });
    document.querySelectorAll(".tab[data-route]").forEach((t) => {
      t.classList.toggle("tab--active", t.dataset.route === route);
    });
    document.body.classList.toggle("chat-open", route === "coach");
    if (!options.skipPush) history.replaceState(null, "", `#${route}`);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (route === "stats") renderStats();
    if (route === "log") renderLogScreen();
    if (route === "profile") renderProfile();
    if (route === "settings") renderSettings();
    if (route === "coach") renderCoach();
  }

  function wireRouter() {
    document.querySelectorAll(".tab[data-route]").forEach((t) => {
      t.addEventListener("click", () => goto(t.dataset.route));
    });
    document.getElementById("open-settings").addEventListener("click", () => goto("settings"));
    document.getElementById("profile-settings").addEventListener("click", () => goto("settings"));
    document.getElementById("settings-back").addEventListener("click", () => goto("profile"));
    document.getElementById("coach-back").addEventListener("click", () => {
      if (state.chatAbort) state.chatAbort.abort();
      goto("home");
    });
    document.getElementById("coach-card").addEventListener("click", (e) => {
      if (e.target.closest("#coach-refresh")) return;
      goto("coach");
    });
    window.addEventListener("hashchange", () => {
      const r = (location.hash || "#home").replace("#", "") || "home";
      if (r !== state.route) goto(r, { skipPush: true });
    });
  }

  /* ---------- Global re-render ---------- */
  async function renderAll() {
    const summary = await PulseDB.getTodaySummary();
    renderHeader(summary);
    renderHome(summary);
    await renderCoachTipCard();
    if (state.route === "profile") renderProfile();
    if (state.route === "stats") renderStats();
    if (state.route === "log") renderLogRecent();
  }

  /* ---------- Header ---------- */
  function renderHeader(summary) {
    const hr = new Date().getHours();
    let msg = "HELLO";
    if (hr < 5) msg = "LATE NIGHT";
    else if (hr < 12) msg = "GOOD MORNING";
    else if (hr < 17) msg = "GOOD AFTERNOON";
    else if (hr < 21) msg = "GOOD EVENING";
    else msg = "WIND DOWN";
    const greet = document.getElementById("greeting");
    if (greet) greet.textContent = `${msg}, ${summary.name || "TRACKER"}`;
    const dateEl = document.getElementById("today-date");
    if (dateEl) {
      const d = new Date();
      const opts = { weekday: "long", month: "short", day: "numeric" };
      dateEl.textContent = d.toLocaleDateString(undefined, opts).toUpperCase();
    }
  }

  /* ---------- Home widgets ---------- */
  function renderHome(summary) {
    renderHeart(summary);
    renderSleep(summary);
    renderCalories(summary);
    renderHydration(summary);
    renderRecovery(summary);
    renderRings(summary);
    renderSteps(summary);
  }

  function renderHeart(summary) {
    const series = summary.heart.series;
    const path = document.getElementById("heart-path");
    const dot = document.getElementById("heart-dot");
    const bpmEl = document.getElementById("heart-bpm");
    const foot = document.getElementById("heart-foot");
    const empty = document.getElementById("heart-empty");
    if (!series.length) {
      path.setAttribute("d", "");
      dot.setAttribute("cx", -20);
      dot.setAttribute("cy", -20);
      if (bpmEl) bpmEl.textContent = "--";
      if (foot) foot.textContent = "NO ENTRIES YET";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    const w = 320;
    const h = 100;
    const values = series.map((p) => p.bpm);
    const max = Math.max(...values) + 6;
    const min = Math.min(...values) - 6;
    const range = Math.max(max - min, 1);
    const step = series.length > 1 ? w / (series.length - 1) : 0;
    const coords = series.map((p, i) => {
      const x = +(i * step).toFixed(2);
      const y = +(h - ((p.bpm - min) / range) * h).toFixed(2);
      return [x, y];
    });
    let d = "";
    coords.forEach(([x, y], i) => {
      if (i === 0) d += `M ${x} ${y} `;
      else {
        const [px, py] = coords[i - 1];
        const cx = (px + x) / 2;
        d += `Q ${cx} ${py} ${x} ${y} `;
      }
    });
    if (coords.length === 1) {
      d = `M ${coords[0][0]} ${coords[0][1]} L ${w} ${coords[0][1]}`;
    }
    path.setAttribute("d", d.trim());
    const [lx, ly] = coords[coords.length - 1];
    dot.setAttribute("cx", lx);
    dot.setAttribute("cy", ly);
    if (bpmEl) bpmEl.textContent = summary.heart.latest;
    if (foot) foot.textContent = `AVG ${summary.heart.avg} BPM · ${series.length} LOGS`;
  }

  function renderSleep(summary) {
    const s = summary.sleep;
    const scoreEl = document.getElementById("sleep-score");
    const footEl = document.getElementById("sleep-foot");
    const wrap = document.getElementById("sleep-stages");
    if (!s) {
      scoreEl.textContent = "--";
      footEl.textContent = "NOT LOGGED";
      wrap.innerHTML = "";
      return;
    }
    scoreEl.textContent = s.score || "--";
    const mins = s.minutes || 0;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const deepPct = mins ? Math.round(((s.deep || 0) / mins) * 100) : 0;
    footEl.textContent = `${hh} H ${mm} M${deepPct ? ` · DEEP ${deepPct}%` : ""}`;
    wrap.innerHTML = "";
    const stages = [
      ["deep", s.deep || 0], ["rem", s.rem || 0],
      ["light", s.light || 0], ["awake", s.awake || 0],
    ];
    const max = Math.max(1, ...stages.map((x) => x[1]));
    stages.forEach(([name, minutes]) => {
      if (!minutes) return;
      const bar = document.createElement("div");
      bar.className = `sleep__bar sleep__bar--${name}`;
      bar.style.height = `${Math.max(8, (minutes / max) * 56)}px`;
      bar.setAttribute("role", "listitem");
      bar.setAttribute("aria-label", `${name}: ${minutes} minutes`);
      wrap.appendChild(bar);
    });
  }

  function renderCalories(summary) {
    const intake = summary.food;
    const burn = summary.burn;
    const goal = summary.goals.kcal;
    const ib = document.getElementById("cal-intake-bar");
    const bb = document.getElementById("cal-burn-bar");
    const iv = document.getElementById("cal-intake-val");
    const bv = document.getElementById("cal-burn-val");
    const delta = document.getElementById("cal-delta");
    ib.style.width = `${Math.min(100, (intake / goal) * 100)}%`;
    bb.style.width = `${Math.min(100, (burn / goal) * 100)}%`;
    iv.textContent = intake;
    bv.textContent = burn;
    const net = intake - burn;
    delta.textContent = `NET · ${net > 0 ? "+" : ""}${net} KCAL`;
    delta.style.color = net < 0 ? "var(--mint)" : net > 0 ? "var(--salmon)" : "var(--text)";
  }

  function renderHydration(summary) {
    const goal = summary.goals.hydration;
    const ml = Math.min(goal, summary.hydrationMl);
    const pct = goal ? ml / goal : 0;
    const fill = document.getElementById("hydro-fill");
    const wave = document.getElementById("hydro-wave");
    const mlEl = document.getElementById("hydro-ml");
    const pctEl = document.getElementById("hydro-pct");
    const goalEl = document.getElementById("hydro-goal-text");
    goalEl.textContent = `/ ${goal} ML`;
    const translateY = -170 * pct;
    fill.setAttribute("transform", `translate(0, ${translateY})`);
    updateWave(wave, pct);
    mlEl.textContent = summary.hydrationMl;
    pctEl.textContent = `${Math.round(pct * 100)}% OF DAILY GOAL`;
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

  function renderRecovery(summary) {
    const r = summary.recovery;
    const fill = document.getElementById("recovery-level");
    const pctEl = document.getElementById("recovery-pct");
    const meter = document.getElementById("recovery-meter");
    const foot = document.getElementById("recovery-foot");
    if (!r) {
      fill.style.width = "0%";
      pctEl.textContent = "--";
      meter.setAttribute("aria-valuenow", 0);
      foot.textContent = "NOT LOGGED";
      return;
    }
    const val = r.pct;
    fill.style.width = `${val}%`;
    fill.style.background =
      val < 30 ? "var(--salmon)" : val < 60 ? "var(--yellow)" : "linear-gradient(90deg, var(--mint), var(--yellow))";
    pctEl.textContent = `${val}%`;
    meter.setAttribute("aria-valuenow", val);
    foot.textContent = r.hrv ? `HRV · ${r.hrv} MS` : "BODY BATTERY";
  }

  function renderRings(summary) {
    const a = summary.activity || { move: 0, exercise: 0, stand: 0 };
    const rings = [
      { id: "ring-move", r: 78, pct: (a.move || 0) / 100, legendId: "ring-move-pct" },
      { id: "ring-ex", r: 58, pct: (a.exercise || 0) / 100, legendId: "ring-ex-pct" },
      { id: "ring-stand", r: 38, pct: (a.stand || 0) / 100, legendId: "ring-stand-pct" },
    ];
    rings.forEach((ring) => {
      const el = document.getElementById(ring.id);
      const leg = document.getElementById(ring.legendId);
      const c = 2 * Math.PI * ring.r;
      el.setAttribute("stroke-dasharray", c.toFixed(2));
      el.setAttribute("stroke-dashoffset", (c * (1 - Math.min(1, ring.pct))).toFixed(2));
      if (leg) leg.textContent = `${Math.round(Math.min(1, ring.pct) * 100)}%`;
    });
  }

  function renderSteps(summary) {
    const count = summary.steps;
    const goal = summary.goals.steps;
    const countEl = document.getElementById("steps-count");
    const fill = document.getElementById("steps-fill");
    const label = document.getElementById("steps-goal-label");
    countEl.textContent = count.toLocaleString();
    fill.style.width = `${Math.min(100, (count / goal) * 100)}%`;
    label.textContent = `GOAL · ${goal.toLocaleString()}`;
  }

  function wireHome() {
    document.getElementById("hydro-add").addEventListener("click", async () => {
      await PulseDB.addEntry("hydration", { ml: 250 });
      toast("+250 ML LOGGED", "ok");
    });
    document.getElementById("steps-add-500").addEventListener("click", async () => {
      await PulseDB.addEntry("steps", { count: 500 });
      toast("+500 STEPS", "ok");
    });
    document.getElementById("steps-add-1000").addEventListener("click", async () => {
      await PulseDB.addEntry("steps", { count: 1000 });
      toast("+1000 STEPS", "ok");
    });
  }

  /* ---------- Log forms ---------- */
  function buildForm(metric, host, onSave) {
    host.innerHTML = "";
    const form = document.createElement("form");
    form.className = "form";
    form.addEventListener("submit", (e) => e.preventDefault());
    let collect = () => null;

    if (metric === "heart") {
      form.innerHTML = `
        <label class="field-label" for="f-bpm">BPM</label>
        <input type="number" class="input-neo" id="f-bpm" min="30" max="220" placeholder="72" required />
        <label class="field-label">CONTEXT</label>
        <div class="toggle-row" role="tablist">
          <button type="button" data-ctx="rest" aria-pressed="true">REST</button>
          <button type="button" data-ctx="active" aria-pressed="false">ACTIVE</button>
        </div>
      `;
      wireToggle(form);
      collect = () => {
        const bpm = parseInt(form.querySelector("#f-bpm").value, 10);
        if (!bpm) return { error: "ENTER BPM" };
        const ctx = form.querySelector('[data-ctx][aria-pressed="true"]').dataset.ctx;
        return { value: { bpm, context: ctx } };
      };
    } else if (metric === "sleep") {
      form.innerHTML = `
        <label class="field-label" for="f-score">SCORE (0-100)</label>
        <input type="number" class="input-neo" id="f-score" min="0" max="100" placeholder="85" required />
        <label class="field-label">DURATION</label>
        <div class="form-row">
          <input type="number" class="input-neo" id="f-hh" min="0" max="16" placeholder="H" required />
          <input type="number" class="input-neo" id="f-mm" min="0" max="59" placeholder="M" />
        </div>
        <label class="field-label">STAGES (OPTIONAL, MINUTES)</label>
        <div class="form-row">
          <input type="number" class="input-neo" id="f-deep" min="0" placeholder="DEEP" />
          <input type="number" class="input-neo" id="f-rem" min="0" placeholder="REM" />
        </div>
        <div class="form-row">
          <input type="number" class="input-neo" id="f-light" min="0" placeholder="LIGHT" />
          <input type="number" class="input-neo" id="f-awake" min="0" placeholder="AWAKE" />
        </div>
      `;
      collect = () => {
        const score = parseInt(form.querySelector("#f-score").value, 10);
        const hh = parseInt(form.querySelector("#f-hh").value, 10) || 0;
        const mm = parseInt(form.querySelector("#f-mm").value, 10) || 0;
        if (!score || (!hh && !mm)) return { error: "ENTER SCORE AND DURATION" };
        return {
          value: {
            score, minutes: hh * 60 + mm,
            deep: parseInt(form.querySelector("#f-deep").value, 10) || 0,
            rem: parseInt(form.querySelector("#f-rem").value, 10) || 0,
            light: parseInt(form.querySelector("#f-light").value, 10) || 0,
            awake: parseInt(form.querySelector("#f-awake").value, 10) || 0,
          },
        };
      };
    } else if (metric === "food") {
      form.innerHTML = `
        <label class="field-label" for="f-food-name">FOOD</label>
        <input type="text" class="input-neo" id="f-food-name" placeholder="OATMEAL" maxlength="40" required />
        <label class="field-label" for="f-food-kcal">CALORIES</label>
        <input type="number" class="input-neo" id="f-food-kcal" min="1" max="5000" placeholder="320" required />
      `;
      collect = () => {
        const name = form.querySelector("#f-food-name").value.trim().toUpperCase();
        const kcal = parseInt(form.querySelector("#f-food-kcal").value, 10);
        if (!name || !kcal) return { error: "ENTER NAME AND KCAL" };
        return { value: { name, kcal } };
      };
    } else if (metric === "burn") {
      form.innerHTML = `
        <label class="field-label" for="f-burn-act">ACTIVITY</label>
        <input type="text" class="input-neo" id="f-burn-act" placeholder="RUN 5K" maxlength="40" required />
        <label class="field-label" for="f-burn-kcal">CALORIES BURNED</label>
        <input type="number" class="input-neo" id="f-burn-kcal" min="1" max="5000" placeholder="420" required />
      `;
      collect = () => {
        const activity = form.querySelector("#f-burn-act").value.trim().toUpperCase();
        const kcal = parseInt(form.querySelector("#f-burn-kcal").value, 10);
        if (!activity || !kcal) return { error: "ENTER ACTIVITY AND KCAL" };
        return { value: { activity, kcal } };
      };
    } else if (metric === "hydration") {
      form.innerHTML = `
        <label class="field-label">QUICK ADD</label>
        <div class="quick-tiles">
          <button type="button" class="quick-tile" data-ml="250">250 ML</button>
          <button type="button" class="quick-tile" data-ml="500">500 ML</button>
          <button type="button" class="quick-tile" data-ml="750">750 ML</button>
        </div>
        <label class="field-label" for="f-ml">CUSTOM (ML)</label>
        <input type="number" class="input-neo" id="f-ml" min="1" max="3000" placeholder="300" />
      `;
      form.querySelectorAll(".quick-tile").forEach((t) => {
        t.addEventListener("click", async () => {
          const ml = parseInt(t.dataset.ml, 10);
          await PulseDB.addEntry("hydration", { ml });
          toast(`+${ml} ML`, "ok");
          onSave && onSave();
        });
      });
      collect = () => {
        const ml = parseInt(form.querySelector("#f-ml").value, 10);
        if (!ml) return { error: "ENTER ML OR USE QUICK TILE" };
        return { value: { ml } };
      };
    } else if (metric === "recovery") {
      form.innerHTML = `
        <label class="field-label" for="f-rec-pct">BATTERY (0-100)</label>
        <input type="number" class="input-neo" id="f-rec-pct" min="0" max="100" placeholder="82" required />
        <label class="field-label" for="f-rec-hrv">HRV (OPTIONAL, MS)</label>
        <input type="number" class="input-neo" id="f-rec-hrv" min="0" max="300" placeholder="55" />
      `;
      collect = () => {
        const pct = parseInt(form.querySelector("#f-rec-pct").value, 10);
        if (isNaN(pct)) return { error: "ENTER PERCENT" };
        return {
          value: {
            pct: Math.max(0, Math.min(100, pct)),
            hrv: parseInt(form.querySelector("#f-rec-hrv").value, 10) || 0,
          },
        };
      };
    } else if (metric === "activity") {
      form.innerHTML = `
        <div class="slider-row">
          <label for="f-move">MOVE</label>
          <input type="range" id="f-move" min="0" max="120" value="50" />
          <span id="f-move-v">50%</span>
        </div>
        <div class="slider-row">
          <label for="f-ex">EXERCISE</label>
          <input type="range" id="f-ex" min="0" max="120" value="40" />
          <span id="f-ex-v">40%</span>
        </div>
        <div class="slider-row">
          <label for="f-stand">STAND</label>
          <input type="range" id="f-stand" min="0" max="120" value="60" />
          <span id="f-stand-v">60%</span>
        </div>
      `;
      ["f-move","f-ex","f-stand"].forEach((id) => {
        const input = form.querySelector(`#${id}`);
        const out = form.querySelector(`#${id}-v`);
        input.addEventListener("input", () => { out.textContent = `${input.value}%`; });
      });
      collect = () => ({
        value: {
          move: parseInt(form.querySelector("#f-move").value, 10),
          exercise: parseInt(form.querySelector("#f-ex").value, 10),
          stand: parseInt(form.querySelector("#f-stand").value, 10),
        },
      });
    } else if (metric === "steps") {
      form.innerHTML = `
        <label class="field-label">QUICK ADD</label>
        <div class="quick-tiles">
          <button type="button" class="quick-tile" data-c="500">500</button>
          <button type="button" class="quick-tile" data-c="1000">1,000</button>
          <button type="button" class="quick-tile" data-c="2500">2,500</button>
        </div>
        <label class="field-label" for="f-steps">CUSTOM STEPS</label>
        <input type="number" class="input-neo" id="f-steps" min="1" max="50000" placeholder="1200" />
      `;
      form.querySelectorAll(".quick-tile").forEach((t) => {
        t.addEventListener("click", async () => {
          const c = parseInt(t.dataset.c, 10);
          await PulseDB.addEntry("steps", { count: c });
          toast(`+${c.toLocaleString()} STEPS`, "ok");
          onSave && onSave();
        });
      });
      collect = () => {
        const count = parseInt(form.querySelector("#f-steps").value, 10);
        if (!count) return { error: "ENTER STEPS OR USE QUICK TILE" };
        return { value: { count } };
      };
    }

    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn-neo form-submit";
    save.textContent = "SAVE ENTRY";
    save.addEventListener("click", async () => {
      const res = collect();
      if (res.error) { toast(res.error, "err"); return; }
      if (!res.value) return;
      await PulseDB.addEntry(metric, res.value);
      toast("ENTRY SAVED", "ok");
      onSave && onSave();
    });
    form.appendChild(save);
    host.appendChild(form);
  }

  function wireToggle(form) {
    const btns = form.querySelectorAll(".toggle-row button");
    btns.forEach((b) => {
      b.addEventListener("click", () => {
        btns.forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
      });
    });
  }

  function renderMetricPicker(host, activeId, onChange) {
    host.innerHTML = "";
    METRICS.forEach((m) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `log-chip log-chip--${m.id}`;
      if (m.id === activeId) chip.classList.add("log-chip--active");
      chip.textContent = m.label;
      chip.dataset.metric = m.id;
      chip.addEventListener("click", () => {
        host.querySelectorAll(".log-chip").forEach((x) => x.classList.remove("log-chip--active"));
        chip.classList.add("log-chip--active");
        onChange(m.id);
      });
      host.appendChild(chip);
    });
  }

  /* ---------- Sheet ---------- */
  function wireSheet() {
    const sheet = document.getElementById("sheet");
    const fab = document.getElementById("fab");
    fab.addEventListener("click", () => openSheet());
    sheet.querySelectorAll("[data-close]").forEach((el) =>
      el.addEventListener("click", () => closeSheet())
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !sheet.hidden) closeSheet();
    });
  }

  function openSheet(metric) {
    const sheet = document.getElementById("sheet");
    const picker = document.getElementById("sheet-picker");
    const formHost = document.getElementById("sheet-form");
    const m = metric || state.sheetMetric || "hydration";
    state.sheetMetric = m;
    renderMetricPicker(picker, m, (next) => {
      state.sheetMetric = next;
      buildForm(next, formHost, () => { /* keep open */ });
    });
    buildForm(m, formHost, () => {});
    sheet.hidden = false;
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("sheet-open");
  }

  function closeSheet() {
    const sheet = document.getElementById("sheet");
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sheet-open");
  }

  /* ---------- Log screen ---------- */
  function wireLogScreen() {
    // rendered on route change
  }

  function renderLogScreen() {
    const picker = document.getElementById("log-picker");
    const formHost = document.getElementById("log-form");
    renderMetricPicker(picker, state.logMetric, (next) => {
      state.logMetric = next;
      buildForm(next, formHost, () => renderLogRecent());
    });
    buildForm(state.logMetric, formHost, () => renderLogRecent());
    renderLogRecent();
  }

  async function renderLogRecent() {
    const list = document.getElementById("entries-list");
    if (!list) return;
    const all = await PulseDB.getAllEntries();
    const recent = all.slice(0, 25);
    list.innerHTML = "";
    if (!recent.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "NO ENTRIES YET — START LOGGING ABOVE";
      list.appendChild(empty);
      return;
    }
    recent.forEach((e) => {
      const li = document.createElement("li");
      li.className = "entry-row";
      const d = new Date(e.ts);
      const when = `${e.date} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      li.innerHTML = `
        <span class="entry-badge entry-badge--${e.type}">${entryBadge(e.type)}</span>
        <div>
          <div class="entry-info">${entrySummary(e)}</div>
          <div class="entry-time">${when}</div>
        </div>
        <button class="entry-del" data-id="${e.id}" aria-label="Delete entry">DEL</button>
      `;
      list.appendChild(li);
    });
    list.querySelectorAll(".entry-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.dataset.id, 10);
        await PulseDB.deleteEntry(id);
        toast("DELETED", "ok");
      });
    });
  }

  function entryBadge(type) {
    const map = {
      heart: "HEART", sleep: "SLEEP", food: "FOOD", burn: "BURN",
      hydration: "WATER", recovery: "RECOV", activity: "RINGS", steps: "STEPS",
    };
    return map[type] || type.toUpperCase();
  }

  function entrySummary(e) {
    const v = e.value || {};
    switch (e.type) {
      case "heart": return `${v.bpm} BPM · ${(v.context || "rest").toUpperCase()}`;
      case "sleep": {
        const h = Math.floor((v.minutes || 0) / 60); const m = (v.minutes || 0) % 60;
        return `${v.score}/100 · ${h}H ${m}M`;
      }
      case "food": return `${v.name} · ${v.kcal} KCAL`;
      case "burn": return `${v.activity} · ${v.kcal} KCAL`;
      case "hydration": return `${v.ml} ML`;
      case "recovery": return `${v.pct}%${v.hrv ? ` · HRV ${v.hrv}` : ""}`;
      case "activity": return `MOVE ${v.move}% · EX ${v.exercise}% · STAND ${v.stand}%`;
      case "steps": return `${(v.count || 0).toLocaleString()} STEPS`;
      default: return JSON.stringify(v);
    }
  }

  /* ---------- Profile ---------- */
  function wireProfile() {
    document.getElementById("save-name").addEventListener("click", async () => {
      const val = document.getElementById("display-name").value.trim().toUpperCase().slice(0, 20) || "TRACKER";
      await PulseDB.setSetting("displayName", val);
      toast("NAME SAVED", "ok");
    });
    document.getElementById("save-goals").addEventListener("click", async () => {
      const h = parseInt(document.getElementById("goal-hydration").value, 10);
      const s = parseInt(document.getElementById("goal-steps").value, 10);
      const c = parseInt(document.getElementById("goal-calories").value, 10);
      if (h) await PulseDB.setSetting("hydrationGoal", h);
      if (s) await PulseDB.setSetting("stepsGoal", s);
      if (c) await PulseDB.setSetting("calorieGoal", c);
      toast("GOALS SAVED", "ok");
    });
  }

  async function renderProfile() {
    const summary = await PulseDB.getTodaySummary();
    const settings = await PulseDB.getAllSettings();
    const streak = await PulseDB.getStreak();
    const all = await PulseDB.getAllEntries();
    document.getElementById("profile-name").textContent = settings.displayName;
    document.getElementById("display-name").value = settings.displayName;
    document.getElementById("goal-hydration").value = settings.hydrationGoal;
    document.getElementById("goal-steps").value = settings.stepsGoal;
    document.getElementById("goal-calories").value = settings.calorieGoal;
    document.getElementById("streak-num").textContent = streak;
    document.getElementById("streak-foot").textContent = streak === 1 ? "DAY LOGGED" : "DAYS LOGGED";
    document.getElementById("entries-num").textContent = all.length;

    const glance = document.getElementById("glance-list");
    const sleep = summary.sleep;
    const rec = summary.recovery;
    glance.innerHTML = `
      <li>HEART AVG <strong>${summary.heart.avg || "--"} BPM</strong></li>
      <li>SLEEP SCORE <strong>${sleep ? sleep.score : "--"}</strong></li>
      <li>HYDRATION <strong>${summary.hydrationMl} / ${settings.hydrationGoal} ML</strong></li>
      <li>STEPS <strong>${summary.steps.toLocaleString()} / ${settings.stepsGoal.toLocaleString()}</strong></li>
      <li>KCAL NET <strong>${summary.food - summary.burn}</strong></li>
      <li>RECOVERY <strong>${rec ? rec.pct + "%" : "--"}</strong></li>
    `;
  }

  /* ---------- Stats ---------- */
  async function renderStats() {
    const host = document.getElementById("stats-grid");
    const days = state.statsRange;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const startKey = PulseDB.todayKey(start);
    const endKey = PulseDB.todayKey(end);
    const entries = await PulseDB.getEntriesInRange(startKey, endKey);
    const settings = await PulseDB.getAllSettings();

    const buckets = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets[PulseDB.todayKey(d)] = { heart: [], sleep: [], food: 0, burn: 0, hydration: 0, recovery: null, steps: 0 };
    }
    entries.forEach((e) => {
      const b = buckets[e.date];
      if (!b) return;
      const v = e.value || {};
      if (e.type === "heart") b.heart.push(v.bpm);
      else if (e.type === "sleep") b.sleep.push(v.score);
      else if (e.type === "food") b.food += v.kcal || 0;
      else if (e.type === "burn") b.burn += v.kcal || 0;
      else if (e.type === "hydration") b.hydration += v.ml || 0;
      else if (e.type === "recovery") b.recovery = v.pct;
      else if (e.type === "steps") b.steps += v.count || 0;
    });
    const days_arr = Object.keys(buckets).sort();

    const charts = [
      { title: "HEART (AVG BPM)", color: "salmon", values: days_arr.map((d) => {
          const h = buckets[d].heart; return h.length ? Math.round(h.reduce((a,b)=>a+b,0)/h.length) : 0; }),
        unit: "BPM", kind: "line" },
      { title: "SLEEP SCORE", color: "peri", values: days_arr.map((d) => {
          const s = buckets[d].sleep; return s.length ? Math.max(...s) : 0; }),
        unit: "/100", kind: "bar", max: 100 },
      { title: "HYDRATION (ML)", color: "peri", values: days_arr.map((d) => buckets[d].hydration),
        unit: "ML", kind: "bar", goal: settings.hydrationGoal },
      { title: "STEPS", color: "yellow", values: days_arr.map((d) => buckets[d].steps),
        unit: "", kind: "bar", goal: settings.stepsGoal },
      { title: "KCAL NET", color: "salmon", values: days_arr.map((d) => buckets[d].food - buckets[d].burn),
        unit: "KCAL", kind: "bar", signed: true },
      { title: "RECOVERY %", color: "mint", values: days_arr.map((d) => buckets[d].recovery || 0),
        unit: "%", kind: "bar", max: 100 },
    ];

    host.innerHTML = "";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "neo-card stats-empty";
      empty.textContent = `NO DATA IN LAST ${days} DAYS — START LOGGING`;
      empty.style.gridColumn = "1 / -1";
      host.appendChild(empty);
      return;
    }
    charts.forEach((c) => host.appendChild(buildStatCard(c, days_arr)));
    document.querySelectorAll(".seg__btn[data-range]").forEach((b) => {
      b.classList.toggle("seg__btn--active", parseInt(b.dataset.range, 10) === state.statsRange);
    });
  }

  function buildStatCard(c, dates) {
    const card = document.createElement("div");
    card.className = "neo-card stat-card";
    const latest = c.values[c.values.length - 1];
    const avg = c.values.length ? Math.round(c.values.reduce((a,b)=>a+b,0) / c.values.length) : 0;
    card.innerHTML = `
      <div class="stat-card__top">
        <span class="widget__title">${c.title}</span>
        <span class="stat-card__val accent-${c.color}">${Math.round(latest)}<span style="font-size:0.6rem;color:var(--muted);margin-left:6px">${c.unit}</span></span>
      </div>
      <svg class="stat-chart" viewBox="0 0 200 70" preserveAspectRatio="none"></svg>
      <p class="widget__foot">AVG ${avg} ${c.unit}</p>
    `;
    const svg = card.querySelector("svg");
    renderMiniChart(svg, c);
    return card;
  }

  function renderMiniChart(svg, c) {
    const w = 200, h = 70, pad = 4;
    const values = c.values.slice();
    const maxV = c.max || Math.max(1, ...values.map((v) => Math.abs(v)));
    const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
    const color =
      c.color === "salmon" ? "#FF8A7A"
      : c.color === "peri" ? "#A9B6FF"
      : c.color === "yellow" ? "#FFE35C"
      : c.color === "mint" ? "#9BE8A4" : "#fff";

    if (c.kind === "line") {
      let d = "";
      values.forEach((v, i) => {
        const x = pad + i * step;
        const y = h - pad - (maxV ? (v / maxV) * (h - pad * 2) : 0);
        d += `${i === 0 ? "M" : "L"} ${x} ${y} `;
      });
      svg.innerHTML = `<path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
    } else {
      const bw = Math.max(6, (w - pad * 2) / values.length - 3);
      const parts = values.map((v, i) => {
        const x = pad + i * ((w - pad * 2) / values.length);
        const hVal = maxV ? (Math.abs(v) / maxV) * (h - pad * 2) : 0;
        const y = h - pad - hVal;
        const fill = c.signed && v < 0 ? "#FF8A7A" : color;
        return `<rect class="stat-bar" x="${x}" y="${y}" width="${bw}" height="${hVal}" rx="3" fill="${fill}" />`;
      }).join("");
      let goalLine = "";
      if (c.goal) {
        const gy = h - pad - Math.min(h - pad * 2, (c.goal / maxV) * (h - pad * 2));
        goalLine = `<line x1="${pad}" y1="${gy}" x2="${w - pad}" y2="${gy}" stroke="#9a9a9a" stroke-width="1" stroke-dasharray="4 3" />`;
      }
      svg.innerHTML = parts + goalLine;
    }
  }

  /* ---------- Settings ---------- */
  function wireSettings() {
    document.querySelectorAll(".seg__btn[data-range]").forEach((b) => {
      b.addEventListener("click", () => {
        state.statsRange = parseInt(b.dataset.range, 10);
        renderStats();
      });
    });
    document.getElementById("toggle-key").addEventListener("click", () => {
      const input = document.getElementById("ai-key");
      const btn = document.getElementById("toggle-key");
      if (input.type === "password") { input.type = "text"; btn.textContent = "HIDE"; }
      else { input.type = "password"; btn.textContent = "SHOW"; }
    });
    document.getElementById("save-key").addEventListener("click", async () => {
      const v = document.getElementById("ai-key").value.trim();
      await PulseDB.setSetting("apiKey", v);
      toast(v ? "KEY SAVED" : "KEY CLEARED", "ok");
      renderCoachTipCard();
    });
    document.getElementById("clear-key").addEventListener("click", async () => {
      await PulseDB.setSetting("apiKey", "");
      document.getElementById("ai-key").value = "";
      toast("KEY CLEARED", "ok");
      renderCoachTipCard();
    });
    document.getElementById("test-key").addEventListener("click", async () => {
      const out = document.getElementById("test-result");
      out.hidden = false;
      out.className = "test-pill";
      out.textContent = "TESTING...";
      try {
        await PulseAI.testConnection();
        out.className = "test-pill ok";
        out.textContent = "OK · CONNECTION WORKING";
      } catch (err) {
        out.className = "test-pill err";
        out.textContent = PulseAI.friendlyError(err);
      }
    });
    document.getElementById("export-btn").addEventListener("click", async () => {
      const data = await PulseDB.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulsedesk-backup-${PulseDB.todayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const out = document.getElementById("export-result");
      out.hidden = false;
      out.className = "test-pill ok";
      out.textContent = `EXPORTED ${data.entries.length} ENTRIES`;
    });
    document.getElementById("import-btn").addEventListener("click", () => {
      document.getElementById("import-file").click();
    });
    document.getElementById("import-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await PulseDB.importAll(data, { includeChats: true });
        const out = document.getElementById("export-result");
        out.hidden = false;
        out.className = "test-pill ok";
        out.textContent = `IMPORTED ${data.entries ? data.entries.length : 0} ENTRIES`;
        toast("IMPORT DONE", "ok");
      } catch (err) {
        toast("INVALID FILE", "err");
      } finally {
        e.target.value = "";
      }
    });
    document.getElementById("clear-data").addEventListener("click", async () => {
      if (!confirm("DELETE ALL ENTRIES AND CHAT HISTORY?")) return;
      if (!confirm("THIS CANNOT BE UNDONE. CONTINUE?")) return;
      await PulseDB.clearAll({ settings: false });
      toast("ALL DATA CLEARED", "ok");
    });
    const keyInput = document.getElementById("ai-key");
    keyInput.addEventListener("input", () => {
      document.getElementById("test-key").disabled = !keyInput.value.trim();
    });
  }

  async function renderSettings() {
    const s = await PulseDB.getAllSettings();
    document.getElementById("ai-key").value = s.apiKey || "";
    document.getElementById("test-key").disabled = !s.apiKey;
    const picker = document.getElementById("model-picker");
    picker.innerHTML = "";
    PulseAI.MODELS.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "model-opt";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", m.id === s.model ? "true" : "false");
      const noteClass = m.note === "CHEAPEST" ? "model-opt__note--cheapest" : m.note === "POPULAR" ? "model-opt__note--popular" : "";
      btn.innerHTML = `
        <div class="model-opt__name">${m.label} <span class="model-opt__note ${noteClass}">${m.note}</span></div>
        <div class="model-opt__price">${m.price}</div>
        <div class="model-opt__price" style="color:var(--muted-2);font-size:0.48rem;margin-top:2px">${m.id}</div>
      `;
      btn.addEventListener("click", async () => {
        picker.querySelectorAll(".model-opt").forEach((x) => x.setAttribute("aria-checked", "false"));
        btn.setAttribute("aria-checked", "true");
        await PulseDB.setSetting("model", m.id);
        toast("MODEL SAVED", "ok");
      });
      picker.appendChild(btn);
    });
  }

  /* ---------- Coach ---------- */
  function wireCoach() {
    const refreshBtn = document.getElementById("coach-refresh");
    refreshBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await refreshCoachTip(true);
    });
    document.getElementById("coach-clear").addEventListener("click", async () => {
      if (!confirm("CLEAR CHAT HISTORY?")) return;
      await PulseDB.clearChat();
      renderCoach();
      toast("CHAT CLEARED", "ok");
    });
    const form = document.getElementById("composer");
    const input = document.getElementById("composer-input");
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(120, input.scrollHeight) + "px";
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      input.style.height = "auto";
      await sendMessage(text);
    });
  }

  async function renderCoachTipCard() {
    const card = document.getElementById("coach-card");
    const configured = await PulseAI.isConfigured();
    if (!configured) { card.hidden = true; return; }
    card.hidden = false;
    await refreshCoachTip(false);
  }

  async function refreshCoachTip(force) {
    const tipEl = document.getElementById("coach-tip");
    const refreshBtn = document.getElementById("coach-refresh");
    const today = PulseDB.todayKey();
    const cachedTip = await PulseDB.getSetting("coachTip");
    const cachedDate = await PulseDB.getSetting("coachTipDate");
    if (!force && cachedTip && cachedDate === today) {
      tipEl.textContent = cachedTip;
      return;
    }
    if (!navigator.onLine) {
      tipEl.textContent = cachedTip || "OFFLINE — CONNECT TO GET A FRESH TIP.";
      return;
    }
    tipEl.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
    refreshBtn.classList.add("spin");
    try {
      const summary = await PulseDB.getTodaySummary();
      const tip = await PulseAI.generateTip(summary);
      await PulseDB.setSetting("coachTip", tip);
      await PulseDB.setSetting("coachTipDate", today);
      tipEl.textContent = tip;
    } catch (err) {
      tipEl.textContent = cachedTip || PulseAI.friendlyError(err);
    } finally {
      refreshBtn.classList.remove("spin");
    }
  }

  async function renderCoach() {
    const list = document.getElementById("chat-list");
    const configured = await PulseAI.isConfigured();
    list.innerHTML = "";
    if (!configured) {
      list.innerHTML = `
        <div class="bubble bubble--system">SET AN OPENROUTER API KEY IN SETTINGS TO CHAT WITH THE COACH.</div>
        <div style="text-align:center;margin-top:10px"><button class="btn-neo btn-neo--peri" id="go-settings">OPEN SETTINGS</button></div>
      `;
      document.getElementById("go-settings").addEventListener("click", () => goto("settings"));
      renderSuggestions(false);
      return;
    }
    const msgs = await PulseDB.getChatMessages();
    if (!msgs.length) {
      list.innerHTML = `<div class="bubble bubble--assistant">HI — I'M PULSE COACH. ASK ABOUT YOUR HEART, SLEEP, HYDRATION, OR JUST SAY HI.</div>`;
    } else {
      msgs.forEach((m) => list.appendChild(bubble(m.role, m.text)));
    }
    renderSuggestions(true);
    scrollChatToEnd();
  }

  function renderSuggestions(configured) {
    const host = document.getElementById("chat-suggestions");
    host.innerHTML = "";
    if (!configured) return;
    const suggestions = [
      "HOW AM I DOING TODAY?",
      "ONE TIP TO HIT MY STEPS",
      "WHY IS HYDRATION IMPORTANT?",
      "ANALYZE MY SLEEP",
    ];
    suggestions.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggest-chip";
      btn.textContent = s;
      btn.addEventListener("click", () => sendMessage(s));
      host.appendChild(btn);
    });
  }

  function bubble(role, text) {
    const div = document.createElement("div");
    div.className = `bubble bubble--${role}`;
    div.textContent = text;
    return div;
  }

  async function sendMessage(text) {
    const list = document.getElementById("chat-list");
    if (list.querySelector(".bubble--system")) list.innerHTML = "";
    await PulseDB.addChatMessage("user", text);
    list.appendChild(bubble("user", text));
    scrollChatToEnd();

    if (!navigator.onLine) {
      list.appendChild(bubble("err", "OFFLINE — COACH NEEDS INTERNET"));
      scrollChatToEnd();
      return;
    }

    const assistantDiv = document.createElement("div");
    assistantDiv.className = "bubble bubble--assistant";
    assistantDiv.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
    list.appendChild(assistantDiv);
    scrollChatToEnd();

    const sendBtn = document.getElementById("composer-send");
    sendBtn.disabled = true;

    if (state.chatAbort) state.chatAbort.abort();
    state.chatAbort = new AbortController();

    try {
      const msgs = await PulseDB.getChatMessages();
      const history = msgs.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text,
      }));
      const summary = await PulseDB.getTodaySummary();
      let finalText = "";
      await PulseAI.chat(history, summary, (_delta, full) => {
        finalText = full;
        assistantDiv.textContent = full;
        scrollChatToEnd();
      }, { signal: state.chatAbort.signal });
      if (finalText) {
        await PulseDB.addChatMessage("assistant", finalText);
      } else {
        assistantDiv.remove();
        list.appendChild(bubble("err", "EMPTY RESPONSE"));
      }
    } catch (err) {
      assistantDiv.remove();
      list.appendChild(bubble("err", PulseAI.friendlyError(err)));
    } finally {
      sendBtn.disabled = false;
      state.chatAbort = null;
      scrollChatToEnd();
    }
  }

  function scrollChatToEnd() {
    const list = document.getElementById("chat-list");
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      list.scrollTop = list.scrollHeight;
    });
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(text, kind) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.className = "toast" + (kind ? ` ${kind}` : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  /* ---------- Service Worker ---------- */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js", { scope: "./" })
        .catch(() => {});
    });
  }
})();
