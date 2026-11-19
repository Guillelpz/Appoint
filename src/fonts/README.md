# Fuentes autoalojadas

Las fuentes de la app se sirven desde aquí con `next/font/local`
(`src/app/layout.tsx` y `src/app/(public)/layout.tsx`) y **no** con
`next/font/google`.

**Por qué:** `next/font/google` descarga las fuentes de Google durante el
build, y en Next 15.5.x (al menos hasta 15.5.29) el build falla con
`TypeError: Cannot read properties of null (reading '1')` cuando Google
devuelve URLs sin extensión (`https://fonts.gstatic.com/l/font?kit=...`), algo
que hace de forma intermitente (visto con Inter el 2026-11-19, rompió un deploy
de Vercel). Next 16 lo corrige. Con los archivos en el repo, el build ya no
depende de la red ni de Google.

| Archivo | Familia | Pesos |
|---|---|---|
| `playfair-display-latin-600-700.woff2` | Playfair Display (variable) | 600–700 |
| `lora-latin-400-500.woff2` | Lora (variable) | 400–500 |
| `poppins-latin-500.woff2`, `poppins-latin-700.woff2` | Poppins | 500, 700 |
| `inter-latin-400-500.woff2` | Inter (variable) | 400–500 |
| `work-sans-latin-400-600.woff2` | Work Sans (variable) | 400–600 |
| `geist-latin-100-900.woff2` | Geist (variable) | 100–900 |
| `geist-mono-latin-100-900.woff2` | Geist Mono (variable) | 100–900 |

Solo el subset `latin`, el mismo que se configuraba con `next/font/google`
(cubre el español, incluidos `ñ`, tildes y `€`).

**Licencia:** todas son SIL Open Font License 1.1 (https://openfontlicense.org),
que permite redistribuirlas e incluirlas en software.

**Añadir o cambiar una fuente o un peso:** edita la lista de
`scripts/descargar-fuentes.mjs` y ejecútalo (pide el CSS a Google con la
misma URL y el mismo user-agent que usa `next/font`, y guarda el subset
`latin`):

```bash
node scripts/descargar-fuentes.mjs src/fonts
```

Después actualiza la llamada a `localFont` correspondiente.
