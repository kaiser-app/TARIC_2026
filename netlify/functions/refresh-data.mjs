// NAV/OpenKKK törzsadat-frissítés.
// GET  /api/refresh-data  -> a legfrissebb EV és AIS csomagok ellenőrzése.
// POST /api/refresh-data  -> a napi frissítő GitHub Actions workflow kézi indítása.

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const userAgent = "Mozilla/5.0 (compatible; TARIC-2026 data updater)";

const DEFAULT_EV_FOLDER_URL = "https://openkkk.nav.gov.hu/Megosztott%20dokumentumok/Forms/AllItems.aspx?RootFolder=%2FMegosztott%20dokumentumok%2FT%C3%B6rzsek%2FT%C3%B6rzsek%20EV%20kit%C3%B6lt%C3%A9shez%2F2026%5F3%5Fnegyed%C3%A9v%2FEV%5Ft%C3%B6rzsadatok&FolderCTID=0x012000A74CCEA4C7223A438B470FB97E909D83&View=%7BC26B9F09%2DFC44%2D4213%2DA9A4%2D3F54E927FF75%7D";
const DEFAULT_AIS_FOLDER_URL = "https://openkkk.nav.gov.hu/Megosztott%20dokumentumok/Forms/AllItems.aspx?RootFolder=%2FMegosztott%20dokumentumok%2FT%C3%B6rzsek%2FT%C3%B6rzsek%20EV%20kit%C3%B6lt%C3%A9shez%2F2026%5F3%5Fnegyed%C3%A9v%2FAIS%5Ft%C3%B6rzsadatok&FolderCTID=0x012000A74CCEA4C7223A438B470FB97E909D83&View=%7BC26B9F09%2DFC44%2D4213%2DA9A4%2D3F54E927FF75%7D";

const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers });

async function latestPackage(kind, folderUrl) {
  const page = await fetch(folderUrl, { headers: { "user-agent": userAgent } });
  if (!page.ok) throw new Error(`${kind.toUpperCase()} OpenKKK mappalista HTTP ${page.status}`);
  const html = await page.text();
  const found = [];
  const pattern = new RegExp(`"FileRef"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*${kind}_torzsadatok_(\\d{8})\\.zip")`, "gi");
  for (const match of html.matchAll(pattern)) {
    const ref = JSON.parse(match[1]);
    found.push({ ref, date: match[2], fileName: ref.split("/").pop() });
  }
  if (!found.length) throw new Error(`Nem található ${kind}_torzsadatok_YYYYMMDD.zip a mappában.`);
  found.sort((a, b) => b.date.localeCompare(a.date));
  const latest = found[0];
  const encodedPath = latest.ref.split("/").map((part) => encodeURIComponent(part)).join("/");
  return {
    kind,
    fileName: latest.fileName,
    dataDate: `${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`,
    downloadUrl: new URL(encodedPath, new URL(folderUrl).origin).href,
  };
}

async function checkPackages() {
  const sources = [
    { kind: "ev", folderUrl: process.env.OPENKKK_EV_FOLDER_URL || process.env.OPENKKK_FOLDER_URL || DEFAULT_EV_FOLDER_URL },
    { kind: "ais", folderUrl: process.env.OPENKKK_AIS_FOLDER_URL || DEFAULT_AIS_FOLDER_URL },
  ];
  const settled = await Promise.allSettled(sources.map(({ kind, folderUrl }) => latestPackage(kind, folderUrl)));
  const packages = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
  const errors = settled.filter((item) => item.status === "rejected").map((item) => item.reason?.message || String(item.reason));
  if (!packages.length) return json(502, { status: "error", checkedAt: new Date().toISOString(), packages: [], errors, error: errors.join(" · ") });
  return json(200, { status: errors.length ? "partial" : "ok", checkedAt: new Date().toISOString(), packages, errors });
}

async function dispatchRefresh(request) {
  const requiredAdminToken = process.env.REFRESH_ADMIN_TOKEN || process.env.ADMIN_TOKEN;
  if (!requiredAdminToken)
    return json(503, { status: "not-configured", error: "Az ADMIN_TOKEN vagy REFRESH_ADMIN_TOKEN környezeti változó nincs beállítva." });
  if (request.headers.get("x-admin-token") !== requiredAdminToken)
    return json(401, { status: "unauthorized", error: "Érvényes admin-token szükséges a kézi frissítés indításához." });

  const githubToken = process.env.GITHUB_ACTIONS_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!githubToken)
    return json(503, { status: "not-configured", error: "A GITHUB_ACTIONS_TOKEN környezeti változó nincs beállítva." });

  const repository = process.env.GITHUB_REFRESH_REPOSITORY || "kaiser-app/TARIC_2026";
  const workflow = process.env.GITHUB_REFRESH_WORKFLOW || "daily-taric-refresh.yml";
  const ref = process.env.GITHUB_REFRESH_REF || "main";
  const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${githubToken}`,
      "content-type": "application/json",
      "user-agent": userAgent,
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ ref, inputs: {} }),
  });
  if (!response.ok) {
    const payload = await response.text();
    return json(502, { status: "dispatch-error", error: `A GitHub Actions indítása sikertelen: HTTP ${response.status}`, detail: payload.slice(0, 500) });
  }
  return json(202, {
    status: "started",
    startedAt: new Date().toISOString(),
    repository,
    workflow,
    ref,
    actionsUrl: `https://github.com/${repository}/actions/workflows/${workflow}`,
    message: "A napi OpenKKK importfolyamat kézi futása elindult.",
  });
}

export default async (request) => {
  const method = (request.method || "GET").toUpperCase();
  try {
    if (method === "GET") return await checkPackages();
    if (method === "POST") return await dispatchRefresh(request);
    return json(405, { status: "method-not-allowed", error: "Csak GET és POST metódus használható." });
  } catch (error) {
    return json(502, { status: "error", error: error.message || String(error) });
  }
};
