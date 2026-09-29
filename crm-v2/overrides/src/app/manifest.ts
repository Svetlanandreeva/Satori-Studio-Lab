import type { MetadataRoute } from "next";

/** Веб-приложение: CRM можно установить на рабочий стол / экран «Домой». */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Satori CRM",
    short_name: "Satori CRM",
    description: "Сделки, сообщения, производство и деньги студии Satori",
    lang: "ru",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#f3f4f6",
    theme_color: "#15171c",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Сообщения", url: "/inbox", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Производство", url: "/production", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Воронка", url: "/pipeline", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
