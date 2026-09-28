import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// On-demand image resize/reencode with disk cache, mounted in front of
// express.static("/uploads"). A request with no ?w=/&fmt= falls through
// unchanged (next()) so existing raw /uploads/<file> links keep working.
const ALLOWED_WIDTHS = [320, 480, 640, 960, 1280, 1600];
const FORMATS = { avif: "avif", webp: "webp", jpeg: "jpeg", jpg: "jpeg" };

export function createImageResizeRoute(uploadsDir) {
  const cacheDir = path.join(uploadsDir, "_cache");
  mkdir(cacheDir, { recursive: true }).catch(() => {});

  return async function imageResizeRoute(req, res, next) {
    const { w, fmt } = req.query;
    if (!w && !fmt) return next();

    const file = req.params.file;
    if (!file || !/^[a-zA-Z0-9._-]+$/.test(file)) return next();

    const width = ALLOWED_WIDTHS.includes(Number(w)) ? Number(w) : null;
    const format = FORMATS[String(fmt).toLowerCase()];
    if (!width || !format) return res.status(400).end();

    const srcPath = path.join(uploadsDir, file);
    if (!existsSync(srcPath)) return next();

    const ext = format === "jpeg" ? "jpg" : format;
    const cachePath = path.join(cacheDir, `${path.parse(file).name}-${width}.${ext}`);

    try {
      if (!existsSync(cachePath)) {
        const pipeline = sharp(srcPath).rotate().resize({ width, withoutEnlargement: true });
        if (format === "avif") pipeline.avif({ quality: 52, effort: 4, chromaSubsampling: "4:2:0" });
        else if (format === "webp") pipeline.webp({ quality: 80, effort: 4 });
        else pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true });
        // sharp strips EXIF/ICC profiles by default (no .withMetadata() call) — exactly what we want.
        await pipeline.toFile(cachePath);
      }
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.type(format === "jpeg" ? "image/jpeg" : `image/${format}`);
      res.sendFile(cachePath);
    } catch (err) {
      console.error(`[imageResize] failed for ${file} (${width}w, ${format}):`, err.message);
      next();
    }
  };
}
