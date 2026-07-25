import React from 'react';

export default function B2Logo({ size = 'md', className = '', style = {} }) {
  // Height mapping for transparent logo
  const heightMap = {
    sm: 44,
    md: 64,
    lg: 90,
    xl: 130
  };

  const logoHeight = typeof size === 'number' ? size : (heightMap[size] || 64);

  return (
    <div
      className={`b2-official-logo-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        padding: 0,
        ...style
      }}
    >
      <img
        src="/logo.png"
        alt="B2 GYM - Fitness Club"
        style={{
          height: `${logoHeight}px`,
          width: 'auto',
          maxHeight: `${logoHeight}px`,
          objectFit: 'contain',
          display: 'block',
          filter: 'drop-shadow(0 4px 16px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 12px rgba(255, 94, 58, 0.15))',
          transition: 'transform 0.2s ease, filter 0.2s ease'
        }}
      />
    </div>
  );
}
