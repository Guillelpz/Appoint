import type { ReactNode } from 'react';
import localFont from 'next/font/local';

// Fuentes autoalojadas (src/fonts/, ver su README): next/font/google de Next
// 15.5.x revienta el build cuando Google devuelve URLs sin extensión
// (/l/font?kit=...), cosa que hace de forma intermitente. Mismas familias,
// pesos y subset (latin) que antes; los archivos de un rango de pesos son
// fuentes variables.
const playfairDisplay = localFont({
  variable: '--font-playfair',
  src: [{ path: '../../fonts/playfair-display-latin-600-700.woff2', weight: '600 700', style: 'normal' }],
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});
const lora = localFont({
  variable: '--font-lora',
  src: [{ path: '../../fonts/lora-latin-400-500.woff2', weight: '400 500', style: 'normal' }],
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});
const poppins = localFont({
  variable: '--font-poppins',
  src: [
    { path: '../../fonts/poppins-latin-500.woff2', weight: '500', style: 'normal' },
    { path: '../../fonts/poppins-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
});
const inter = localFont({
  variable: '--font-inter',
  src: [{ path: '../../fonts/inter-latin-400-500.woff2', weight: '400 500', style: 'normal' }],
  display: 'swap',
});
const workSans = localFont({
  variable: '--font-work-sans',
  src: [{ path: '../../fonts/work-sans-latin-400-600.woff2', weight: '400 600', style: 'normal' }],
  display: 'swap',
});

const PUBLIC_FONT_VARIABLES = [
  playfairDisplay.variable,
  lora.variable,
  poppins.variable,
  inter.variable,
  workSans.variable,
].join(' ');

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${PUBLIC_FONT_VARIABLES} min-h-screen bg-[#FAF6F0] antialiased`}
      style={{ fontFamily: 'var(--font-body, var(--font-lora))' }}
    >
      {children}
    </div>
  );
}
