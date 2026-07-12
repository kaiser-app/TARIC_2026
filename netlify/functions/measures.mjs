import { readFile } from "node:fs/promises";
const headers={"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=300"};
const applies=(measureCode,code)=>code.startsWith(measureCode.replace(/0+$/, ""));

export default async request=>{
  const u=new URL(request.url);
  const code=(u.searchParams.get("code")||"").replace(/\D/g,"").padEnd(10,"0").slice(0,10);
  const origin=(u.searchParams.get("origin")||"").trim().toUpperCase();
  const direction=u.searchParams.get("direction")||"all";
  const traffic=(u.searchParams.get("traffic")||"b2b").toLowerCase();
  const valueHuf=Number(u.searchParams.get("valueHuf")||0);
  const ecbRate=Number(String(u.searchParams.get("ecbRate")||"354.13").replace(",","."));
  const valueEur=ecbRate>0&&valueHuf>0?valueHuf/ecbRate:null;
  const lowValueEligible=traffic==="b2c"&&valueEur!==null&&valueEur<=150;
  if(!/^\d{10}$/.test(code))return new Response(JSON.stringify({error:"Érvényes TARIC-kód szükséges."}),{status:400,headers});
  const data=JSON.parse(await readFile(new URL("../../data/generated/measures-index.json",import.meta.url),"utf8"));
  const found=[];
  const areaApplies=area=>{
    if(!origin||!area||area==="1011")return true;
    if(area===origin)return true;
    return Array.isArray(data.countryGroups?.[area])&&data.countryGroups[area].includes(origin);
  };
  for(const[sourceCode,items]of Object.entries(data.byCode)){
    if(!applies(sourceCode,code))continue;
    for(const item of items){
      const[d,area,type,additional,certificate,description,start,end]=item;
      if(direction!=="all"&&!d.startsWith(direction))continue;
      if(!areaApplies(area))continue;
      if(type==="AAF"&&!lowValueEligible)continue;
      found.push({direction:d,area,type,additionalCode:additional||null,certificate:certificate||null,description:description||null,start,end:end||null,sourceCode});
    }
  }
  const unique=new Map();
  for(const item of found){
    const key=JSON.stringify([item.direction,item.area,item.type,item.additionalCode,item.certificate,item.description,item.start,item.end]);
    const previous=unique.get(key);
    if(previous)previous.sourceCodes.push(item.sourceCode);
    else unique.set(key,{...item,sourceCodes:[item.sourceCode]});
  }
  const measures=[...unique.values()];
  return new Response(JSON.stringify({status:"ok",dataDate:data.dataDate,code,origin:origin||null,count:measures.length,measures:measures.slice(0,250),truncated:measures.length>250,valueCheck:{valueHuf:valueHuf||null,ecbRate,valueEur:valueEur===null?null:Number(valueEur.toFixed(2)),traffic,lowValueEligible},warning:"Az országkód szerinti közvetlen és országcsoport-tagsági intézkedések szerepelnek; az AAF kisértékű intézkedés csak B2C és legfeljebb 150 EUR esetén jelenik meg."}),{headers});
};
