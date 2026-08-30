import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Loader2 } from 'lucide-react';
import { NoiseBackground } from './ui/noise-background';

export const Eyebrow: React.FC<{ children: React.ReactNode; light?: boolean }> = ({ children, light = false }) => (
  <p className={`eyebrow text-[10px] font-semibold uppercase tracking-[0.22em] ${light ? 'text-white/65' : 'text-stone-500'}`}>
    {children}
  </p>
);

export const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: string }> = ({
  children,
  className = '',
  delay,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={delay ? { '--reveal-delay': delay } as React.CSSProperties : undefined} className={`reveal ${visible ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  );
};

export const SectionHeading: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
}> = ({ eyebrow, title, description, align = 'left' }) => (
  <div className={`max-w-2xl space-y-4 ${align === 'center' ? 'mx-auto text-center' : ''}`}>
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
    <h2 className="font-display text-4xl leading-[0.98] tracking-[-0.035em] text-stone-950 sm:text-5xl">
      {title}
    </h2>
    {description && <p className="max-w-xl text-sm leading-7 text-stone-600 sm:text-base">{description}</p>}
  </div>
);

export const Button: React.FC<{
  children: React.ReactNode;
  variant?: 'dark' | 'light' | 'text';
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ children, variant = 'dark', type = 'button', onClick, disabled = false, className = '' }) => {
  const styles = {
    dark: 'button-dark bg-stone-950 text-white hover:bg-forest',
    light: 'button-light border border-stone-300 bg-transparent text-stone-950 hover:border-stone-950',
    text: 'button-text border-b border-stone-400 px-0 text-stone-950 hover:border-stone-950',
  };

  return (
    <NoiseBackground containerClassName={className.includes('w-full') ? 'w-full' : ''}>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`group relative inline-flex min-h-11 items-center justify-center gap-3 rounded-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      >
        {children}
      </button>
    </NoiseBackground>
  );
};

export const ArrowButton: React.FC<{
  children: React.ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}> = ({ children, to, onClick, className = '' }) => {
  const content = (
    <>
      <span>{children}</span>
      <ArrowUpRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1" strokeWidth={1.5} />
    </>
  );

  if (to) {
    return (
      <NoiseBackground>
        <a href={to} className={`group inline-flex items-center gap-3 rounded-full bg-stone-950 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white ${className}`}>
          {content}
        </a>
      </NoiseBackground>
    );
  }

  return (
    <NoiseBackground>
      <button onClick={onClick} className={`group inline-flex items-center gap-3 rounded-full bg-stone-950 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white ${className}`}>
        {content}
      </button>
    </NoiseBackground>
  );
};

export const StatusLabel: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' }> = ({
  children,
  tone = 'neutral',
}) => {
  const tones = {
    neutral: 'text-stone-500',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
  };

  return (
    <span className={`inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${tones[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
};

export const ImageFrame: React.FC<{
  src?: string | null;
  alt: string;
  label?: string;
  className?: string;
}> = ({ src, alt, label, className = '' }) => (
  <div className={`image-frame group relative overflow-hidden bg-stone-200 ${className}`}>
    {src ? (
      <>
        <span className="image-frame-wash" aria-hidden="true" />
        <img src={src} alt={alt} className="h-full w-full object-cover transition duration-1000 ease-out group-hover:scale-[1.045]" />
      </>
    ) : (
      <div className="flex h-full min-h-48 items-end bg-stone-300 p-5">
        <div className="max-w-[12rem] border-l border-stone-950/40 pl-3">
          <p className="font-display text-2xl leading-none text-stone-950/75">{label || 'A work in progress'}</p>
        </div>
      </div>
    )}
  </div>
);

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="loading-state flex items-center gap-3 py-16 text-xs uppercase tracking-[0.18em] text-stone-500">
    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
    {label}
  </div>
);

export const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="empty-state border-y border-stone-300 py-14">
    <p className="font-display text-3xl text-stone-900">{title}</p>
    <p className="mt-3 max-w-md text-sm leading-6 text-stone-600">{description}</p>
  </div>
);

export const Field: React.FC<{
  label: string;
  value: string | number;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
  required?: boolean;
}> = ({ label, value, onChange, placeholder, type = 'text', textarea = false, required = false }) => (
  <label className="field block space-y-2">
    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
      {label}
      {required && <span className="ml-1 text-emerald-700">*</span>}
    </span>
    {textarea ? (
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={5}
        className="w-full resize-y border-b border-stone-300 bg-transparent px-0 py-3 text-sm text-stone-950 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-950"
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full border-b border-stone-300 bg-transparent px-0 py-3 text-sm text-stone-950 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-950"
      />
    )}
  </label>
);

export const CompletionMark: React.FC = () => (
  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-white">
    <Check className="h-3 w-3" strokeWidth={2} />
  </span>
);
