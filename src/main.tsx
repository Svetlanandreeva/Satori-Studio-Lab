import { createRoot } from "react-dom/client";
import App, { AdminApp } from "./app/App.tsx";
import "./styles/index.css";
import "./styles/featured-switcher.css";
import "./styles/storefront-enhancements.css";
import { startFeaturedSwitcher } from "./featuredSwitcher";
import { startStorefrontEnhancements } from "./storefrontEnhancements";
import { startBrandCopyEnhancements } from "./brandCopyEnhancements";

const isAdmin = window.location.pathname.startsWith("/admin");
createRoot(document.getElementById("root")!).render(isAdmin ? <AdminApp /> : <App />);

if (!isAdmin) {
  startFeaturedSwitcher();
  startStorefrontEnhancements();
  startBrandCopyEnhancements();
}
