'use client';

import { useEffect, useRef } from 'react';

export function LandingNav({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    function onScroll() {
      node!.classList.toggle('is-scrolled', window.scrollY > 60);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav ref={ref} className="landing-nav">
      {children}
    </nav>
  );
}
