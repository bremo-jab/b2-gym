import React from 'react';

export default function B2Logo({ size = 'md', showText = true, className = '', style = {} }) {
  // Height mapping
  const heightMap = {
    sm: 36,
    md: 46,
    lg: 60,
    xl: 76
  };
  
  const logoHeight = typeof size === 'number' ? size : (heightMap[size] || 46);
  const viewBoxWidth = showText ? 280 : 72;
  const logoWidth = showText ? logoHeight * 3.8 : logoHeight;

  return (
    <div
      className={`b2-logo-container ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        userSelect: 'none',
        ...style
      }}
    >
      <svg
        width={logoWidth}
        height={logoHeight}
        viewBox={`0 0 ${viewBoxWidth} 72`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.4))' }}
      >
        <defs>
          {/* Main Neon Cyan Brand Gradient */}
          <linearGradient id="b2-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ADFF2F" />
            <stop offset="55%" stopColor="#66FCF1" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>

          {/* Shield/Emblem Inner Gradient */}
          <linearGradient id="b2-shield-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1F2833" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0B0C10" stopOpacity="0.95" />
          </linearGradient>

          {/* Accent Glow Filter */}
          <filter id="b2-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Emblem Shield / Hexagon Frame */}
        <g id="b2-emblem">
          <rect
            x="4"
            y="4"
            width="64"
            height="64"
            rx="18"
            fill="url(#b2-shield-grad)"
            stroke="url(#b2-brand-grad)"
            strokeWidth="2.5"
            style={{ filter: 'drop-shadow(0 0 12px rgba(102, 252, 241, 0.3))' }}
          />

          {/* Decorative Corner Accents */}
          <circle cx="16" cy="16" r="2" fill="#ADFF2F" />
          <circle cx="56" cy="56" r="2" fill="#66FCF1" />

          {/* Stylized Dumbbell / Energy Bar Icon */}
          <g filter="url(#b2-glow)">
            <rect x="18" y="24" width="6" height="24" rx="2.5" fill="url(#b2-brand-grad)" />
            <rect x="25" y="28" width="4" height="16" rx="2" fill="url(#b2-brand-grad)" />
            <rect x="29" y="33" width="14" height="6" rx="2" fill="#FFFFFF" opacity="0.9" />
            <rect x="43" y="28" width="4" height="16" rx="2" fill="url(#b2-brand-grad)" />
            <rect x="48" y="24" width="6" height="24" rx="2.5" fill="url(#b2-brand-grad)" />

            {/* Dynamic Lightning Accent */}
            <path
              d="M 33 22 L 39 34 L 35 37 L 41 50"
              stroke="#ADFF2F"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>

        {/* Typography (Shown when showText is true) */}
        {showText && (
          <g id="b2-typography">
            {/* Main Brand Name: B2 */}
            <text
              x="86"
              y="48"
              fontFamily="Cairo, sans-serif"
              fontWeight="900"
              fontSize="44"
              fill="url(#b2-brand-grad)"
              letterSpacing="1"
              style={{ filter: 'drop-shadow(0 2px 8px rgba(173, 255, 47, 0.3))' }}
            >
              B2
            </text>

            {/* Sub Brand Name: GYM */}
            <text
              x="148"
              y="48"
              fontFamily="Cairo, sans-serif"
              fontWeight="800"
              fontSize="42"
              fill="#F3F4F6"
              letterSpacing="3"
            >
              GYM
            </text>

            {/* Tagline / Subtitle */}
            <text
              x="87"
              y="65"
              fontFamily="Cairo, sans-serif"
              fontWeight="700"
              fontSize="10.5"
              fill="#66FCF1"
              letterSpacing="2.5"
              opacity="0.9"
            >
              FITNESS &amp; SMART GYM
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
