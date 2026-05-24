import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";
import { registerSW } from "virtual:pwa-register";

initTheme();

registerSW({
  onNeedRefresh() {},
  onOfflineReady() {},
});

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Dismiss the HTML splash screen after React paints its first frame
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById("app-splash");
    if (splash) {
      splash.classList.add("hidden");
      setTimeout(() => splash.remove(), 350);
    }
  });
});
