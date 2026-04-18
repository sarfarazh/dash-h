/* Pulse Desk — OpenRouter AI client (optional feature) */
(function (global) {
  "use strict";

  const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
  const TITLE = "Pulse Desk";

  const MODELS = [
    {
      id: "google/gemini-3-flash-preview",
      label: "GEMINI 3 FLASH",
      price: "$0.50/M IN · $3/M OUT",
      note: "RECOMMENDED",
    },
    {
      id: "x-ai/grok-4.1-fast",
      label: "GROK 4.1 FAST",
      price: "$0.20/M IN · $0.50/M OUT",
      note: "CHEAPEST",
    },
    {
      id: "google/gemini-2.5-flash",
      label: "GEMINI 2.5 FLASH",
      price: "$0.30/M IN · $2.50/M OUT",
      note: "POPULAR",
    },
  ];

  async function isConfigured() {
    const key = await PulseDB.getSetting("apiKey");
    return Boolean(key && key.trim());
  }

  function fmt(n) {
    return typeof n === "number" ? n : 0;
  }

  function buildSystemPrompt(summary) {
    const g = summary.goals;
    const s = summary.sleep;
    const sleepStr = s
      ? `${s.score || "?"}/100 over ${Math.round((s.minutes || 0) / 60 * 10) / 10}h`
      : "not logged";
    const rec = summary.recovery ? `${summary.recovery.pct}%` : "not logged";
    return [
      "You are PULSE COACH, a concise, upbeat health coach inside a mobile PWA.",
      `User name: ${summary.name || "TRACKER"}.`,
      `Goals: hydration ${g.hydration}ml, steps ${g.steps}, kcal ${g.kcal}.`,
      "Today so far:",
      `- heart avg ${fmt(summary.heart.avg)} bpm`,
      `- sleep ${sleepStr}`,
      `- hydration ${fmt(summary.hydrationMl)} ml`,
      `- steps ${fmt(summary.steps)}`,
      `- kcal in ${fmt(summary.food)} / out ${fmt(summary.burn)}`,
      `- recovery ${rec}`,
      "Answer in ≤3 short sentences unless asked for detail.",
      "Use UPPERCASE labels when referring to metrics (e.g. HYDRATION).",
      "Never invent data you were not given. If a metric is missing, suggest logging it.",
    ].join("\n");
  }

  async function callOpenRouter(messages, opts) {
    const options = opts || {};
    const apiKey = await PulseDB.getSetting("apiKey");
    const model = (await PulseDB.getSetting("model")) || MODELS[0].id;
    if (!apiKey) throw new Error("NO_KEY");
    if (!navigator.onLine) throw new Error("OFFLINE");

    const body = {
      model,
      messages,
      stream: Boolean(options.stream),
    };
    if (typeof options.maxTokens === "number") body.max_tokens = options.maxTokens;
    if (typeof options.temperature === "number") body.temperature = options.temperature;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": location.origin || "https://pulsedesk.local",
        "X-Title": TITLE,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = (j && j.error && j.error.message) || "";
      } catch (_) {}
      const err = new Error(detail || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  async function generateTip(summary, opts) {
    const messages = [
      { role: "system", content: buildSystemPrompt(summary) },
      {
        role: "user",
        content:
          "Give ONE short, motivating daily tip (≤2 sentences, ALL CAPS optional for metric labels). Focus on whatever metric most needs attention today.",
      },
    ];
    const res = await callOpenRouter(messages, {
      stream: false,
      maxTokens: 120,
      temperature: 0.6,
      signal: opts && opts.signal,
    });
    const j = await res.json();
    const text =
      (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) ||
      "";
    return text.trim();
  }

  async function chat(userMessages, summary, onToken, opts) {
    const messages = [
      { role: "system", content: buildSystemPrompt(summary) },
      ...userMessages,
    ];
    const res = await callOpenRouter(messages, {
      stream: true,
      signal: opts && opts.signal,
      temperature: 0.7,
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const delta =
            j.choices &&
            j.choices[0] &&
            (j.choices[0].delta?.content || j.choices[0].message?.content || "");
          if (delta) {
            full += delta;
            if (onToken) onToken(delta, full);
          }
        } catch (_) {
          /* ignore malformed chunks */
        }
      }
    }
    return full.trim();
  }

  async function testConnection(opts) {
    const res = await callOpenRouter(
      [
        { role: "system", content: "Reply with: OK" },
        { role: "user", content: "ping" },
      ],
      { stream: false, maxTokens: 5, signal: opts && opts.signal }
    );
    const j = await res.json();
    return {
      ok: true,
      text:
        (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) ||
        "OK",
    };
  }

  function friendlyError(err) {
    if (!err) return "UNKNOWN ERROR";
    const m = err.message || String(err);
    if (m === "NO_KEY") return "NO API KEY — ADD ONE IN SETTINGS";
    if (m === "OFFLINE") return "COACH NEEDS INTERNET";
    if (err.status === 401) return "KEY REJECTED (401)";
    if (err.status === 402) return "OUT OF CREDITS (402)";
    if (err.status === 404) return "MODEL NOT FOUND (404)";
    if (err.status === 429) return "RATE LIMITED — TRY AGAIN SHORTLY";
    if (err.name === "AbortError") return "CANCELLED";
    return m.toUpperCase().slice(0, 140);
  }

  global.PulseAI = {
    MODELS,
    isConfigured,
    generateTip,
    chat,
    testConnection,
    friendlyError,
    buildSystemPrompt,
  };
})(window);
