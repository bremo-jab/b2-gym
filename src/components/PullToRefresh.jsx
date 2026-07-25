import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({ children, onRefresh }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);

  const THRESHOLD = 70; // Minimum pull distance to trigger refresh
  const MAX_PULL = 110;  // Maximum visual pull distance

  useEffect(() => {
    const handleTouchStart = (e) => {
      // Only initiate pull-to-refresh if user is at the very top of the page
      if ((window.scrollY || document.documentElement.scrollTop || 0) <= 2 && e.touches.length === 1) {
        startYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
      } else {
        isPullingRef.current = false;
      }
    };

    const handleTouchMove = (e) => {
      if (!isPullingRef.current || isRefreshing) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollTop > 2) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const dy = currentY - startYRef.current;

      if (dy > 0) {
        // Smooth logarithmic resistance curve
        const pull = Math.min(MAX_PULL, dy * 0.42);
        setPullDistance(pull);

        if (dy > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else {
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;

      if (pullDistance >= THRESHOLD) {
        setIsRefreshing(true);
        setPullDistance(THRESHOLD);

        const handleComplete = () => {
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 500);
        };

        if (onRefresh) {
          Promise.resolve(onRefresh())
            .then(handleComplete)
            .catch(handleComplete);
        } else {
          setTimeout(() => {
            window.location.reload();
          }, 350);
        }
      } else {
        setPullDistance(0);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing, onRefresh]);

  const progress = Math.min(1, pullDistance / THRESHOLD);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
      {/* Pull Indicator Overlay */}
      {(pullDistance > 0 || isRefreshing) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: `${pullDistance}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          pointerEvents: 'none',
          transition: isRefreshing || pullDistance === 0 ? 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
        }}>
          <div style={{
            background: 'rgba(25, 33, 43, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1.5px solid var(--accent-neon)',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(173, 255, 47, 0.35)',
            transform: `scale(${progress}) rotate(${pullDistance * 3.5}deg)`,
            transition: isRefreshing ? 'transform 0.3s ease' : 'none'
          }}>
            <RefreshCw
              size={22}
              color="var(--accent-neon)"
              className={isRefreshing ? 'spin' : ''}
            />
          </div>
        </div>
      )}

      {/* Main Content Shifted Smoothly */}
      <div style={{
        transform: `translateY(${pullDistance}px)`,
        transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
      }}>
        {children}
      </div>
    </div>
  );
}
