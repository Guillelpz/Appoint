// Descarga a src/fonts/ las fuentes de Google que usa la app (ver src/fonts/README.md).
// Uso: node scripts/descargar-fuentes.mjs src/fonts
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Se reutilizan los módulos internos de next/font (CommonJS) para pedir
// exactamente la misma URL con el mismo user-agent que usaría next/font/google.
const cargar = createRequire(import.meta.url);
const d = path.join(path.dirname(cargar.resolve('next/package.json')), 'dist/compiled/@next/font/dist/google');
const out = process.argv[2];
if (!out) throw new Error('Uso: node scripts/descargar-fuentes.mjs <carpeta destino>');
const { getFontAxes } = cargar(d + '/get-font-axes.js');
const { getGoogleFontsUrl } = cargar(d + '/get-google-fonts-url.js');
const { fetchResource } = cargar(d + '/fetch-resource.js');
const fonts = [
  ['Playfair Display','playfair-display',['600','700']],
  ['Lora','lora',['400','500']],
  ['Poppins','poppins',['500','700']],
  ['Inter','inter',['400','500']],
  ['Work Sans','work-sans',['400','600']],
  ['Geist','geist',['variable']],
  ['Geist Mono','geist-mono',['variable']],
];
(async()=>{
  for (const [fam, slug, weights] of fonts) {
    const url=getGoogleFontsUrl(fam,getFontAxes(fam,weights,['normal'],undefined),'swap');
    const css=(await fetchResource(url,false)).toString();
    const blocks = css.split('/* ').slice(1).filter(b=>b.startsWith('latin */'));
    const seen = new Map();
    for (const b of blocks) {
      const w=/font-weight: ([^;]+);/.exec(b)[1]; const src=/src: url\((.+?)\) format\('(.+?)'\)/.exec(b);
      if (src[2]!=='woff2') throw new Error('formato '+src[2]);
      if (!seen.has(src[1])) seen.set(src[1], []);
      seen.get(src[1]).push(w);
    }
    for (const [u, ws] of seen) {
      const buf = await fetchResource(u,false);
      if (buf.slice(0,4).toString()!=='wOF2') throw new Error('no woff2 '+u);
      const name = `${slug}-latin-${ws.length>1 ? ws[0].split(' ')[0]+'-'+ws[ws.length-1].split(' ').pop() : ws[0].replace(' ','-')}.woff2`;
      fs.writeFileSync(out+'/'+name, buf);
      console.log(fam, JSON.stringify(ws), name, buf.length);
    }
  }
})().catch(e=>{console.error(e);process.exit(1)});
