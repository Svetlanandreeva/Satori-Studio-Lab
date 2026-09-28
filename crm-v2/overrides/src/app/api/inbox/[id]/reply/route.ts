import { NextRequest, NextResponse } from "next/server";
import { replyToEmailThread, type OutgoingEmailAttachment } from "@/lib/email-integration";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const type = String(request.headers.get("content-type") || "");
    let message = "";
    const attachments: OutgoingEmailAttachment[] = [];

    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      message = String(form.get("message") || "");
      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Максимальный размер файла 20 МБ" }, { status: 400 });
        attachments.push({ filename: file.name || "attachment", content: new Uint8Array(await file.arrayBuffer()), contentType: file.type || null });
      }
    } else {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      message = String(body.message || "");
    }

    const result = await replyToEmailThread(id, message, attachments);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось отправить письмо" }, { status: 400 });
  }
}
