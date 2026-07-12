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
  const encoded = await readFile(`${target}.gz.b64`, "utf8");
  await writeFile(target, gunzipSync(Buffer.from(encoded.trim(), "base64")));
  console.log(`Prepared ${name}`);
}
