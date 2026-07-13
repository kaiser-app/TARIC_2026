import agent from "../netlify/functions/tariff-agent.mjs";

const cases = [
  ["Mobiltelefon", "POCO F7 Pro, Android rendszerű 5G okostelefon", "8517130000"],
  ["TELEFON, OKOS", "", "8517130000"],
  ["TELEFON", "OKOS", "8517130000"],
  ["OKOS TELEFON", "", "8517130000"],
  ["MOBILTELEFON", "OKOS", "8517130000"],
  ["MOBILTELEFON", "TOKKAK TÖLTŐVEL ÉS CSATLAKOZÓVAL, OKOS", "8517130000"],
  ["MOBILTELEFON", "TOKKAL, TÖLTŐVEL ÉS CSATLAKOZÓVAL, OKOS", "8517130000"],
  ["Mobiltelefon", "nyomógombos, alkalmazások futtatására nem alkalmas hagyományos telefon", "8517140000"],
  ["MOBILTELEFON TOK", "OKOS TELEFONHOZ, PVC-BŐL, ÜTÉSÁLLÓ", "3926909790"],
  ["Laptop", "2 kg-os hordozható számítógép CPU-val, billentyűzettel és kijelzővel", "8471300000"],
  ["Asztali számítógép", "önálló feldolgozóegység CPU-val, memóriával és SSD-vel", "8471500000"],
  ["Tablet", "érintőképernyős hordozható automatikus adatfeldolgozó gép", "8471300000"],
  ["Számítógép-billentyűzet", "USB inputegység számítógéphez", "8471606000"],
  ["Számítógépes egér", "vezeték nélküli koordinátabeviteli inputegység", "8471607000"],
  ["Nyomtató", "hálózati lézernyomtató számítógéphez", "8443321000"],
  ["Dokumentszkenner", "USB-s képolvasó inputegység számítógéphez", "8471607000"],
  ["Wi-Fi router", "adatok vételére és továbbítására szolgáló útvonalválasztó", "8517620000"],
  ["SSD", "1 TB-os, felvételt nem tartalmazó szilárd nem felejtő tároló", "8523511000"],
  ["USB pendrive", "felvételt nem tartalmazó szilárd nem felejtő tároló", "8523511000"],
  ["Bluetooth fejhallgató", "két fülhallgató és mikrofon vezeték nélküli egységben", "8518300000"],
  ["Bluetooth hangszóró", "egy hangszóró saját dobozba szerelve", "8518210000"],
  ["Sztereó hangfal", "két hangszóró ugyanabba a dobozba szerelve", "8518220000"],
  ["Digitális fényképezőgép", "digitális állókép készítésére", "8525810000"],
  ["LCD televízió", "színes televízió-vevőkészülék LCD képernyővel", "8528724000"],
  ["Számítógép-monitor", "LCD monitor közvetlenül számítógéphez csatlakoztatva", "8528521000"],
  ["Telefon akkumulátortöltő", "230 V-os USB akkumulátortöltő, nem polgári repüléshez", "8504406090"],
  ["Power bank", "újratölthető lítium-ion akkumulátor, más célú", "8507600090"],
  ["Mikrohullámú sütő", "háztartási elektromos mikrohullámú sütő", "8516500000"],
  ["Hajszárító", "elektrotermikus fodrászati készülék", "8516310000"],
  ["Villanyborotva", "beépített elektromotoros elektromos borotva", "8510100000"],
  ["Videojáték-konzol", "televízióhoz csatlakoztatható otthoni konzol", "9504500000"],
  ["Porszívó", "1200 W-os, 2 literes portartályú háztartási porszívó", "8508110000"],
  ["Mosógép", "8 kg szárazruha-kapacitású automata háztartási mosógép", "8450119000"],
];

for (const [name, description, expected] of cases) {
  const response = await agent(new Request("http://local/api/tariff-agent", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, description }),
  }));
  const result = await response.json();
  if (result.code !== expected || result.status === "clarification")
    throw new Error(`${name}: várt ${expected}, kapott ${result.code}; kérdés: ${result.clarification}`);
}

console.log(`OK elektronikai regresszió: ${cases.length}/${cases.length} pontos kódegyezés`);
