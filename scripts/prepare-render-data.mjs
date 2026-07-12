import { readFile, writeFile, access } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";

const names = ["taric-index.json", "nomenclature-rows.json", "measures-index.json"];
for (const name of names) {
  const target = resolve("data/generated", name);
  try {
    await access(target);
    continue;
  } catch {}
  let encoded;
  if (name === "measures-index.json") {
    const parts = [];
    for (let index = 0; index < 5; index++) {
      parts.push(await readFile(`${target}.gz.b64.part${String(index).padStart(2, "0")}`, "utf8"));
    }
    encoded = parts.join("");
  } else {
    encoded = await readFile(`${target}.gz.b64`, "utf8");
  }
  await writeFile(target, gunzipSync(Buffer.from(encoded.trim(), "base64")));
  console.log(`Prepared ${name}`);
}
