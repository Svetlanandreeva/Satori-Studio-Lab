import { NextRequest, NextResponse } from "next/server";
import { listClientDocuments, saveClientDocument } from "@/lib/client-documents";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json({ documents: listClientDocuments(id) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить документы" }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "contract");
    if (!(file instanceof File)) return NextResponse.json({ error: "Файл не выбран" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = saveClientDocument({ contactId: id, kind, name: file.name, mimeType: file.type || null, bytes });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить файл" }, { status: 400 });
  }
}
