// Törzsadat-frissítés: a NAV/OpenKKK mappából kikeresi a legfrissebb
// törzsadat-csomagokat, és letöltési linket ad vissza a felületnek.
//  GET /api/refresh-data            → a legfrissebb ev/ais/kn10 csomagok listája
//  GET /api/refresh-data?kind=ev    → csak az adott típus
// A mappa URL-jét az OPENKKK_FOLDER_URL környezeti változó adja.
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const userAgent = "Mozilla/5.0 (compatible; TARIC-2026 data updater)";
const KINDS = ["ev", "ais", "kn10"];

export default async (request) => {
  const url = new URL(request.url);
  const kindFilter = (url.searchParams.get("kind") || "").toLowerCase();
  const folderUrl = process.env.OPENKKK_FOLDER_URL;
  if (!folderUrl)
    return new Response(JSON.stringify({
      status: "not-configured",
      error: "Az OPENKKK_FOLDER_URL környezeti változó nincs beállítva.",
      hint: "Állítsa be a NAV OpenKKK törzsadat-publikálási mappa URL-jét, és a Frissítés innen listázza a letölthető csomagokat.",
    }), { status: 503, headers });
  try {
    const page = await fetch(folderUrl, { headers: { "user-agent": userAgent } });
    if (!page.ok) throw new Error(`OpenKKK mappalista HTTP ${page.status}`);
    const html = await page.text();
    const found = [];
    for (const match of html.matchAll(/"FileRef"\s*:\s*("(?:[^"\\]|\\.)*(ev|ais|kn10)_(?:torzsadatok|valtozasok)_(\d{8})\.zip")/gi)) {
      const ref = JSON.parse(match[1]);
      found.push({
        ref,
        kind: match[2].toLowerCase(),
        date: match[3],
        fileName: ref.split("/").pop(),
      });
    }
    if (!found.length) throw new Error("Nem található törzsadat-ZIP a megadott mappában.");
    const origin = new URL(folderUrl).origin;
    const latestByKind = new Map();
    for (const item of found.sort((a, b) => b.date.localeCompare(a.date)))
      if (!latestByKind.has(item.kind)) latestByKind.set(item.kind, item);
    const packages = KINDS
      .filter((kind) => latestByKind.has(kind) && (!kindFilter || kind === kindFilter))
      .map((kind) => {
        const item = latestByKind.get(kind);
        const encodedPath = item.ref.split("/").map((part) => encodeURIComponent(part)).join("/");
        return {
          kind,
          fileName: item.fileName,
          dataDate: `${item.date.slice(0, 4)}-${item.date.slice(4, 6)}-${item.date.slice(6, 8)}`,
          downloadUrl: new URL(encodedPath, origin).href,
        };
      });
    return new Response(JSON.stringify({ status: "ok", checkedAt: new Date().toISOString(), packages }), { headers });
  } catch (error) {
    return new Response(JSON.stringify({ status: "error", error: error.message }), { status: 502, headers });
  }
};
