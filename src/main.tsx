import { createRoot } from "react-dom/client";
import App, { AdminApp } from "./app/App.tsx";
import "./styles/index.css";
import "./styles/featured-switcher.css";
import "./styles/storefront-enhancements.css";
import "./styles/mobile-hero-width-fix.css";
import { startFeaturedSwitcher } from "./featuredSwitcher";
import { startStorefrontEnhancements } from "./storefrontEnhancements";
import { startBrandCopyEnhancements } from "./brandCopyEnhancements";
import { startAdminHeroManager } from "./adminHeroManager";

const isAdmin = window.location.pathname.startsWith("/admin");
createRoot(document.getElementById("root")!).render(isAdmin ? <AdminApp /> : <App />);

// Storefront enhancements also contain the admin controls for the three cards
// directly below Hero, so they must run on /admin too.
startStorefrontEnhancements();

if (isAdmin) {
  startAdminHeroManager();
} else {
  startFeaturedSwitcher();
  startBrandCopyEnhancements();
}
