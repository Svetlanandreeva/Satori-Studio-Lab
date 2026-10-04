import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Run from the assembled, npm-installed pinned Auto-CRM directory.
// Use its exact React, TypeScript, and icon packages. No browser or network.
const requireApp = createRequire(path.join(process.cwd(), "package.json"));
const ts = requireApp("typescript");
const React = requireApp("react");
const { renderToStaticMarkup } = requireApp("react-dom/server");
const sourceRoot = fileURLToPath(new URL("../overrides/src/", import.meta.url));
const cache = new Map();

function loadSource(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath);
  const filename = path.join(sourceRoot, relativePath);
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  assert.equal(diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  const result = { exports: {} };
  const requireModule = (specifier) => specifier === "@/lib/telegram-phone-link"
    ? loadSource("lib/telegram-phone-link.ts") : requireApp(specifier);
  new Function("require", "module", "exports", outputText)(requireModule, result, result.exports);
  cache.set(relativePath, result.exports);
  return result.exports;
}

const { TelegramPhoneLink } = loadSource("components/contacts/TelegramPhoneLink.tsx");
const render = (phone) => renderToStaticMarkup(React.createElement(TelegramPhoneLink, { phone }));

test("actual React component renders an accessible external link", () => {
  const html = render("8 (912) 345-67-89");
  assert.match(html, /href="https:\/\/t\.me\/\+79123456789"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /Открыть Telegram/);
  assert.match(html, /Наличие аккаунта не проверяется/);
  assert.match(html, /aria-hidden="true"/);
  assert.equal((html.match(/<a /g) || []).length, 1);
});

test("component hides the action for absent, invalid, and ambiguous values", () => {
  for (const phone of [null, "", "9123456789", "+44 (0)20 7946 0123", "https://example.com", "+79123456789;123"]) {
    assert.equal(render(phone), "");
  }
});

test("changing phone props cannot retain an old link", () => {
  for (const phone of ["+12025550123", "+442079460123", null, "+79123456789", "", "+12025550123"]) {
    const html = render(phone);
    if (phone) assert.ok(html.includes(`href="https://t.me/${phone}"`));
    else assert.equal(html, "");
  }
});

test("component has no click, submit, or status mutation handler", () => {
  const element = TelegramPhoneLink({ phone: "+79123456789" });
  assert.equal(element.type, "a");
  assert.equal(element.props.onClick, undefined);
  assert.equal(element.props.onSubmit, undefined);
  assert.equal(element.props.download, undefined);
  assert.equal(element.props.href.includes("?"), false);
  assert.equal(element.props.rel, "noopener noreferrer");
});
