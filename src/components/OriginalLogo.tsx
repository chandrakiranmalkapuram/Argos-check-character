import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const OriginalLogo: React.FC<LogoProps> = ({ size = 40, className = '', showText = false }) => {
  return (
    <div className={`logo-wrapper ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem' }}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden="true"
        style={{ flexShrink: 0, borderRadius: `${size * 0.24}px`, overflow: 'hidden' }}
      >
        <defs>
          <linearGradient id="shieldGradReact" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0B192C" />
            <stop offset="100%" stopColor="#1E3E62" />
          </linearGradient>
          <linearGradient id="accentGradReact" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#shieldGradReact)" />
        <rect x="8" y="8" width="84" height="84" rx="22" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="2" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="4" strokeDasharray="130 55" strokeLinecap="round" transform="rotate(-45 50 50)" />
        <path d="M 62 32 C 40 24, 28 38, 28 50 C 28 62, 40 76, 62 68" fill="none" stroke="#FFFFFF" strokeWidth="6.5" strokeLinecap="round" />
        <circle cx="68" cy="52" r="14" fill="url(#accentGradReact)" />
        <path d="M 63 52 L 67 56 L 74 48" fill="none" stroke="#0B192C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#0B192C' }}>
            Check Character
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            by Chandra
          </span>
        </div>
      )}
    </div>
  );
};
