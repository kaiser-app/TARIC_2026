# KN10 kétnyelvű magyarázatforrás

A build az alábbi két eredeti forrásarchívumot olvassa:

- `kn10_magyarazatok_HU.zip`
- `kn10_magyarazatok_EN.zip`

Mindkét ZIP pontosan egy JSON-állományt és 25 820 azonos szerkezetű sort tartalmaz. A build SHA-256 ellenőrzéssel, mezőnkénti HU/EN sorazonossággal és rögzített rekordszámokkal védi az adatot.

Elvárt eredmény:

- 25 820 megőrzött KN10-sor;
- 19 538 kétnyelvű magyarázatos sor;
- 6 282 magyarázat nélküli sor;
- 2 447 egyedi magyarázatkulcs.
