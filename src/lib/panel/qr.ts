import QRCode from 'qrcode';
import { getAppBaseUrl } from '@/lib/email/urls';

export function buildBusinessPublicUrl(slug: string): string {
  return `${getAppBaseUrl()}/${slug}?src=qr`;
}

export async function generateBusinessQrSvg(slug: string): Promise<string> {
  const url = buildBusinessPublicUrl(slug);
  return QRCode.toString(url, { type: 'svg', margin: 1, width: 320 });
}
