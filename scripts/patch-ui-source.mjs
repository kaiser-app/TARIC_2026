import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appPath = resolve("src/App.jsx");
let source = await readFile(appPath, "utf8");

const replacements = [
  [
    '{L("Tartalom","Content")}',
    '{L("Tallózás","Browse")}',
  ],
  [
    '<h4>{L("Eredeti angol magyarázó szöveg","Explanatory note")}</h4><p>{cnenSelected.content}</p>',
    '<h4>{L("Magyar magyarázó szöveg","Explanatory note")}</h4><p>{lang==="hu"?(cnenSelected.contentHu||cnenSelected.content):cnenSelected.content}</p>',
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) {
    throw new Error(`A várt App.jsx részlet nem található: ${before.slice(0, 100)}`);
  }
  source = source.replace(before, after);
}

await writeFile(appPath, source, "utf8");
console.log("App.jsx nyelvi megjelenítés javítva.");
