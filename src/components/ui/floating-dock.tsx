import React from 'react';
import { Link } from 'react-router-dom';

export interface FloatingDockItem {
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

interface FloatingDockProps {
  items: FloatingDockItem[];
  className?: string;
}

export const FloatingDock: React.FC<FloatingDockProps> = ({ items, className = '' }) => (
  <nav aria-label="Primary navigation" className={`floating-dock ${className}`}>
    {items.map((item) => {
      const content = (
        <>
          <span className="floating-dock-icon">{item.icon}</span>
          <span className="floating-dock-tooltip" role="tooltip">{item.title}</span>
        </>
      );

      return item.href ? (
        <Link key={item.title} to={item.href} aria-label={item.title} aria-current={item.active ? 'page' : undefined} className={`floating-dock-item ${item.active ? 'is-active' : ''}`}>
          {content}
        </Link>
      ) : (
        <button key={item.title} type="button" onClick={item.onClick} aria-label={item.title} className="floating-dock-item">
          {content}
        </button>
      );
    })}
  </nav>
);
