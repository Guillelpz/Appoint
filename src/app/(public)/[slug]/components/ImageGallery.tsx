export interface ImageGalleryProps {
  imageUrls: string[];
  businessName: string;
}

export function ImageGallery({ imageUrls, businessName }: ImageGalleryProps) {
  if (imageUrls.length === 0) {
    return null;
  }

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2">
      {imageUrls.map((url, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={`${businessName} — foto ${index + 1}`}
          className="h-52 w-72 shrink-0 snap-start rounded-[var(--radius-theme)] object-cover shadow-[var(--shadow-theme)] sm:h-60 sm:w-80"
          loading={index === 0 ? 'eager' : 'lazy'}
        />
      ))}
    </div>
  );
}
