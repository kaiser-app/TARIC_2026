import { writeFile } from "node:fs/promises";

const folderUrl = process.argv[2];
const output = process.argv[3] || "/tmp/taric-daily.zip";
const listOnly = process.argv.includes("--list-only");
if (!folderUrl) throw new Error("Az OpenKKK mappa URL-je kötelező.");

const userAgent = "Mozilla/5.0 (compatible; TARIC-2026 daily updater)";
const page = await fetch(folderUrl, { headers: { "user-agent": userAgent } });
if (!page.ok) throw new Error(`OpenKKK mappalista HTTP ${page.status}`);
const html = await page.text();
const refs = [];
for (const match of html.matchAll(/"FileRef"\s*:\s*("(?:[^"\\]|\\.)*(ev|ais)_torzsadatok_(\d{8})\.zip")/gi)) {
  refs.push({ ref: JSON.parse(match[1]), kind: match[2].toLowerCase(), date: match[3] });
}
if (!refs.length) throw new Error("Nem található ev/ais_torzsadatok_YYYYMMDD.zip a mappában.");
refs.sort((a, b) => b.date.localeCompare(a.date));
const latest = refs[0];
const encodedPath = latest.ref.split("/").map((part) => encodeURIComponent(part)).join("/");
const downloadUrl = new URL(encodedPath, new URL(folderUrl).origin).href;
const dataDate = `${latest.date.slice(0, 4)}-${latest.date.slice(4, 6)}-${latest.date.slice(6, 8)}`;
const result = { fileName: `${latest.kind}_torzsadatok_${latest.date}.zip`, dataDate, downloadUrl };

if (!listOnly) {
  const response = await fetch(downloadUrl, { headers: { "user-agent": userAgent } });
  if (!response.ok) throw new Error(`OpenKKK ZIP HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("A letöltött állomány nem ZIP.");
  await writeFile(output, bytes);
  result.bytes = bytes.length;
}
if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, `data_date=${dataDate}\nfile_name=${result.fileName}\ndownload_url=${downloadUrl}\n`, { flag: "a" });
}
console.log(JSON.stringify(result));
