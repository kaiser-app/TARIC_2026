import { readFile } from "node:fs/promises";
const headers={"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=300"};
const applies=(measureCode,code)=>code.startsWith(measureCode.replace(/0+$/, ""));
const typeNames={
  "103":"Harmadik ország vámtétele","107":"Kisértékű küldeményekre vonatkozó vám",
  "117":"Vámfelfüggesztés meghatározott felhasználásra","119":"Légi felhasználhatósági vámfelfüggesztés",
  "410":"Állat-egészségügyi ellenőrzés","705":"Kínzásra és elnyomásra alkalmas áruk ellenőrzése","710":"Importellenőrzés – CITES",
  "724":"Fluortartalmú üvegházhatású gázok ellenőrzése","750":"Ökológiai termékek ellenőrzése",
  "760":"Behozatali feltételek / igazolások","761":"REACH korlátozási feltételek","762":"Területi behozatali feltételek",
  "AAF":"Általános forgalmi adó"
};
const priority=type=>({"103":1,"107":2,"AAF":3,"410":4,"705":5,"724":6,"117":7,"119":8}[type]??20);

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
      found.push({direction:d,area,type,additionalCode:additional||null,certificate:certificate||null,description:description||null,start,end:end||null,sourceCode,applicable:type!=="107"||lowValueEligible,applicabilityReason:type==="107"&&!lowValueEligible?"Nem alkalmazható: a küldemény nem felel meg a legfeljebb 150 EUR kisértékűségi feltételnek.":null});
    }
  }
  for(const[sourceCode,items]of Object.entries(data.ratesByCode||{})){
    if(!applies(sourceCode,code))continue;
    for(const item of items){
      const[area,type,additional,certificate,conditionAmount,conditionCurrency,conditionUnit,orderNumber,expression,rate,currency,unit,legal,start,end]=item;
      if(!areaApplies(area))continue;
      found.push({direction:"import_rate",area,type,additionalCode:additional||null,certificate:certificate||null,description:null,start,end:end||null,sourceCode,isRate:true,rate:rate||null,expression:expression||null,currency:currency||null,unit:unit||null,legal:legal||null,orderNumber:orderNumber||null,conditionAmount:conditionAmount||null,conditionCurrency:conditionCurrency||null,conditionUnit:conditionUnit||null,applicable:type!=="107"||lowValueEligible,applicabilityReason:type==="107"&&!lowValueEligible?"Nem alkalmazható: a küldemény nem felel meg a legfeljebb 150 EUR kisértékűségi feltételnek.":null});
    }
  }
  // A more specific commodity-code rate overrides a chapter/heading-level rate
  // for the same measure and territorial scope.
  const scopedFound=found.filter(item=>!item.isRate||item.sourceCode.length===Math.max(...found.filter(candidate=>candidate.isRate&&candidate.type===item.type&&candidate.area===item.area&&candidate.additionalCode===item.additionalCode).map(candidate=>candidate.sourceCode.length)));
  const unique=new Map();
  for(const item of scopedFound){
    const key=JSON.stringify([item.direction,item.area,item.type,item.additionalCode,item.certificate,item.description,item.start,item.end,item.rate,item.expression,item.currency,item.unit,item.legal]);
    const previous=unique.get(key);
    if(previous)previous.sourceCodes.push(item.sourceCode);
    else unique.set(key,{...item,sourceCodes:[item.sourceCode]});
  }
  const measures=[...unique.values()];
  const grouped=new Map();
  for(const item of measures){
    // EV condition rows and AIS rate rows describe the same legal measure.
    // Group them by measure type and territorial scope; supplementary codes are
    // alternatives/details inside that measure, not separate measures.
    const key=JSON.stringify([item.type,item.area,item.type==="AAF"?item.additionalCode:null]);
    const group=grouped.get(key)??{direction:item.direction.startsWith("import")?"import":item.direction,type:item.type,area:item.area,additionalCode:item.additionalCode,label:typeNames[item.type]||`TARIC-intézkedés ${item.type}`,validFrom:item.start||null,validTo:item.end||null,applicable:item.applicable!==false,applicabilityReason:item.applicabilityReason||null,additionalCodes:[],rates:[],conditions:[]};
    if(item.applicable===false){group.applicable=false;group.applicabilityReason=item.applicabilityReason;}
    if(item.additionalCode)group.additionalCodes.push(item.additionalCode);
    if(item.rate!==undefined&&item.rate!==null)group.rates.push({value:item.rate,expression:item.expression,currency:item.currency,unit:item.unit,legal:item.legal,orderNumber:item.orderNumber});
    if(item.description||item.certificate)group.conditions.push({certificate:item.certificate||null,description:item.description||null});
    grouped.set(key,group);
  }
  const groups=[...grouped.values()].map(group=>({...group,additionalCodes:[...new Set(group.additionalCodes)],rates:[...new Map(group.rates.map(r=>[JSON.stringify(r),r])).values()],conditions:[...new Map(group.conditions.map(c=>[JSON.stringify(c),c])).values()],conditionCount:new Set(group.conditions.map(c=>c.certificate||c.description)).size})).sort((a,b)=>priority(a.type)-priority(b.type)||a.type.localeCompare(b.type));
  return new Response(JSON.stringify({status:"ok",dataDate:data.dataDate,code,origin:origin||null,count:groups.length,rawConditionCount:measures.length,groups,measures:measures.slice(0,250),truncated:measures.length>250,valueCheck:{valueHuf:valueHuf||null,ecbRate,valueEur:valueEur===null?null:Number(valueEur.toFixed(2)),traffic,lowValueEligible},warning:"Az alapnézet intézkedéstípusonként csoportosít. A részletes igazolási és mentességi feltételek lenyithatók."}),{headers});
};
