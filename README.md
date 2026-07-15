# TARIC 2026 statikus adatkészlet (taric-2026.onrender.com)
Render: New → Static Site → ezt a mappát publikáld (build command üres, publish dir: .)
FONTOS: CORS engedélyezése — Render static site alapból küld Access-Control-Allow-Origin: * fejlécet.
Szerkezet: /meta.json · /n/{cs}.json nómenklatúra · /d/{cs}.json vámtételek · /m/{cs}.json import intézkedések · /e/{cs}.json export · /x/{cs}.json CNEN. {cs} = 2 jegyű árucsoport (01–99).
Frissítés: az eVÁM törzsadat zip és a TARIC Duties excel új verziójából a build_site.py újrafuttatásával.