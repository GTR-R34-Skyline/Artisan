import React from 'react';

interface NoiseBackgroundProps {
  children: React.ReactNode;
  containerClassName?: string;
  gradientColors?: string[];
}

export const NoiseBackground: React.FC<NoiseBackgroundProps> = ({
  children,
  containerClassName = '',
  gradientColors = ['#d6a25f', '#8a5f8f', '#5d8d78'],
}) => (
  <span
    className={`noise-background ${containerClassName}`}
    style={{
      '--noise-one': gradientColors[0] || '#d6a25f',
      '--noise-two': gradientColors[1] || '#8a5f8f',
      '--noise-three': gradientColors[2] || '#5d8d78',
    } as React.CSSProperties}
  >
    <span className="noise-background-inner">{children}</span>
  </span>
);
