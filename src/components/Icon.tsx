// Small line icons drawn here (no icon font on the TV), in the spirit of the web app's set.

const paths: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M16.5 16.5L21 21',
  home: 'M3 11l9-7l9 7 M5 10v10h5v-6h4v6h5V10',
  film: 'M4 3h16v18H4z M8 3v18 M16 3v18 M4 8h4 M4 13h4 M4 18h4 M16 8h4 M16 13h4 M16 18h4',
  tv: 'M3 7h18v12H3z M8 3l4 4l4-4',
  clapper: 'M3 10h18v10H3z M3 10l2-6l16 2l-1 4 M9 4.5l-2 5 M15 5.5l-2 4.5',
  bookmark: 'M6 3h12v18l-6-4l-6 4z',
  bookmarkOn: 'M6 3h12v18l-6-4l-6 4z M9 10l2 2l4-4',
  out: 'M10 4H5v16h5 M15 8l4 4l-4 4 M19 12H9',
  play: 'M7 4l13 8l-13 8z',
  pause: 'M7 4h3v16H7z M14 4h3v16h-3z',
  back10: 'M4 12a8 8 0 1 0 2.5-5.8 M4 4v4h4',
  fwd10: 'M20 12a8 8 0 1 1-2.5-5.8 M20 4v4h-4',
  next: 'M5 4l10 8l-10 8z M18 4v16',
  close: 'M5 5l14 14 M19 5L5 19',
  check: 'M5 12l5 5l9-10',
  circleCheck: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M8 12l3 3l5-6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  restart: 'M4 12a8 8 0 1 0 2.5-5.8 M4 4v4h4',
  shuffle: 'M3 7h4l10 10h4 M3 17h4l3-3 M14 10l3-3h4 M18 4l3 3l-3 3 M18 14l3 3l-3 3',
  audio: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  captions: 'M3 6h18v12H3z M7 13h3 M13 13h4 M7 10h10',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  sliders: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M16 4v4 M10 10v4 M18 16v4',
  playlist: 'M3 6h13 M3 12h13 M3 18h8 M15 15v6l5-3z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  gauge: 'M4 18a8 8 0 1 1 16 0 M12 18l4-6',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 11v6 M12 7.5v.01',
  tvShow: 'M3 7h18v12H3z M8 3l4 4l4-4',
};

export function Icon({ name, size = 36 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}
