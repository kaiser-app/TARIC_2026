# NAV/OpenKKK forrásadatok

Ide kell elhelyezni a napi, hiteles forráscsomagból legalább az alábbi fájlokat:

- `KN_10.xml`
- `KN_kieg_kod.xml`
- `KN_mertekegys.xml`

Az import indítása:

```bash
npm run import:data -- data/source data/generated
```

A nagy napi XML-fájlokat ne commitold a repositoryba. A generált index csak akkor használható, ha az importer minden kötelező fájlt megtalált és mindegyikben azonosított `VTSZ` mezőt.
