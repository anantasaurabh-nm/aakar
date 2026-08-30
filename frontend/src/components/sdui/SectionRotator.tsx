'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { SDUISectionOrInvalid } from '@erp/shared-contracts';
import { AccordionDivider } from './AccordionDivider';

export interface SectionRotatorProps {
  sections: SDUISectionOrInvalid[];
  onActiveSectionChange?: (sectionId: string) => void;
  renderSection: (section: SDUISectionOrInvalid) => ReactNode;
}

/**
 * The main content surface (stack.md §15, SDUI PRD §8). Owns section
 * ordering/rotation/scroll only — no business logic for any section type.
 */
export function SectionRotator({ sections, onActiveSectionChange, renderSection }: SectionRotatorProps) {
  const [panelOrder, setPanelOrder] = useState<string[]>(() => sections.map((s) => s.id));
  const [translatePos, setTranslatePos] = useState('-32px');
  const [useTransition, setUseTransition] = useState(true);
  const isRotatingRef = useRef(false);
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPanelOrder((prev) => {
      const validExisting = prev.filter((id) => sections.some((s) => s.id === id));
      const missing = sections.filter((s) => !validExisting.includes(s.id)).map((s) => s.id);
      return [...validExisting, ...missing];
    });
  }, [sections]);

  const hasMultipleSections = sections.length > 1;
  const firstKey = panelOrder[0] || sections[0]?.id || '';
  const secondKey = panelOrder[1] || sections[1]?.id || firstKey;
  const thirdKey = panelOrder[2] || panelOrder[0] || firstKey;

  const completeRotation = useCallback(() => {
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setUseTransition(false);
    if (firstKey && paneRefs.current[firstKey]) paneRefs.current[firstKey]!.scrollTop = 0;

    let newActiveId = '';
    setPanelOrder((prev) => {
      const next = [...prev];
      const first = next.shift();
      if (first) next.push(first);
      newActiveId = next[0] || '';
      return next;
    });
    if (onActiveSectionChange && newActiveId) onActiveSectionChange(newActiveId);
    setTranslatePos('-32px');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setUseTransition(true);
        isRotatingRef.current = false;
      });
    });
  }, [firstKey, onActiveSectionChange]);

  const handleHeadingClick = useCallback(() => {
    if (!useTransition || isRotatingRef.current || !hasMultipleSections) return;
    isRotatingRef.current = true;
    if (secondKey && paneRefs.current[secondKey]) paneRefs.current[secondKey]!.scrollTop = 0;
    setTranslatePos('calc(-32px - (100vh - var(--header-height)))');
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(completeRotation, 600);
  }, [useTransition, hasMultipleSections, secondKey, completeRotation]);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (
      e.target === e.currentTarget &&
      (e.propertyName === 'transform' || e.propertyName === '-webkit-transform') &&
      translatePos !== '-32px'
    ) {
      completeRotation();
    }
  };

  const getSectionByKey = (key: string) => sections.find((s) => s.id === key);

  const renderHeading = (sectionKey: string, isCollapsed = true, onClick: (() => void) | null = null) => {
    const section = getSectionByKey(sectionKey);
    if (!section) return null;
    const badge = 'badge' in section ? section.badge : undefined;
    const badgeType = 'badgeType' in section ? section.badgeType : undefined;
    return (
      <div key={`heading-${sectionKey}`} style={{ height: 32, overflow: 'hidden', flexShrink: 0 }}>
        <AccordionDivider label={section.label} badge={badge} badgeType={badgeType} isCollapsed={isCollapsed} onClick={onClick} />
      </div>
    );
  };

  const renderPane = (sectionKey: string, slot: 'active' | 'next' | 'upcoming') => {
    const section = getSectionByKey(sectionKey);
    if (!section) return null;
    const isSingle = !hasMultipleSections;
    const paneHeight = isSingle ? 'calc(100vh - var(--header-height))' : 'calc(100vh - var(--header-height) - 32px)';
    return (
      <div
        key={`pane-${sectionKey}`}
        ref={(el) => {
          if (slot === 'active' || slot === 'next') paneRefs.current[sectionKey] = el;
        }}
        style={{
          height: paneHeight,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'relative',
        }}
      >
        {renderSection(section)}
      </div>
    );
  };

  if (sections.length === 0) return null;

  if (!hasMultipleSections) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height))', width: '100%', overflow: 'hidden' }}>
        {renderPane(firstKey, 'active')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height))', width: '100%', overflow: 'hidden', position: 'relative' }}>
      <div
        onTransitionEnd={handleTransitionEnd}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          transition: useTransition ? 'transform 0.55s cubic-bezier(0.16,1,0.3,1)' : 'none',
          transform: `translate3d(0, ${translatePos}, 0)`,
          willChange: 'transform',
        }}
      >
        {renderHeading(firstKey, false)}
        {renderPane(firstKey, 'active')}
        {renderHeading(secondKey, true, handleHeadingClick)}
        {renderPane(secondKey, 'next')}
        {sections.length > 2 && renderHeading(thirdKey, true)}
        {sections.length > 2 && renderPane(thirdKey, 'upcoming')}
      </div>
    </div>
  );
}
