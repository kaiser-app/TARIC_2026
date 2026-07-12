import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import classify from "./netlify/functions/classify.mjs";
import health from "./netlify/functions/health.mjs";
import measures from "./netlify/functions/measures.mjs";
import nomenclatureTree from "./netlify/functions/nomenclature-tree.mjs";
import tariffAgent from "./netlify/functions/tariff-agent.mjs";
import taricSearch from "./netlify/functions/taric-search.mjs";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT || 3000);
const functions = new Map([["/api/classify", classify], ["/api/health", health], ["/api/measures", measures], ["/api/nomenclature-tree", nomenclatureTree], ["/api/tariff-agent", tariffAgent], ["/api/taric-search", taricSearch]]);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon" };
const startedAt=Date.now(),usage={requests:0,bytesOut:0,errors:0,rateLimited:0,byDay:{}};
const limits={perMinute:Number(process.env.API_LIMIT_PER_MINUTE||20),perDay:Number(process.env.API_LIMIT_PER_DAY||1000),perMonth:Number(process.env.API_LIMIT_PER_MONTH||20000),maxConcurrent:Number(process.env.API_MAX_CONCURRENT||3),maxRequestBytes:Number(process.env.API_MAX_REQUEST_BYTES||131072)};
const buckets=new Map();let concurrent=0;
const adminOk=request=>process.env.ADMIN_TOKEN&&request.headers["x-admin-token"]===process.env.ADMIN_TOKEN;
const apiOk=request=>!process.env.API_KEY||request.headers["x-api-key"]===process.env.API_KEY;
const json=(response,status,data)=>{const body=JSON.stringify(data);usage.bytesOut+=Buffer.byteLength(body);response.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});response.end(body);};
const openapi={openapi:"3.1.0",info:{title:"TARIC 2026 API",version:"1.0.0",description:"Gépi tarifálási és közteher-előkészítési interfész."},servers:[{url:"https://taric-2026.onrender.com"}],paths:{"/api/v1/health":{get:{summary:"API és adatállapot",responses:{200:{description:"OK"}}}},"/api/v1/classify-and-calculate":{post:{summary:"Tarifálás és közteher-számítás",security:[{ApiKeyAuth:[]}],requestBody:{required:true,content:{"application/json":{schema:{type:"object",required:["customsDate","product","trade"],properties:{customsDate:{type:"string",format:"date"},product:{type:"object"},trade:{type:"object"}}}}}},responses:{200:{description:"Tarifálási eredmény"},429:{description:"Kvóta túllépve"}}}}},components:{securitySchemes:{ApiKeyAuth:{type:"apiKey",in:"header",name:"X-API-Key"}}}};

async function bodyOf(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks); }
async function runFunction(handler, request, response) {
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await bodyOf(request);
  const webRequest = new Request(`http://${request.headers.host || "localhost"}${request.url}`, { method: request.method, headers: request.headers, body });
  const result = await handler(webRequest);
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
}
async function classifyAndCalculate(request,response){
  if(request.method!=="POST")return json(response,405,{error:"POST metódus szükséges."});
  if(!apiOk(request))return json(response,401,{error:"Érvényes X-API-Key szükséges."});
  const body=await bodyOf(request);if(body.length>limits.maxRequestBytes)return json(response,413,{error:"A kérés túl nagy."});
  const input=JSON.parse(body.toString()||"{}");const customsDate=input.customsDate||new Date().toISOString().slice(0,10);
  const product=input.product||{},trade=input.trade||{},origin=(trade.originCountry||"CN").toUpperCase(),value=Number(trade.invoiceValue)||100000,ecb=Number(trade.exchangeRate)||354.13;
  const agentReq=new Request("http://localhost/api/tariff-agent",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:product.name||"",description:product.description||product.name||""})});
  const classified=await (await tariffAgent(agentReq)).json();if(!classified.code)return json(response,422,{customsDate,classification:classified,error:"A tarifáláshoz pontosítás szükséges."});
  const measureReq=new Request(`http://localhost/api/measures?code=${classified.code}&origin=${origin}&direction=${trade.direction||"import"}&traffic=${trade.traffic||"b2b"}&valueHuf=${value}&ecbRate=${ecb}`);
  const measureData=await (await measures(measureReq)).json();const rate=g=>Number(g?.rates?.find(r=>r.value!=="")?.value||0),low=measureData.groups?.find(g=>g.type==="107"&&g.applicable!==false),dutyRate=rate(measureData.groups?.find(g=>g.type==="103"));
  const additions=Number(trade.additions)||0,customsBase=Math.round(value+additions),lines=Math.max(1,Number(trade.lineCount)||1),duty=low?Math.round(3*ecb*lines):Math.round(customsBase*dutyRate/100),vatRate=rate(measureData.groups?.find(g=>g.type==="AAF"&&g.additionalCodes?.includes("X6XX")))||27,vatBase=customsBase+duty,vat=Math.round(vatBase*vatRate/100);
  return json(response,200,{requestedCustomsDate:customsDate,appliedDataDate:measureData.dataDate,dateStatus:customsDate>measureData.dataDate?"future-covered-unverified":"current",classification:classified,measures:measureData.groups,calculation:{currency:"HUF",invoiceValue:value,additions,customsBase,dutyRate,duty,vatRate,vatBase,vat,total:duty+vat},assumptions:{originCountry:origin,quantity:Number(product.quantity)||1}});
}
async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  let path = join(root, safe);
  try { if (!(await stat(path)).isFile()) throw new Error("not a file"); } catch { path = join(root, "index.html"); }
  const content = await readFile(path);
  response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream", "cache-control": path.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable" });
  response.end(content);
}
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if(pathname.startsWith("/api/v1/")){usage.requests++;const day=new Date().toISOString().slice(0,10);usage.byDay[day]=(usage.byDay[day]||0)+1;}
    if(pathname==="/api/v1/openapi.json")return json(response,200,openapi);
    if(pathname==="/api/v1/health")return await runFunction(health,request,response);
    if(pathname==="/api/v1/classify-and-calculate")return await classifyAndCalculate(request,response);
    if(pathname==="/api/v1/admin/metrics"){if(!adminOk(request))return json(response,401,{error:"Adminisztrátori token szükséges."});return json(response,200,{startedAt:new Date(startedAt).toISOString(),uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),usage,limits,render:{plan:"free",includedBandwidthGb:5,estimatedBandwidthGb:Number((usage.bytesOut/1073741824).toFixed(6))}});}
    if(pathname==="/api/v1/admin/settings"){if(!adminOk(request))return json(response,401,{error:"Adminisztrátori token szükséges."});if(request.method==="PUT"){const next=JSON.parse((await bodyOf(request)).toString()||"{}");for(const key of Object.keys(limits))if(Number.isFinite(Number(next[key]))&&Number(next[key])>0)limits[key]=Number(next[key]);}return json(response,200,{limits,note:"A futásidejű beállítások új deploy vagy újraindítás után a Render környezeti változóiból töltődnek vissza."});}
    const handler = functions.get(pathname);
    if (handler) return await runFunction(handler, request, response);
    if (pathname.startsWith("/api/")) { response.writeHead(404, { "content-type": "application/json; charset=utf-8" }); return response.end(JSON.stringify({ error: "Ismeretlen API-végpont." })); }
    await serveStatic(request, response);
  } catch (error) { console.error(error); response.writeHead(500, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ error: "Belső szerverhiba." })); }
}).listen(port, "0.0.0.0", () => console.log(`TARIC server listening on ${port}`));
