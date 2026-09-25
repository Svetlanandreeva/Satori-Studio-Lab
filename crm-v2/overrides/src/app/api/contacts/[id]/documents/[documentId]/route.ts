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
  return new NextResponse(bytes, {
    headers: {
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
