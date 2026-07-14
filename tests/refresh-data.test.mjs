import assert from "node:assert/strict";
import refreshData from "../netlify/functions/refresh-data.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = {
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  REFRESH_ADMIN_TOKEN: process.env.REFRESH_ADMIN_TOKEN,
  GITHUB_ACTIONS_TOKEN: process.env.GITHUB_ACTIONS_TOKEN,
  GH_TOKEN: process.env.GH_TOKEN,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  OPENKKK_EV_FOLDER_URL: process.env.OPENKKK_EV_FOLDER_URL,
  OPENKKK_AIS_FOLDER_URL: process.env.OPENKKK_AIS_FOLDER_URL,
  OPENKKK_FOLDER_URL: process.env.OPENKKK_FOLDER_URL,
};

const restoreEnv = () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

try {
  delete process.env.OPENKKK_EV_FOLDER_URL;
  delete process.env.OPENKKK_AIS_FOLDER_URL;
  delete process.env.OPENKKK_FOLDER_URL;

  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.includes("api.github.com")) {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, "Bearer test-actions-token");
      assert.deepEqual(JSON.parse(options.body), { ref: "main", inputs: {} });
      return new Response(null, { status: 204 });
    }
    const decoded = decodeURIComponent(url);
    if (decoded.includes("/EV_törzsadatok"))
      return new Response('{"FileRef":"/Megosztott dokumentumok/Törzsek/EV_torzsadatok/ev_torzsadatok_20260713.zip"}\n{"FileRef":"/Megosztott dokumentumok/Törzsek/EV_torzsadatok/ev_torzsadatok_20260714.zip"}', { status: 200 });
    if (decoded.includes("/AIS_törzsadatok"))
      return new Response('{"FileRef":"/Megosztott dokumentumok/Törzsek/AIS_torzsadatok/ais_torzsadatok_20260714.zip"}', { status: 200 });
    throw new Error(`Váratlan URL: ${url}`);
  };

  const checkedResponse = await refreshData(new Request("http://localhost/api/refresh-data"));
  assert.equal(checkedResponse.status, 200);
  const checked = await checkedResponse.json();
  assert.equal(checked.status, "ok");
  assert.equal(checked.packages.length, 2);
  assert.equal(checked.packages.find((item) => item.kind === "ev")?.dataDate, "2026-07-14");
  assert.equal(checked.packages.find((item) => item.kind === "ais")?.fileName, "ais_torzsadatok_20260714.zip");

  process.env.ADMIN_TOKEN = "test-admin-token";
  process.env.GITHUB_ACTIONS_TOKEN = "test-actions-token";
  delete process.env.REFRESH_ADMIN_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;

  const unauthorizedResponse = await refreshData(new Request("http://localhost/api/refresh-data", { method: "POST" }));
  assert.equal(unauthorizedResponse.status, 401);

  const startedResponse = await refreshData(new Request("http://localhost/api/refresh-data", {
    method: "POST",
    headers: { "x-admin-token": "test-admin-token" },
  }));
  assert.equal(startedResponse.status, 202);
  const started = await startedResponse.json();
  assert.equal(started.status, "started");
  assert.equal(started.workflow, "daily-taric-refresh.yml");
  assert.equal(started.ref, "main");

  console.log("OK refresh-data: alapértelmezett OpenKKK mappák + védett GitHub Actions kézi indítás");
} finally {
  globalThis.fetch = originalFetch;
  restoreEnv();
}
