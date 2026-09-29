import { NextRequest, NextResponse } from "next/server";
import { PWA_ICONS } from "@/lib/pwa-icons";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ icon: string }> }) {
  const { icon } = await params;
  const data = PWA_ICONS[icon.replace(/\.png$/, "")];
  if (!data) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(data, "base64"), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" },
  });
}
