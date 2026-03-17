'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './PageTransition.module.css';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => {
      setDisplayChildren(children);
      setIsTransitioning(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [pathname, children]);

  return (
    <div className={`${styles.container} ${isTransitioning ? styles.fadeOut : styles.fadeIn}`}>
      {displayChildren}
    </div>
  );
}
