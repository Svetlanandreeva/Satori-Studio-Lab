import zlib from "zlib";
export { previewKind } from "@/lib/preview-kind";

/**
 * Предпросмотр вложений прямо в CRM без внешних сервисов:
 * .docx → HTML (абзацы, заголовки, жирный/курсив, списки, таблицы, картинки),
 * .xlsx → таблицы по листам, .txt/.csv → текст.
 * Результат — статичный HTML без скриптов; отдаётся с жёстким CSP.
 */

type ZipEntries = Map<string, Buffer>;

/** Минимальный ZIP-ридер (docx/xlsx — это zip). Читает central directory, поддерживает store и deflate. */
export function readZip(buf: Buffer): ZipEntries {
  const out: ZipEntries = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Файл повреждён или это не архив Office");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    try {
      if (method === 0) out.set(name, Buffer.from(data));
      else if (method === 8) out.set(name, zlib.inflateRawSync(data));
    } catch { /* битая запись — пропускаем */ }
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");
const attr = (xml: string, name: string) => { const m = xml.match(new RegExp(`${name}="([^"]*)"`)); return m ? unxml(m[1]) : null; };

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };

function docxRels(zip: ZipEntries) {
  const rels = new Map<string, string>();
  const xml = zip.get("word/_rels/document.xml.rels")?.toString("utf8") || "";
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id"); const target = attr(m[0], "Target");
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `word/${target}`);
  }
  return rels;
}

function runHtml(run: string, zip: ZipEntries, rels: Map<string, string>) {
  let html = "";
  // Картинки
  for (const m of run.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)) {
    const path = rels.get(m[1]);
    const data = path ? zip.get(path.replace(/\/\.\//g, "/")) : undefined;
    const ext = (path || "").split(".").pop()?.toLowerCase() || "";
    if (data && IMAGE_MIME[ext] && data.length < 8_000_000) html += `<img src="data:${IMAGE_MIME[ext]};base64,${data.toString("base64")}" alt="">`;
  }
  const parts: string[] = [];
  for (const m of run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
    if (m[0] === "<w:tab/>") parts.push("\t");
    else if (m[0] === "<w:br/>" || m[0] === "<w:cr/>") parts.push("\n");
    else parts.push(unxml(m[1] || ""));
  }
  let text = esc(parts.join("")).replace(/\n/g, "<br>");
  if (!text) return html;
  const rpr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] || "";
  const on = (tag: string) => new RegExp(`<w:${tag}(?:\\s+w:val="(?:1|true|on)")?\\s*/>`).test(rpr);
  if (on("b")) text = `<b>${text}</b>`;
  if (on("i")) text = `<i>${text}</i>`;
  if (/<w:u\s+w:val="(?!none)/.test(rpr)) text = `<u>${text}</u>`;
  if (on("strike")) text = `<s>${text}</s>`;
  return html + text;
}

function paragraphHtml(p: string, zip: ZipEntries, rels: Map<string, string>) {
  const style = p.match(/<w:pStyle\s+w:val="([^"]+)"/)?.[1] || "";
  const isList = /<w:numPr>/.test(p) || /^(List|Список)/i.test(style);
  const align = p.match(/<w:jc\s+w:val="(center|right|both)"/)?.[1];
  let inner = "";
  // Ссылки и обычные run'ы по порядку
  for (const m of p.matchAll(/<w:hyperlink\b[^>]*>[\s\S]*?<\/w:hyperlink>|<w:r\b[^>]*>[\s\S]*?<\/w:r>|<w:r\/>/g)) {
    if (m[0].startsWith("<w:hyperlink")) {
      const text = [...m[0].matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)].map((r) => runHtml(r[0], zip, rels)).join("");
      inner += `<span class="link">${text}</span>`;
    } else inner += runHtml(m[0], zip, rels);
  }
  const heading = style.match(/^(?:Heading|heading|Заголовок)\s?(\d)$/)?.[1] || (/^Title$/i.test(style) ? "1" : null);
  const styleAttr = align ? ` style="text-align:${align === "both" ? "justify" : align}"` : "";
  if (heading) return `<h${Math.min(4, Number(heading) + 0)}${styleAttr}>${inner}</h${Math.min(4, Number(heading))}>`;
  if (isList) return `<li${styleAttr}>${inner || "&nbsp;"}</li>`;
  return `<p${styleAttr}>${inner || "&nbsp;"}</p>`;
}

function blockHtml(xml: string, zip: ZipEntries, rels: Map<string, string>): string {
  let html = "";
  let listOpen = false;
  // Верхнеуровневые абзацы и таблицы по порядку
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  for (const m of xml.matchAll(re)) {
    let piece: string;
    if (m[0].startsWith("<w:tbl>")) {
      const rows = [...m[0].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) =>
        `<tr>${[...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => {
          const span = c[1].match(/<w:gridSpan\s+w:val="(\d+)"/)?.[1];
          return `<td${span ? ` colspan="${span}"` : ""}>${blockHtml(c[1], zip, rels)}</td>`;
        }).join("")}</tr>`).join("");
      piece = `<table>${rows}</table>`;
    } else if (m[0].endsWith("/>") && !m[0].includes("</w:p>")) piece = "<p>&nbsp;</p>";
    else piece = paragraphHtml(m[0], zip, rels);
    const isLi = piece.startsWith("<li");
    if (isLi && !listOpen) { html += "<ul>"; listOpen = true; }
    if (!isLi && listOpen) { html += "</ul>"; listOpen = false; }
    html += piece;
  }
  if (listOpen) html += "</ul>";
  return html;
}

export function docxToHtml(buf: Buffer) {
  const zip = readZip(buf);
  const doc = zip.get("word/document.xml")?.toString("utf8");
  if (!doc) throw new Error("В файле нет текста документа");
  // Вложенные таблицы: regex-подход берёт внешние; для КП этого достаточно.
  const body = doc.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] || doc;
  return blockHtml(body, zip, docxRels(zip));
}

function colIndex(ref: string) {
  const letters = ref.replace(/\d+/g, "");
  let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function xlsxToHtml(buf: Buffer) {
  const zip = readZip(buf);
  const shared = [...(zip.get("xl/sharedStrings.xml")?.toString("utf8") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => unxml(t[1])).join(""));
  const wb = zip.get("xl/workbook.xml")?.toString("utf8") || "";
  const relsXml = zip.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) { const id = attr(m[0], "Id"); const t = attr(m[0], "Target"); if (id && t) rels.set(id, t.startsWith("/") ? t.slice(1) : `xl/${t}`); }
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: attr(m[0], "name") || "Лист", path: rels.get(attr(m[0], "r:id") || "") || "" }));
  let html = "";
  for (const sheet of sheets.slice(0, 10)) {
    const xml = zip.get(sheet.path)?.toString("utf8");
    if (!xml) continue;
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= 1000) break;
      const row: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], "r"); const type = attr(c[1], "t");
        const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? [...(c[2] || "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => unxml(t[1])).join("") : v != null ? unxml(v) : "";
        if (type !== "s" && type !== "inlineStr" && type !== "str" && val && /^-?\d+\.\d{6,}$/.test(val)) val = String(Math.round(Number(val) * 100) / 100);
        const idx = ref ? colIndex(ref) : row.length;
        while (row.length < idx) row.push("");
        row[idx] = val;
      }
      rows.push(row);
    }
    while (rows.length && rows[rows.length - 1].every((x) => !x)) rows.pop();
    const width = Math.min(40, Math.max(0, ...rows.map((r) => r.length)));
    html += `<h3>${esc(sheet.name)}</h3>`;
    html += rows.length ? `<table class="sheet">${rows.map((r) => `<tr>${Array.from({ length: width }, (_, i) => `<td>${esc(r[i] || "")}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="muted">Пустой лист</p>`;
  }
  return html || `<p class="muted">В таблице нет данных</p>`;
}

export function textToHtml(buf: Buffer) {
  let text = buf.toString("utf8");
  if (text.includes("�")) text = new TextDecoder("windows-1251").decode(buf);
  return `<pre>${esc(text.slice(0, 500_000))}</pre>`;
}

export function previewPage(title: string, body: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{margin:0;background:#f1f5f9;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a}
.page{max-width:820px;margin:24px auto;background:#fff;padding:48px 56px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.page.wide{max-width:none;margin:16px;padding:20px;overflow:auto}
p{margin:0 0 6px}h1,h2,h3,h4{margin:14px 0 8px;line-height:1.3}h3{font-size:15px}
table{border-collapse:collapse;margin:10px 0;width:100%}td{border:1px solid #cbd5e1;padding:5px 8px;vertical-align:top}td p{margin:0}
table.sheet{width:auto;font-size:13px}table.sheet td{white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis}table.sheet tr:first-child td{background:#f8fafc;font-weight:600}
img{max-width:100%;height:auto}ul{margin:4px 0 8px;padding-left:22px}.link{color:#2563eb;text-decoration:underline}.muted{color:#64748b}
pre{white-space:pre-wrap;word-break:break-word;font:13px/1.5 ui-monospace,Menlo,monospace;margin:0}
@media(max-width:700px){.page{margin:0;border-radius:0;padding:20px}}
</style></head><body>${body}</body></html>`;
}
