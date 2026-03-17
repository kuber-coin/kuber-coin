import React from 'react';
import styles from './AppHeader.module.css';

type LinkDef = {
  label: string;
  href: string;
};

type AppHeaderProps = Readonly<{
  title: string;
  active?: string;
  center?: React.ReactNode;
  right?: React.ReactNode;
  links?: ReadonlyArray<LinkDef>;
}>;

const DEFAULT_LINKS: LinkDef[] = [
  { label: 'Explorer', href: 'http://localhost:3200' },
  { label: 'Wallet', href: 'http://localhost:3250' },
  { label: 'Operations', href: 'http://localhost:3300' },
];

export default function AppHeader({
  title,
  active,
  center,
  right,
  links = DEFAULT_LINKS,
}: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.brand} aria-hidden="true">kubercoin</div>
        <h1 className={styles.title}>{title}</h1>
        <nav className={styles.nav} aria-label="App navigation">
          {links.map((l) => (
            <a
              key={l.label}
              className={styles.navLink}
              href={l.href}
              target="_blank"
              rel="noopener"
              aria-current={active === l.label ? 'page' : undefined}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>

      {center && <div className={styles.center}>{center}</div>}

      <div className={styles.right}>{right}</div>
    </header>
  );
}
