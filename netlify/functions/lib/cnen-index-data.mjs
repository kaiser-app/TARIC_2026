import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const fullIndexUrl = new URL("../../../data/generated/cnen-rules-index.json", import.meta.url);

export async function loadCnenIndex() {
  try {
    return JSON.parse(await readFile(fullIndexUrl, "utf8"));
  } catch {
    let encoded = "";
    for (let part = 0; part < 64; part += 1) {
      try {
        encoded += await readFile(new URL(`${fullIndexUrl.href}.gz.b64.part${String(part).padStart(2, "0")}`), "utf8");
      } catch (error) {
        if (part === 0) throw error;
        break;
      }
    }
    return JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
  }
}
