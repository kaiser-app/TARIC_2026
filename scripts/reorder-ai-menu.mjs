import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appPath = resolve("src/App.jsx");
let source = await readFile(appPath, "utf8");

const browseButton = '<button className={topPanel==="content"?"active":""} onClick={()=>setTopPanel(topPanel==="content"?null:"content")}>{L("Tallózás","Browse")}</button>';
const aiButton = '<button className={topPanel==="ai"?"active":""} onClick={()=>setTopPanel(topPanel==="ai"?null:"ai")}>AI</button>';
const oldOrder = `${browseButton}${aiButton}`;
const requestedOrder = `${aiButton}${browseButton}`;

if (source.includes(requestedOrder)) {
  console.log("Az AI menüpont már a Tallózás előtt van.");
} else if (source.includes(oldOrder)) {
  source = source.replace(oldOrder, requestedOrder);
  await writeFile(appPath, source, "utf8");
  console.log("Az AI menüpont a Tallózás elé került.");
} else {
  throw new Error("Az AI és Tallózás menüpontok várt egymás melletti sorrendje nem található.");
}
