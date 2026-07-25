import React from 'react';

export default function B2Logo({ size = 'md', className = '', style = {}, showText = true }) {
  // Height mapping
  const heightMap = {
    sm: 38,
    md: 52,
    lg: 76,
    xl: 105
  };

  const logoHeight = typeof size === 'number' ? size : (heightMap[size] || 52);

  return (
    <div
      className={`b2-official-logo-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
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
          filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.65)) drop-shadow(0 0 14px rgba(255, 94, 58, 0.12))',
          transition: 'transform 0.2s ease, filter 0.2s ease'
        }}
      />
    </div>
  );
}
