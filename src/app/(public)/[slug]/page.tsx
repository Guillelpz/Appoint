import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getPublicBusinessBySlug } from '@/lib/public/business-lookup';
import { getThemeCssVariables, getContrastTextColor } from '@/lib/theme/theme';
import { BookingLauncherProvider } from './components/BookingLauncherProvider';
import { ServiceCard } from './components/ServiceCard';
import { ImageGallery } from './components/ImageGallery';

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getPublicBusinessBySlug(prisma, slug);

  if (!business) {
    notFound();
  }

  const theme = getThemeCssVariables(business);

  return (
    <div
      style={{ ...theme, fontFamily: 'var(--font-body)' } as CSSProperties}
      className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]"
    >
      <BookingLauncherProvider
        slug={business.slug}
        services={business.services}
        employees={business.employees}
        maxBookingWindowDays={business.maxBookingWindowDays}
      >
        <header className="mx-auto max-w-2xl px-6 pb-8 pt-12 text-center sm:pt-16">
          {business.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logoUrl}
              alt={business.name}
              className="mx-auto mb-5 h-16 w-16 rounded-full border border-[var(--color-accent)] object-cover"
            />
          )}
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold sm:text-4xl">
            {business.name}
          </h1>
          {business.address && (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{business.address}</p>
          )}
        </header>

        <ImageGallery imageUrls={business.imageUrls} businessName={business.name} />

        <main className="mx-auto max-w-2xl px-6 pb-16">
          <section className="mb-10 mt-10">
            <h2 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-semibold">
              Servicios
              <span className="mt-2 block h-0.5 w-8 bg-[var(--color-accent)]" />
            </h2>
            <div className="flex flex-col gap-4">
              {business.services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </section>

          {business.employees.length > 0 && (
            <section>
              <h2 className="mb-4 font-[family-name:var(--font-heading)] text-xl font-semibold">
                Equipo
                <span className="mt-2 block h-0.5 w-8 bg-[var(--color-accent)]" />
              </h2>
              <div className="flex flex-wrap gap-5">
                {business.employees.map((employee) => (
                  <div key={employee.id} className="flex flex-col items-center gap-2">
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold shadow-[var(--shadow-theme)] ring-2 ring-[var(--color-surface)]"
                      style={{ backgroundColor: employee.color, color: getContrastTextColor(employee.color) }}
                    >
                      {employee.name.charAt(0)}
                    </div>
                    <p className="text-sm text-[var(--color-text)]">{employee.name}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </BookingLauncherProvider>
    </div>
  );
}
