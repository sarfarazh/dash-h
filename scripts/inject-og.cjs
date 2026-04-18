/**
 * On Netlify, replace relative /og-image.png with absolute URLs so Twitter / LinkedIn
 * pick up thumbnails reliably. No-op locally when URL env vars are unset.
 */
const fs = require("fs");
const path = require("path");

const base = (
  process.env.DEPLOY_PRIME_URL ||
  process.env.URL ||
  process.env.DEPLOY_URL ||
  ""
)
  .trim()
  .replace(/\/$/, "");

if (!base) {
  process.exit(0);
}

const htmlPath = path.join(__dirname, "..", "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
const abs = `${base}/og-image.png`;

if (!html.includes('content="/og-image.png"')) {
  process.exit(0);
}

html = html.replace(/content="\/og-image\.png"/g, `content="${abs}"`);
fs.writeFileSync(htmlPath, html);
