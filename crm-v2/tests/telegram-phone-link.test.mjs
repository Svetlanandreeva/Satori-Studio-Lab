import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeTelegramPhone, telegramPhoneHref } from "../overrides/src/lib/telegram-phone-link.ts";

const accepted = [
  ["+7 (912) 345-67-89", "+79123456789"],
  ["8 (912) 345-67-89", "+79123456789"],
  ["79123456789", "+79123456789"],
  ["  +7\u00a0912\u202f345 67 89  ", "+79123456789"],
  ["+1 (202) 555-0123", "+12025550123"],
  ["+44 20 7946 0123", "+442079460123"],
  ["+49 30 123456", "+4930123456"],
  ["+81 3 1234 5678", "+81312345678"],
  ["+7 701 123 45 67", "+77011234567"],
  ["+39 06 6982", "+39066982"],
  ["+4930123", "+4930123"],
  ["+493012345678901", "+493012345678901"],
];
for (const [input, normalized] of accepted) {
  test(`normalizes ${JSON.stringify(input)} without mutating it`, () => {
    assert.equal(normalizeTelegramPhone(input), normalized);
    assert.equal(telegramPhoneHref(input), `https://t.me/${normalized}`);
    assert.equal(normalizeTelegramPhone(normalized), normalized);
  });
}

const rejected = [
  null, undefined, "", "   ", 79123456789, {}, [], true,
  "9123456789", "2025550123", "442079460123", "00442079460123",
  "+0123456789", "+493012", "+4930123456789012", "+12345", "+1234567890123456", "+7912345678", "+1202555012",
  "+7 (912 345-67-89", "+7 912) 345-67-89", "+7 () 9123456789", "+7 ((912)) 3456789",
  "+7 (912) (345) 67-89", "+44 (0)20 7946 0123", "+7 (91 2) 3456789",
  "++79123456789", "7+9123456789", "+7/9123456789", "+79123456789;123", "+79123456789,123",
  "+79123456789 доб. 123", "+79123456789 ext 123", "+79123456789#123",
  "+79123456789 / +79001234567", "+79123456789\n+79001234567", "+7912\t3456789",
  "+79123456789?text=Hi", "https://t.me/+79123456789", "javascript:1234567890",
  "<a>+79123456789</a>", "+７９１２３４５６７８９", "+79123456789-", "+7\u200b9123456789", "-79123456789", "+7\u202e9123456789",
];
for (const input of rejected) {
  test(`rejects ambiguous or malformed ${JSON.stringify(input)}`, () => {
    assert.equal(normalizeTelegramPhone(input), null);
    assert.equal(telegramPhoneHref(input), null);
  });
}

test("link is a passive HTTPS anchor with no prefetch, send, or contact mutation", () => {
  const source = readFileSync(new URL("../overrides/src/components/contacts/TelegramPhoneLink.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!href\) return null/);
  assert.match(source, /<a\s/);
  assert.match(source, /href=\{href\}/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /Наличие аккаунта не проверяется/);
  assert.doesNotMatch(source, /onClick=|fetch\(|window\.open|next\/link|useEffect|localStorage|api\.telegram\.org/);
});

test("phone link has no profile, draft, or other query parameters", () => {
  const url = new URL(telegramPhoneHref("+7 912 345 67 89"));
  assert.equal(url.origin, "https://t.me");
  assert.equal(url.pathname, "/+79123456789");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
});

test("card keeps call and copy actions alongside the new Telegram action", () => {
  const source = readFileSync(new URL("../overrides/src/components/contacts/ContactDetail.tsx", import.meta.url), "utf8");
  assert.match(source, /href=\{`tel:\$\{contact\.phone\}`\}/);
  assert.match(source, /onCopy=\{\(\) => copy\(contact\.phone!, "phone"\)\}/);
  assert.match(source, /<TelegramPhoneLink phone=\{contact\.phone\} \/>/);
});
