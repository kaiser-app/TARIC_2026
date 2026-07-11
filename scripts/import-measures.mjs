import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDir=resolve(process.argv[2]||"data/source"),outDir=resolve(process.argv[3]||"data/generated");
const dataDate=process.argv[4]||"2026-07-11";
const files=[["import_intezkedes_EU.xml","import_eu"],["import_intezkedes_HU.xml","import_hu"],["export_intezkedesek.xml","export"]];
const decode=v=>v.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
function rows(xml){const all=[...xml.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/g)].map(m=>[...m[1].matchAll(/<Data\b[^>]*>([\s\S]*?)<\/Data>/g)].map(c=>decode(c[1])));const h=all[0];return all.slice(1).map(c=>Object.fromEntries(h.map((n,i)=>[n,c[i]||""])));}
const active=r=>(!r.EKEZD||r.EKEZD<=dataDate.replaceAll("-","."))&&(!r.EVEGE||r.EVEGE>=dataDate.replaceAll("-","."));
const byCode={};const sources=[];
for(const [file,direction]of files){const path=resolve(sourceDir,file),info=await stat(path),parsed=rows(await readFile(path,"utf8")),valid=parsed.filter(active);sources.push({file,bytes:info.size,rows:parsed.length,activeRows:valid.length});for(const r of valid){const code=(r.VTSZ||"").replace(/\D/g,"");if(!code)continue;(byCode[code]??=[]).push([direction,(r.TERULET||"").trim(),(r.INT_TIP||"").trim(),(r.KIEG_KOD||"").trim(),(r.IGAZOLAS_KOD||"").trim(),r.IGAZOLAS_LEIR||"",r.EKEZD||"",r.EVEGE||""]);}}
await mkdir(outDir,{recursive:true});await writeFile(resolve(outDir,"measures-index.json"),JSON.stringify({schemaVersion:1,dataDate,sources,byCode}));
console.log(JSON.stringify({codes:Object.keys(byCode).length,sources}));
