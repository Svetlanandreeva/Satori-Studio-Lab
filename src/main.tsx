import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import AdminFigmaApp from "./AdminFigmaApp.tsx";
import "./styles/index.css";
import "./styles/featured-switcher.css";
import "./styles/storefront-enhancements.css";
import "./styles/mobile-hero-width-fix.css";
import "./styles/mobile-admin-link.css";
import "./styles/admin-figma.css";
import "./styles/page-transitions.css";
import { startFeaturedSwitcher } from "./featuredSwitcher";
import { startStorefrontEnhancements } from "./storefrontEnhancements";
import { startBrandCopyEnhancements } from "./brandCopyEnhancements";
import { startInspirationCoverManager } from "./inspirationCoverManager";
import { startAdminPanelLayoutFix } from "./adminPanelLayoutFix";
import { startAdminProductLinks } from "./adminProductLinks";
import { startPageTransitions } from "./pageTransitions";
import { startCheckoutAddressGuard } from "./checkoutAddressGuard";

const isAdmin = window.location.pathname.startsWith("/admin");
createRoot(document.getElementById("root")!).render(isAdmin ? <AdminFigmaApp /> : <App />);

// Storefront enhancements also contain the admin controls for the three cards
// directly below Hero. Inspiration controls are shared with the Figma admin home.
startStorefrontEnhancements();
startInspirationCoverManager();
startAdminPanelLayoutFix();
startAdminProductLinks();

if (!isAdmin) {
  startFeaturedSwitcher();
  startBrandCopyEnhancements();
  startPageTransitions();
  startCheckoutAddressGuard();
}
