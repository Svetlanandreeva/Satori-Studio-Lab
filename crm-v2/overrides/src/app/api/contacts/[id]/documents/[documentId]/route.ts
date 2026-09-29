import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { deleteClientDocument, getClientDocument } from "@/lib/client-documents";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  const document = getClientDocument(documentId, id);
  if (!document) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  const bytes = fs.readFileSync(String(document.filePath));
  const safeName = encodeURIComponent(String(document.name || "document"));
  const download = request.nextUrl.searchParams.get("download") === "1";
  // Range — чтобы голосовые и видео можно было перематывать.
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && !download) {
    const size = bytes.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2] || 0));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new NextResponse(bytes.subarray(start, end + 1), {
      status: 206,
      headers: {
        "content-type": String(document.mimeType || "application/octet-stream"),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "content-length": String(end - start + 1),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  }
  return new NextResponse(bytes, {
    headers: {
      "accept-ranges": "bytes",
      "content-type": String(document.mimeType || "application/octet-stream"),
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8\'\'${safeName}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  if (!deleteClientDocument(documentId, id)) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  return NextResponse.json({ success: true });
}
