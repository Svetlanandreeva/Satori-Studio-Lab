
  import { createRoot } from "react-dom/client";
  import App, { AdminApp } from "./app/App.tsx";
  import "./styles/index.css";

  const isAdmin = window.location.pathname.startsWith("/admin");
  createRoot(document.getElementById("root")!).render(isAdmin ? <AdminApp /> : <App />);
