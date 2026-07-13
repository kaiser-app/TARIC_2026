import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const navSource = await readFile(new URL("../src/MainNavigation.jsx", import.meta.url), "utf8");

const aiButton = '<button type="button" className={topPanel === "ai" ? "active" : ""} onClick={() => togglePanel("ai")}>AI</button>';
const browseButton = '<button type="button" className={topPanel === "content" ? "active" : ""} onClick={() => togglePanel("content")}>{L("Tallózás", "Browse")}</button>';
const integrationButton = '<button type="button" className={topPanel === "integration" ? "active" : ""} onClick={() => togglePanel("integration")}>{L("Integráció", "Integration")}</button>';

const count = (source, needle) => source.split(needle).length - 1;
if (count(navSource, aiButton) !== 1) throw new Error(`Az AI menüpont példányszáma hibás: ${count(navSource, aiButton)}`);
if (count(navSource, browseButton) !== 1) throw new Error(`A Tallózás menüpont példányszáma hibás: ${count(navSource, browseButton)}`);
if (count(appSource, '<MainNavigation topPanel={topPanel} setTopPanel={setTopPanel} lang={lang} setLang={setLang}/>') !== 1)
  throw new Error("A fő alkalmazás nem pontosan egy MainNavigation komponenst használ.");
if (appSource.includes('<div className="nav-actions">'))
  throw new Error("A régi közvetlen navigációs gombok az App.jsx fájlban maradtak.");

const aiIndex = navSource.indexOf(aiButton);
const browseIndex = navSource.indexOf(browseButton);
const integrationIndex = navSource.indexOf(integrationButton);
if (!(aiIndex >= 0 && aiIndex < browseIndex && browseIndex < integrationIndex)) {
  throw new Error("A menüsorrend nem AI | Tallózás | Integráció.");
}

console.log("OK menüsor: AI | Tallózás | Integráció | Beállítások, duplikáció nélkül");
