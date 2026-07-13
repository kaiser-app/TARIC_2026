import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appPath = resolve("src/App.jsx");
let source = await readFile(appPath, "utf8");

const navAnchor = '<div className="nav-actions">';
const integrationButton = '<button onClick={()=>setTopPanel(topPanel==="integration"?null:"integration")}>{L("Integráció","Integration")}</button>';
const aiButton = '<button className={topPanel==="ai"?"active":""} onClick={()=>setTopPanel(topPanel==="ai"?null:"ai")}>AI</button>';
const browseButton = '<button className={topPanel==="content"?"active":""} onClick={()=>setTopPanel(topPanel==="content"?null:"content")}>{L("Tallózás","Browse")}</button>';

const navStart = source.indexOf(navAnchor);
const menuStart = navStart < 0 ? -1 : navStart + navAnchor.length;
const integrationIndex = menuStart < 0 ? -1 : source.indexOf(integrationButton, menuStart);

if (navStart < 0 || integrationIndex < 0) {
  throw new Error("A navigációs menü vagy az Integráció gomb nem található.");
}

const desiredPrefix = `${aiButton}${browseButton}`;
source = source.slice(0, menuStart) + desiredPrefix + source.slice(integrationIndex);

const count = (needle) => source.split(needle).length - 1;
if (count(aiButton) !== 1 || count(browseButton) !== 1) {
  throw new Error("Az AI és Tallózás menüpontból pontosan egy-egy példánynak kell maradnia.");
}

await writeFile(appPath, source, "utf8");
console.log("A menüsor normalizálva: AI | Tallózás | Integráció | Beállítások.");
