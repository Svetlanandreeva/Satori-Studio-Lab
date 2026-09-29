/** Какой предпросмотр возможен для файла. Без node-зависимостей — используется и в браузере. */
export function previewKind(name: string, mime?: string | null): "image" | "video" | "audio" | "pdf" | "docx" | "xlsx" | "text" | "none" {
  const ext = name.toLowerCase().split(".").pop() || "";
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic"].includes(ext)) return ext === "heic" ? "none" : "image";
  if (m.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video";
  if (m.startsWith("audio/") || ["ogg", "oga", "mp3", "m4a", "wav"].includes(ext)) return "audio";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || m.includes("wordprocessingml")) return "docx";
  if (ext === "xlsx" || m.includes("spreadsheetml")) return "xlsx";
  if (["txt", "csv", "md", "json", "xml", "log"].includes(ext) || m.startsWith("text/")) return "text";
  return "none";
}
