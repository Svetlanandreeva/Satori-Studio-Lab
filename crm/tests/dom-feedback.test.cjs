// Regression test for a historical CRM freeze: MutationObserver callbacks
// must never mutate unchanged labels and schedule an endless microtask loop.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const publicDir = path.resolve(__dirname, "../public");

test("Source number decoration reaches a stable DOM without feedback", () => {
  let observerCallback = null;
  let mutationCount = 0;
  let badge = null;
  const source = {
    insertAdjacentElement(_position, element) {
      badge = element;
      mutationCount++;
    },
  };
  const card = {
    dataset: { dealId: "lead:123e4567-e89b-12d3-a456-426614174000" },
    querySelector(selector) {
      if (selector === ".crm-source-number") return badge;
      if (selector === ".source") return source;
      return null;
    },
  };
  const context = {
    URLSearchParams,
    window: { location: { search: "" } },
    document: {
      documentElement: {},
      addEventListener() {},
      createElement() {
        return {
          className: "",
          get textContent() { return this._text || ""; },
          set textContent(value) { this._text = value; mutationCount++; },
        };
      },
      querySelectorAll(selector) {
        return selector === ".deal[data-deal-id]" ? [card] : [];
      },
    },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
    },
    setTimeout() {},
  };
  vm.runInNewContext(readFileSync(path.join(publicDir, "source-link-ui.js"), "utf8"), context);
  assert.ok(badge);
  assert.equal(badge.textContent, "№ S-123E4567");
  assert.ok(observerCallback);
  const initialMutations = mutationCount;
  for (let index = 0; index < 12; index++) observerCallback();
  assert.equal(mutationCount, initialMutations,
    "Repeated observer notifications must not create further DOM mutations");
});

test("Brief labels only rewrite the DOM when their display changes", () => {
  const source = readFileSync(path.join(publicDir, "brief-ui.js"), "utf8");
  assert.match(source, /if \(badge\.textContent !== label\) badge\.textContent = label;/);
});

test("Fresh extension version is loaded after the freeze fix", () => {
  const html = readFileSync(path.join(publicDir, "index.html"), "utf8");
  const loader = readFileSync(path.join(publicDir, "post-auth-loader.js"), "utf8");
  const worker = readFileSync(path.join(publicDir, "sw.js"), "utf8");
  assert.match(html, /post-auth-loader\.js\?v=freeze-fix-2/);
  assert.match(loader, /source-link-ui\.js\?v=freeze-fix-2/);
  assert.match(loader, /brief-ui\.js\?v=freeze-fix-2/);
  assert.match(worker, /satori-crm-v23/);
});
