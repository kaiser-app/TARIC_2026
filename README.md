# TARIC 2026

Ellenőrizhető forrásokra épülő, magyar–angol TARIC tarifálási és vámteher-előkészítő webalkalmazás.

## 1. mérföldkő – alkalmazásalap

- Vite + React felület
- 10 számjegyű TARIC-kód bevitele és HS / KN / TARIC csoportosítása
- magyar–angol nyelvváltás
- hivatalos EU TARIC és NAV TARIC Web hivatkozások
- hitelességi állapot és félrevezető, ellenőrizetlen vámtételek kizárása
- Netlify build- és Functions-konfiguráció
- `/api/health` állapotvégpont
- biztonságos környezeti változó minta

## Helyi futtatás

```bash
npm install
npm run dev
```

Gyártási build:

```bash
npm run build
```

## Netlify

A repository gyökerében lévő `netlify.toml` beállításai:

- build: `npm run build`
- publish: `dist`
- functions: `netlify/functions`

A Netlify-on a repository összekapcsolása után a deploy automatikusan használja ezeket.

## Következő mérföldkő – hiteles TARIC-adat

A napi NAV/OpenKKK csomag feldolgozása, elsődlegesen:

- `KN_10.xml`
- `KN_kieg_kod.xml`
- `KN_mertekegys.xml`
- uniós és magyar importintézkedések
- exportintézkedések
- `AIS_vamtetelek.xml`

Az összekapcsolás elsődleges kulcsa a `VTSZ`. A nagy XML-források nem kerülnek közvetlenül a Git repositoryba; az importfolyamat ellenőrzött, verziózott alkalmazási adatot állít elő.

## Fontos

Az alkalmazás döntéstámogató eszköz. A hivatalos EU- és NAV-forrásokat, valamint szükség esetén a kötelező tarifális felvilágosítást nem helyettesíti.
