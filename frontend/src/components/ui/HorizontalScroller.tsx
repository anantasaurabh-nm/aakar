'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface HorizontalScrollerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  showChevrons?: boolean;
  gap?: number;
}

/**
 * Core DoersOS HorizontalScroller component.
 * Allows any toolbar or action collection to scroll horizontally when overflowing:
 * - Automatically detects overflow and shows subtle navigation chevrons.
 * - Converts mouse wheel (deltaY) to horizontal scrolling.
 * - Native touch swipe and trackpad support.
 * - Hides ugly scrollbars while preserving full accessibility.
 */
export function HorizontalScroller({
  children,
  showChevrons = true,
  gap = 8,
  className = '',
  style,
  ...rest
}: HorizontalScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = containerRef.current;
    if (!el) return;

    const handleResize = () => checkScroll();
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, [checkScroll, children]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
      checkScroll();
    }
  };

  const scrollByAmount = (amount: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(checkScroll, 200);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        minWidth: 0,
        width: '100%',
        ...style,
      }}
      className={className}
      {...rest}
    >
      {/* Scroll Left Chevron */}
      {showChevrons && canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-180)}
          style={{
            position: 'absolute',
            left: 0,
            zIndex: 10,
            width: 26,
            height: 26,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-md)',
            backdropFilter: 'blur(4px)',
          }}
          title="Scroll left"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Scrollable Action Buttons Container */}
      <div
        ref={containerRef}
        onScroll={checkScroll}
        onWheel={handleWheel}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          width: '100%',
          minWidth: 0,
          padding: '2px 4px',
        }}
      >
        {children}
      </div>

      {/* Scroll Right Chevron */}
      {showChevrons && canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(180)}
          style={{
            position: 'absolute',
            right: 0,
            zIndex: 10,
            width: 26,
            height: 26,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-md)',
            backdropFilter: 'blur(4px)',
          }}
          title="Scroll right"
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
