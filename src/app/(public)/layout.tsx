import type { ReactNode } from 'react';
import { Playfair_Display, Lora, Poppins, Inter, Work_Sans } from 'next/font/google';

const playfairDisplay = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  weight: ['600', '700'],
});
const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin'],
  weight: ['400', '500'],
});
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['500', '700'],
});
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500'],
});
const workSans = Work_Sans({
  variable: '--font-work-sans',
  subsets: ['latin'],
  weight: ['400', '600'],
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
