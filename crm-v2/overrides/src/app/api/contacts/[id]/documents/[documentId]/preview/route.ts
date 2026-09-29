import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getClientDocument } from "@/lib/client-documents";
import { docxToHtml, previewKind, previewPage, textToHtml, xlsxToHtml } from "@/lib/office-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** HTML-предпросмотр вложения (docx, xlsx, txt/csv). Без скриптов, картинки только data:. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  const document = getClientDocument(documentId, id);
  if (!document) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  const name = String(document.name || "document");
  const kind = previewKind(name, document.mimeType ? String(document.mimeType) : null);
  let body: string;
  try {
    const bytes = fs.readFileSync(String(document.filePath));
    if (kind === "docx") body = `<div class="page">${docxToHtml(bytes)}</div>`;
    else if (kind === "xlsx") body = `<div class="page wide">${xlsxToHtml(bytes)}</div>`;
    else if (kind === "text") body = `<div class="page">${textToHtml(bytes)}</div>`;
    else body = `<div class="page"><p class="muted">Для этого формата предпросмотр недоступен — скачайте файл.</p></div>`;
  } catch (error) {
    body = `<div class="page"><p class="muted">Не удалось открыть файл: ${error instanceof Error ? error.message.replace(/[<>&]/g, "") : "ошибка"}. Скачайте его.</p></div>`;
  }
  return new NextResponse(previewPage(name, body), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
