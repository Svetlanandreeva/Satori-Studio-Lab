import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import AdminFigmaApp from "./AdminFigmaApp.tsx";
import "./styles/index.css";
import "./styles/featured-switcher.css";
import "./styles/storefront-enhancements.css";
import "./styles/mobile-hero-width-fix.css";
import "./styles/mobile-admin-link.css";
import "./styles/admin-figma.css";
import "./styles/admin-order-drawer.css";
import "./styles/admin-crm-summary.css";
import "./styles/page-transitions.css";
import { startFeaturedSwitcher } from "./featuredSwitcher";
import { startStorefrontEnhancements } from "./storefrontEnhancements";
import { startBrandCopyEnhancements } from "./brandCopyEnhancements";
import { startInspirationCoverManager } from "./inspirationCoverManager";
import { startAdminPanelLayoutFix } from "./adminPanelLayoutFix";
import { startAdminProductLinks } from "./adminProductLinks";
import { startPageTransitions } from "./pageTransitions";
import { startCheckoutAddressGuard } from "./checkoutAddressGuard";
import { startStorefrontCleanup } from "./storefrontCleanup";
import { startAdminOrderDrawer } from "./adminOrderDrawer";
import { startAdminOrderCounters } from "./adminOrderCounters";
import { startAdminCrmSummary } from "./adminCrmSummary";
import { startCoverSync } from "./coverSync";
import { startMadeToOrderPresentation } from "./madeToOrderPresentation";
import { startSeoEnhancements } from "./seoEnhancements";
import { prepareSeoRoute, startSeoRoutes } from "./seoRoutes";
import { startMetrikaSpaTracking } from "./metrikaSpa";

const isAdmin = window.location.pathname.startsWith("/admin");
if (!isAdmin) prepareSeoRoute();

createRoot(document.getElementById("root")!).render(isAdmin ? <AdminFigmaApp /> : <App />);

// Shared storefront/admin enhancements for managed homepage media and covers.
startStorefrontEnhancements();
startInspirationCoverManager();
startAdminPanelLayoutFix();
startAdminProductLinks();

if (isAdmin) {
  startAdminOrderDrawer();
  startAdminOrderCounters();
  startAdminCrmSummary();
}

if (!isAdmin) {
  startMetrikaSpaTracking();
  startFeaturedSwitcher();
  startBrandCopyEnhancements();
  startStorefrontCleanup();
  startPageTransitions();
  startCheckoutAddressGuard();
  startCoverSync();
  startMadeToOrderPresentation();
  startSeoRoutes();
  startSeoEnhancements();
}
