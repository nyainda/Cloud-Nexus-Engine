import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";
import { registerSW } from "virtual:pwa-register";

initTheme();

registerSW({
  onNeedRefresh() {
    console.log("[PWA] New content available — will update on next reload.");
  },
  onOfflineReady() {
    console.log("[PWA] App ready to work offline.");
  },
});

createRoot(document.getElementById("root")!).render(<App />);
