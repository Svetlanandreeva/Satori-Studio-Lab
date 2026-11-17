const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const pub = path.join(__dirname, "..", "public");

test("Seasonality data has 12 monthly indices per direction", () => {
  const data = JSON.parse(readFileSync(path.join(pub, "seasonality-data.json"), "utf8"));
  assert.ok(Array.isArray(data.series) && data.series.length >= 1);
  for (const s of data.series) {
    assert.equal(s.index.length, 12, s.id);
    const avg = s.index.reduce((a, b) => a + b, 0) / 12;
    assert.ok(Math.abs(avg - 1) < 0.02, `${s.id} average ${avg}`);
  }
});

test("Seasonality card only watches direct children of the CRM root", () => {
  const src = readFileSync(path.join(pub, "seasonality-ui.js"), "utf8");
  assert.match(src, /observe\(root, \{ childList: true, subtree: false \}\)/);
  assert.match(src, /root\.querySelector\("\.season-card"\)\) return;/);
});
