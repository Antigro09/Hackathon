export function Icon({ name, size = 20 }: { name: 'home' | 'wave' | 'arrow' | 'mic' | 'file' | 'demo' | 'check' | 'shield' | 'info' | 'external' | 'download' | 'print'; size?: number }) {
  const paths = {
    home: 'm3 10 9-7 9 7v11h-7v-7h-4v7H3V10',
    wave: 'M2 12h4l2-7 4 14 4-16 3 12 2-3h2',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5m-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8',
    file: 'M14 2H5v20h14V7l-5-5v6h5M8 12h8m-8 4h8',
    demo: 'M9 3h6m-5 0v6L4 19a1.4 1.4 0 0 0 1 2h14a1.4 1.4 0 0 0 1-2L14 9V3M8 14h8',
    check: 'm5 12 4 4L19 6',
    shield: 'm12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3m-4 10 3 3 5-6',
    info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 5v1m0 3v6',
    external: 'M14 3h7v7m0-7L10 14m-1-9H3v16h16v-6',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    print: 'M7 8V2h10v6M6 17H3V8h18v9h-3M7 14h10v8H7z',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
