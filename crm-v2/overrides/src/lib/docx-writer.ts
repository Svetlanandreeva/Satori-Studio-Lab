import zlib from "zlib";

/** Минимальный генератор .docx без зависимостей: абзацы, заголовки, жирный текст, таблицы. */
export type DocBlock =
  | { type: "h1" | "h2" | "p" | "small"; text: string; bold?: boolean; align?: "left" | "center" | "right" }
  | { type: "table"; rows: string[][]; header?: boolean; widths?: number[] }
  | { type: "spacer" };

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf: Buffer) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const comp = zlib.deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28); name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(f.data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); name.copy(central, 46);
    locals.push(local, comp); centrals.push(central); offset += local.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function run(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  const lines = text.split("\n");
  const rpr = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${opts.bold ? "<w:b/>" : ""}${opts.color ? `<w:color w:val="${opts.color}"/>` : ""}<w:sz w:val="${opts.size || 22}"/></w:rPr>`;
  return lines.map((l, i) => `<w:r>${rpr}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${x(l)}</w:t></w:r>`).join("");
}
function para(inner: string, opts: { align?: string; after?: number } = {}) {
  return `<w:p><w:pPr><w:spacing w:after="${opts.after ?? 120}"/>${opts.align ? `<w:jc w:val="${opts.align === "right" ? "right" : opts.align === "center" ? "center" : "left"}"/>` : ""}</w:pPr>${inner}</w:p>`;
}

export function buildDocx(blocks: DocBlock[]): Buffer {
  const body = blocks.map((b) => {
    if (b.type === "spacer") return para("", { after: 60 });
    if (b.type === "h1") return para(run(b.text, { bold: true, size: 36 }), { after: 200, align: b.align });
    if (b.type === "h2") return para(run(b.text, { bold: true, size: 26 }), { after: 100, align: b.align });
    if (b.type === "small") return para(run(b.text, { size: 18, color: "6B7280" }), { after: 80, align: b.align });
    if (b.type !== "table") return para(run(b.text, { bold: b.bold }), { align: b.align });
    const cols = Math.max(...b.rows.map((r) => r.length));
    const widths = b.widths || Array.from({ length: cols }, () => Math.floor(9000 / cols));
    const border = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="D1D5DB"/>`).join("")}</w:tblBorders>`;
    const rows = b.rows.map((r, ri) => `<w:tr>${Array.from({ length: cols }, (_, ci) => `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/>${b.header && ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>' : ""}</w:tcPr>${para(run(r[ci] || "", { bold: b.header && ri === 0, size: 20 }), { after: 40, align: ci > 0 && /^[\d\s.,₽%-]+$/.test(r[ci] || "") ? "right" : undefined })}</w:tc>`).join("")}</w:tr>`).join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>${border}<w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows}</w:tbl>${para("", { after: 120 })}`;
  }).join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`) },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: "word/document.xml", data: Buffer.from(document) },
  ]);
}
