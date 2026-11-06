const PATHS = {
  view: 'M2 8s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5 M12.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  voice: 'M3 6h3l4-3v10l-4-3H3z M13 5a4 4 0 0 1 0 6 M16 2a8 8 0 0 1 0 12',
  muted: 'M3 6h3l4-3v10l-4-3H3z M14 5l5 6 M19 5l-5 6',
  apps: 'M3 1h14v14H3z M6 4h2v2H6z M12 4h2v2h-2z M6 10h2v2H6z M12 10h2v2h-2z',
  glass: 'M3 3h14l2 10H1z M10 3v10 M5 1l-2 14 M15 1l2 14',
  guide: 'M10 1l8 14H2z M10 6v4 M10 12v.2',
  settings: 'M2 4h16 M2 12h16 M7 1v6 M13 9v6',
  menu: 'M3 3h14 M3 8h14 M3 13h14',
  mode: 'M11 1L4 9h6l-1 6 7-9h-6z',
} as const;

export type DriveIconName = keyof typeof PATHS;
export function DriveIcon({ name }: { name: DriveIconName }) {
  return <svg viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}
