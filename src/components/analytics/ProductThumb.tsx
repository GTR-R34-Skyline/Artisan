import React from 'react';

interface ProductThumbProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export const ProductThumb: React.FC<ProductThumbProps> = ({ src, alt, className = '' }) => (
  <div className={`image-frame relative overflow-hidden bg-stone-200 ${className}`}>
    {src ? (
      <img src={src} alt={alt} className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]" />
    ) : (
      <div className="flex h-full w-full items-end bg-stone-300 p-2">
        <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-stone-600">No image</span>
      </div>
    )}
  </div>
);
