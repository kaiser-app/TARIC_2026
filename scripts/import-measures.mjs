import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDir=resolve(process.argv[2]||"data/source"),outDir=resolve(process.argv[3]||"data/generated");
const dataDate=process.argv[4]||"2026-07-11";
const files=[["import_intezkedes_EU.xml","import_eu"],["import_intezkedes_HU.xml","import_hu"],["export_intezkedesek.xml","export"]];
const decode=v=>v.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
function rows(xml){const all=[...xml.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/g)].map(m=>[...m[1].matchAll(/<Data\b[^>]*>([\s\S]*?)<\/Data>/g)].map(c=>decode(c[1])));const h=all[0];return all.slice(1).map(c=>Object.fromEntries(h.map((n,i)=>[n,c[i]||""])));}
const active=r=>(!r.EKEZD||r.EKEZD<=dataDate.replaceAll("-","."))&&(!r.EVEGE||r.EVEGE>=dataDate.replaceAll("-","."));
const rateActive=r=>(!r.ERVENYESSEG_KEZDETE||r.ERVENYESSEG_KEZDETE<=dataDate.replaceAll("-","."))&&(!r.ERVENYESSEG_VEGE||r.ERVENYESSEG_VEGE>=dataDate.replaceAll("-","."));
const byCode={};const sources=[];
for(const [file,direction]of files){const path=resolve(sourceDir,file),info=await stat(path),parsed=rows(await readFile(path,"utf8")),valid=parsed.filter(active);sources.push({file,bytes:info.size,rows:parsed.length,activeRows:valid.length});for(const r of valid){const code=(r.VTSZ||"").replace(/\D/g,"");if(!code)continue;(byCode[code]??=[]).push([direction,(r.TERULET||"").trim(),(r.INT_TIP||"").trim(),(r.KIEG_KOD||"").trim(),(r.IGAZOLAS_KOD||"").trim(),r.IGAZOLAS_LEIR||"",r.EKEZD||"",r.EVEGE||""]);}}
const groupRows=rows(await readFile(resolve(sourceDir,"import_orszagcsop_kod.xml"),"utf8")),countryGroups={};
for(const row of groupRows){const group=(row.ORSZAG_CSOPORT||"").trim(),country=(row.ORSZAG||"").trim().toUpperCase();if(group&&country)(countryGroups[group]??=[]).push(country);}
// AIS_vamtetelek.data.xml contains the legally effective duty/tax expressions.
// It is kept separate from the EV condition rows because one rate may have several
// certificates, while a certificate row does not itself carry the payable rate.
const ratesByCode={};
try {
  const ratePath=resolve(sourceDir,"AIS_vamtetelek.data.xml"),rateInfo=await stat(ratePath),xml=await readFile(ratePath,"utf8");
  const parsed=[...xml.matchAll(/<ROW>([\s\S]*?)<\/ROW>/g)].map(match=>{
    const row={};for(const cell of match[1].matchAll(/<([A-Z_]+)>([\s\S]*?)<\/\1>/g))row[cell[1]]=decode(cell[2]);return row;
  }).filter(rateActive);
  for(const r of parsed){const code=(r.VTSZ||"").replace(/\D/g,"");if(!code)continue;(ratesByCode[code]??=[]).push([(r.SZARMAZASI_HELY||"").trim(),(r.INTEZKEDES_TIPUS||"").trim(),r.KIEGESZITO_KOD||"",r.IGAZOLAS_KOD||"",r.FELTETEL_OSSZEG||"",r.FELTETEL_DEVIZANEM||"",r.FELTETEL_MENNYISEGI_EGYSEG||"",r.RENDELESSZAM||"",r.VAMTETEL_KIFEJEZES||"",r.VAMTETEL||"",r.DEVIZANEM_KOD||"",r.MENNYISEGI_EGYSEG||"",r.JOGSZABALY||"",r.ERVENYESSEG_KEZDETE||"",r.ERVENYESSEG_VEGE||""]);}
  sources.push({file:"AIS_vamtetelek.data.xml",bytes:rateInfo.size,rows:parsed.length,activeRows:parsed.length});
}catch(error){if(error?.code!=="ENOENT")throw error;console.warn("AIS_vamtetelek.data.xml is missing; rates will not be available");}
await mkdir(outDir,{recursive:true});await writeFile(resolve(outDir,"measures-index.json"),JSON.stringify({schemaVersion:3,dataDate,sources,countryGroups,byCode,ratesByCode}));
const manifestPath=resolve(outDir,"manifest.json"),manifest=JSON.parse(await readFile(manifestPath,"utf8")),nomenclature=JSON.parse(await readFile(resolve(outDir,"nomenclature-rows.json"),"utf8"));
manifest.dataDate=dataDate;manifest.nomenclatureRows=nomenclature.rowCount;manifest.measureRows=sources.reduce((sum,item)=>sum+item.activeRows,0);manifest.measureCodes=Object.keys(byCode).length;
await writeFile(manifestPath,JSON.stringify(manifest,null,2));
console.log(JSON.stringify({codes:Object.keys(byCode).length,sources}));
