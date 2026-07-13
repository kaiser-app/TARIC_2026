import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appPath = resolve("src/App.jsx");
let source = await readFile(appPath, "utf8");

const importLine = 'import MainNavigation from "./MainNavigation.jsx";';
if (!source.includes(importLine)) {
  const importAnchor = 'import AiProviderPanel from "./AiProviderPanel.jsx";';
  if (!source.includes(importAnchor)) throw new Error("Az AI panel importja nem található a navigáció bekötéséhez.");
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const navigation = '    <MainNavigation topPanel={topPanel} setTopPanel={setTopPanel} lang={lang} setLang={setLang}/>';
if (!source.includes(navigation)) {
  const navPattern = /    <nav><div className="brand">.*?<\/nav>/s;
  if (!navPattern.test(source)) throw new Error("A lecserélendő navigációs blokk nem található.");
  source = source.replace(navPattern, navigation);
}

const usageCount = source.split(navigation).length - 1;
if (usageCount !== 1) throw new Error(`A MainNavigation példányszáma hibás: ${usageCount}`);
if (source.includes('<div className="nav-actions">')) throw new Error("A régi közvetlen navigációs gombok az App.jsx fájlban maradtak.");

await writeFile(appPath, source, "utf8");
console.log("A navigáció rögzítve: AI | Tallózás | Integráció | Beállítások.");
