/* Pulse Desk — IndexedDB wrapper with pub-sub bus */
(function (global) {
  "use strict";

  const DB_NAME = "pulsedesk";
  const DB_VERSION = 1;
  const STORES = { entries: "entries", settings: "settings", chats: "chats" };

  const DEFAULTS = {
    hydrationGoal: 2500,
    stepsGoal: 10000,
    calorieGoal: 2500,
    displayName: "TRACKER",
    apiKey: "",
    model: "google/gemini-3-flash-preview",
    coachTip: "",
    coachTipDate: "",
  };

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.entries)) {
          const s = db.createObjectStore(STORES.entries, {
            keyPath: "id",
            autoIncrement: true,
          });
          s.createIndex("type", "type", { unique: false });
          s.createIndex("date", "date", { unique: false });
          s.createIndex("ts", "ts", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORES.chats)) {
          const s = db.createObjectStore(STORES.chats, {
            keyPath: "id",
            autoIncrement: true,
          });
          s.createIndex("ts", "ts", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return openDB().then((db) => {
      const transaction = db.transaction(storeName, mode);
      return transaction.objectStore(storeName);
    });
  }

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function todayKey(d) {
    const date = d || new Date();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${day}`;
  }

  /* ---------- Bus ---------- */
  const bus = new EventTarget();
  function emit(name, detail) {
    bus.dispatchEvent(new CustomEvent(name, { detail }));
  }
  function on(name, handler) {
    bus.addEventListener(name, handler);
    return () => bus.removeEventListener(name, handler);
  }

  /* ---------- Entries ---------- */
  async function addEntry(type, value, dateOverride) {
    const now = Date.now();
    const date = dateOverride || todayKey();
    const entry = { type, value, date, ts: now };
    const store = await tx(STORES.entries, "readwrite");
    const id = await promisify(store.add(entry));
    entry.id = id;
    emit("entries:change", entry);
    emit("change", { kind: "entries" });
    return entry;
  }

  async function deleteEntry(id) {
    const store = await tx(STORES.entries, "readwrite");
    await promisify(store.delete(id));
    emit("entries:change", { id, deleted: true });
    emit("change", { kind: "entries" });
  }

  async function getEntriesByDate(date) {
    const key = typeof date === "string" ? date : todayKey(date);
    const store = await tx(STORES.entries, "readonly");
    const idx = store.index("date");
    const all = await promisify(idx.getAll(key));
    return all.sort((a, b) => a.ts - b.ts);
  }

  async function getEntriesByType(type, limit) {
    const store = await tx(STORES.entries, "readonly");
    const idx = store.index("type");
    const all = await promisify(idx.getAll(type));
    all.sort((a, b) => b.ts - a.ts);
    return typeof limit === "number" ? all.slice(0, limit) : all;
  }

  async function getEntriesInRange(startDate, endDate) {
    const store = await tx(STORES.entries, "readonly");
    const idx = store.index("date");
    const range = IDBKeyRange.bound(startDate, endDate);
    const all = await promisify(idx.getAll(range));
    return all.sort((a, b) => a.ts - b.ts);
  }

  async function getAllEntries() {
    const store = await tx(STORES.entries, "readonly");
    const all = await promisify(store.getAll());
    return all.sort((a, b) => b.ts - a.ts);
  }

  /* ---------- Settings ---------- */
  async function getSetting(key) {
    const store = await tx(STORES.settings, "readonly");
    const row = await promisify(store.get(key));
    if (row && "value" in row) return row.value;
    return DEFAULTS[key];
  }

  async function setSetting(key, value) {
    const store = await tx(STORES.settings, "readwrite");
    await promisify(store.put({ key, value }));
    emit("settings:change", { key, value });
    emit("change", { kind: "settings", key });
  }

  async function getAllSettings() {
    const store = await tx(STORES.settings, "readonly");
    const rows = await promisify(store.getAll());
    const out = Object.assign({}, DEFAULTS);
    rows.forEach((r) => (out[r.key] = r.value));
    return out;
  }

  /* ---------- Chats ---------- */
  async function addChatMessage(role, text) {
    const msg = { role, text, ts: Date.now() };
    const store = await tx(STORES.chats, "readwrite");
    const id = await promisify(store.add(msg));
    msg.id = id;
    emit("chats:change", msg);
    return msg;
  }

  async function getChatMessages() {
    const store = await tx(STORES.chats, "readonly");
    const all = await promisify(store.getAll());
    return all.sort((a, b) => a.ts - b.ts);
  }

  async function clearChat() {
    const store = await tx(STORES.chats, "readwrite");
    await promisify(store.clear());
    emit("chats:change", { cleared: true });
  }

  /* ---------- Summary ---------- */
  async function getTodaySummary() {
    const entries = await getEntriesByDate(todayKey());
    const settings = await getAllSettings();
    const sum = (arr, key) =>
      arr.reduce((a, b) => a + (Number(b.value && b.value[key]) || 0), 0);
    const latest = (arr) => (arr.length ? arr[arr.length - 1] : null);
    const heart = entries.filter((e) => e.type === "heart");
    const avgHeart = heart.length
      ? Math.round(heart.reduce((a, b) => a + (b.value.bpm || 0), 0) / heart.length)
      : 0;
    const sleep = latest(entries.filter((e) => e.type === "sleep"));
    const recovery = latest(entries.filter((e) => e.type === "recovery"));
    const activity = latest(entries.filter((e) => e.type === "activity"));
    return {
      date: todayKey(),
      goals: {
        hydration: settings.hydrationGoal,
        steps: settings.stepsGoal,
        kcal: settings.calorieGoal,
      },
      name: settings.displayName,
      heart: {
        series: heart.map((e) => ({ ts: e.ts, bpm: e.value.bpm })),
        avg: avgHeart,
        latest: heart.length ? heart[heart.length - 1].value.bpm : 0,
      },
      sleep: sleep ? sleep.value : null,
      food: sum(entries.filter((e) => e.type === "food"), "kcal"),
      burn: sum(entries.filter((e) => e.type === "burn"), "kcal"),
      hydrationMl: sum(entries.filter((e) => e.type === "hydration"), "ml"),
      steps: sum(entries.filter((e) => e.type === "steps"), "count"),
      recovery: recovery ? recovery.value : null,
      activity: activity ? activity.value : null,
      entries,
    };
  }

  /* ---------- Streak ---------- */
  async function getStreak() {
    const store = await tx(STORES.entries, "readonly");
    const dates = new Set();
    await new Promise((resolve) => {
      const req = store.index("date").openKeyCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          dates.add(cur.key);
          cur.continue();
        } else resolve();
      };
      req.onerror = () => resolve();
    });
    let streak = 0;
    const d = new Date();
    while (dates.has(todayKey(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  /* ---------- Export / Import ---------- */
  async function exportAll() {
    const entries = await getAllEntries();
    const allSettings = await getAllSettings();
    const chats = await getChatMessages();
    const settings = Object.assign({}, allSettings);
    delete settings.apiKey;
    return {
      app: "pulsedesk",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
      settings,
      chats,
    };
  }

  async function importAll(data, options) {
    if (!data || data.app !== "pulsedesk") throw new Error("Invalid backup");
    const opts = options || {};
    if (Array.isArray(data.entries)) {
      const existing = await getAllEntries();
      const seen = new Set(
        existing.map((e) => `${e.ts}|${e.type}|${JSON.stringify(e.value)}`)
      );
      const store = await tx(STORES.entries, "readwrite");
      for (const e of data.entries) {
        const key = `${e.ts}|${e.type}|${JSON.stringify(e.value)}`;
        if (seen.has(key)) continue;
        const copy = { type: e.type, value: e.value, date: e.date, ts: e.ts };
        await promisify(store.add(copy));
      }
    }
    if (data.settings && typeof data.settings === "object") {
      const store = await tx(STORES.settings, "readwrite");
      for (const [k, v] of Object.entries(data.settings)) {
        if (k === "apiKey") continue;
        await promisify(store.put({ key: k, value: v }));
      }
    }
    if (Array.isArray(data.chats) && opts.includeChats) {
      const store = await tx(STORES.chats, "readwrite");
      for (const m of data.chats) {
        await promisify(
          store.add({ role: m.role, text: m.text, ts: m.ts })
        );
      }
    }
    emit("change", { kind: "import" });
  }

  async function clearAll(options) {
    const opts = options || {};
    const db = await openDB();
    const stores = [STORES.entries, STORES.chats];
    if (opts.settings) stores.push(STORES.settings);
    const transaction = db.transaction(stores, "readwrite");
    await Promise.all(
      stores.map((s) => promisify(transaction.objectStore(s).clear()))
    );
    emit("change", { kind: "clear" });
  }

  global.PulseDB = {
    openDB,
    todayKey,
    on,
    addEntry,
    deleteEntry,
    getEntriesByDate,
    getEntriesByType,
    getEntriesInRange,
    getAllEntries,
    getSetting,
    setSetting,
    getAllSettings,
    addChatMessage,
    getChatMessages,
    clearChat,
    getTodaySummary,
    getStreak,
    exportAll,
    importAll,
    clearAll,
    DEFAULTS,
  };
})(window);
