import { requirePanelSession } from '@/lib/panel/session';
import { prisma } from '@/lib/db';
import { getBusinessSettings } from '@/lib/panel/settings-service';
import { generateBusinessQrSvg } from '@/lib/panel/qr';
import { SettingsForm } from './SettingsForm';

export default async function AjustesPage() {
  const { businessId } = await requirePanelSession();
  const business = await getBusinessSettings(prisma, businessId);

  if (!business) {
    return <p>No se ha encontrado el negocio.</p>;
  }

  const qrSvg = await generateBusinessQrSvg(business.slug);
  const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-900">Ajustes del negocio</h1>

      <SettingsForm business={business} />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Código QR de tu página pública</h2>
        <div className="h-48 w-48 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <a
          href={qrDataUrl}
          download={`qr-${business.slug}.svg`}
          className="mt-3 inline-block rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          Descargar QR (SVG)
        </a>
      </div>
    </div>
  );
}
