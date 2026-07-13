import { ShieldCheck } from "lucide-react";

export default function MainNavigation({ topPanel, setTopPanel, lang, setLang }) {
  const L = (hu, en) => (lang === "hu" ? hu : en);
  const togglePanel = (panel) => setTopPanel(topPanel === panel ? null : panel);

  return (
    <nav>
      <div className="brand"><ShieldCheck />TARIC 2026</div>
      <div className="nav-actions">
        <button type="button" className={topPanel === "ai" ? "active" : ""} onClick={() => togglePanel("ai")}>AI</button>
        <button type="button" className={topPanel === "content" ? "active" : ""} onClick={() => togglePanel("content")}>{L("Tallózás", "Browse")}</button>
        <button type="button" className={topPanel === "integration" ? "active" : ""} onClick={() => togglePanel("integration")}>{L("Integráció", "Integration")}</button>
        <button type="button" className={topPanel === "settings" ? "active" : ""} onClick={() => togglePanel("settings")}>{L("Beállítások", "Settings")}</button>
        <div className="language">
          <button type="button" className={lang === "hu" ? "active" : ""} onClick={() => setLang("hu")}>HU</button>
          <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
        </div>
      </div>
    </nav>
  );
}
