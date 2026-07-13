const SECTIONS=[
[1,5,"I","Élő állatok; állati termékek","Live animals; animal products"],
[6,14,"II","Növényi termékek","Vegetable products"],
[15,15,"III","Állati, növényi és mikrobiális zsírok és olajok","Animal, vegetable and microbial fats and oils"],
[16,24,"IV","Élelmiszer-készítmények, italok és dohánytermékek","Prepared foodstuffs, beverages and tobacco products"],
[25,27,"V","Ásványi termékek","Mineral products"],
[28,38,"VI","Vegyipari és rokon ipari termékek","Chemical and allied industry products"],
[39,40,"VII","Műanyagok, gumi és ezekből készült áruk","Plastics, rubber and articles thereof"],
[41,43,"VIII","Bőr, szőrme, táskák és hasonló áruk","Leather, furskins, bags and similar articles"],
[44,46,"IX","Fa, parafa, fonásanyag és ezekből készült áruk","Wood, cork, plaiting materials and articles thereof"],
[47,49,"X","Cellulóz, papír, karton és ezekből készült áruk","Pulp, paper, paperboard and articles thereof"],
[50,63,"XI","Textilanyagok és textiláruk","Textiles and textile articles"],
[64,67,"XII","Lábbeli, fejfedő és kapcsolódó áruk","Footwear, headgear and related articles"],
[68,70,"XIII","Kő-, kerámia- és üvegáruk","Stone, ceramic and glass articles"],
[71,71,"XIV","Gyöngy, drágakő, nemesfém és ékszer","Pearls, precious stones, precious metals and jewellery"],
[72,83,"XV","Nem nemesfémek és ezekből készült áruk","Base metals and articles of base metal"],
[84,85,"XVI","Gépek, mechanikus és villamos berendezések","Machinery, mechanical appliances and electrical equipment"],
[86,89,"XVII","Járművek és szállítási berendezések","Vehicles and transport equipment"],
[90,92,"XVIII","Optikai, mérő- és orvosi műszerek; órák; hangszerek","Optical, measuring and medical instruments; clocks; musical instruments"],
[93,93,"XIX","Fegyver és lőszer","Arms and ammunition"],
[94,96,"XX","Különféle iparcikkek","Miscellaneous manufactured articles"],
[97,97,"XXI","Művészeti tárgyak, gyűjteménydarabok és régiségek","Works of art, collectors' pieces and antiques"]
];
const digits=value=>String(value??"").replace(/\D/g,"");
export function cnenHierarchyForCode(value){
 const chapterCode=digits(value).slice(0,2);
 const chapter=Number(chapterCode);
 const section=SECTIONS.find(([from,to])=>chapter>=from&&chapter<=to);
 return{chapterCode,sectionCode:section?.[2]||null,sectionDescriptionHu:section?.[3]||null,sectionDescriptionEn:section?.[4]||null};
}
export{SECTIONS};
