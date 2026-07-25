import React from 'react';

export default function B2Logo({ size = 'md', className = '', style = {} }) {
  // Height mapping (scaled up by 40%-50% for prominent, sharp rendering)
  const heightMap = {
    sm: 58,    // Mobile drawer header / small badges
    md: 82,    // Navbar header (clear & balanced)
    lg: 120,   // Member digital card / QR screen
    xl: 185    // Login screen (striking, bold, & prominent)
  };

  const logoHeight = typeof size === 'number' ? size : (heightMap[size] || 82);

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
          // Multi-layer backlight glow: soft white/cyan backlight behind dark text + red glow + 3D depth shadow
          filter: 'drop-shadow(0px 0px 14px rgba(255, 255, 255, 0.22)) drop-shadow(0px 0px 24px rgba(239, 68, 68, 0.38)) drop-shadow(0px 8px 24px rgba(0, 0, 0, 0.8))',
          transition: 'transform 0.2s ease, filter 0.2s ease'
        }}
      />
    </div>
  );
}
