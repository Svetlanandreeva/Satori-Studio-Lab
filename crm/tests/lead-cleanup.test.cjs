const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const base = path.resolve(__dirname, "../..");
const serverFile = fs.readFileSync(path.join(base, "crm/server.js"), "utf8");
const leadsFile = fs.readFileSync(path.join(base, "server/leads.js"), "utf8");
const uiFile = fs.readFileSync(path.join(base, "crm/public/app.js"), "utf8");

function createConditionalRemover(initialLeads) {
  const source = leadsFile.match(/export async function deleteLeadIfSpam\(id\) \{[\s\S]*?\n\}\n\nexport async function deleteLead\(/);
  assert.ok(source, "Expected conditional spam delete method");
  const functionCode = source[0].replace(/\n\nexport async function deleteLead\($/, "").replace(/^export /, "");
  let state = structuredClone(initialLeads);
  let writes = 0;
  const fn = new Function(
    "withWriteLock", "readLeads", "writeFile", "LEADS_FILE",
    functionCode + "\nreturn deleteLeadIfSpam;",
  )(
    async operation => operation(),
    async () => structuredClone(state),
    async (_path, text) => { state = JSON.parse(text); writes++; },
    "leads.test.json",
  );
  return { fn, get state() { return state; }, get writes() { return writes; } };
}

test("Can permanently delete a spam lead, never an active lead", async () => {
  const storage = createConditionalRemover([
    { id: "keep", name: "Real client", isSpam: false },
    { id: "trash", name: "Test spam", isSpam: true },
  ]);
  assert.equal(await storage.fn("keep"), "not-spam");
  assert.equal(storage.writes, 0);
  assert.equal(await storage.fn("trash"), "deleted");
  assert.deepEqual(storage.state.map(x => x.id), ["keep"]);
  assert.equal(await storage.fn("trash"), "missing");
  assert.equal(storage.writes, 1);
});

test("Legacy CRM only permanently removes spam and never paid web orders", () => {
  assert.match(serverFile, /if \(dealId\.startsWith\("web:"\)\) return res\.status\(403\)/);
  assert.match(serverFile, /const removal = await deleteLeadIfSpam\(leadId\)/);
  assert.match(serverFile, /if \(removal === "not-spam"\) return res\.status\(409\)/);
  assert.match(serverFile, /delete data\.leadStages\[leadId\]/);
  assert.match(serverFile, /const activeLeads = leads\.filter\(\(lead\) => !lead\.isSpam\)/);
});

test("UI has a Spam tab with restore and permanent-delete actions", () => {
  assert.match(uiFile, /navButton\("spam","Спам"/);
  assert.match(uiFile, /function spamView\(\)/);
  assert.match(uiFile, /function changeLeadSpam\(deal, isSpam\)/);
  assert.match(uiFile, /function removeSpamLead\(deal\)/);
  assert.match(uiFile, /"В спам"/);
  assert.match(uiFile, /"Удалить навсегда"/);
  assert.match(uiFile, /!d\.isSpam&&d\.stage===stage/);
});
