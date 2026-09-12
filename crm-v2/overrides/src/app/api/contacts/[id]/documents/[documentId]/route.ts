import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { deleteClientDocument, getClientDocument } from "@/lib/client-documents";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  const document = getClientDocument(documentId, id);
  if (!document) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  const fileBuffer = fs.readFileSync(document.filePath);
  const body = new Uint8Array(fileBuffer);
  const safeName = encodeURIComponent(document.name || "document");
  return new NextResponse(body, {
    headers: {
      "content-type": document.mimeType || "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${safeName}`,
      "cache-control": "private, no-store",
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  if (!deleteClientDocument(documentId, id)) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  return NextResponse.json({ success: true });
}
