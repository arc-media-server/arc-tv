import { t } from '../i18n';
import logoSvg from '../assets/brand/arc-logo-white.svg?raw';
import stackedSvg from '../assets/brand/arc-logo-stacked-white.svg?raw';
import markSvg from '../assets/brand/arc-mark-white.svg?raw';

// Arc's logo (arc-media-server docs/brand, chosen 13 November): the TV on little feet with Arc's
// arc and dot inside, and the name drawn as shapes, white with no colour. The SVG files are copied
// unchanged into src/assets/brand and inlined as they are (not redrawn); scripts/make-logos.mjs
// makes the TV packages' icons and splash from the same files. Size them with CSS (styles.css,
// "Arc's logo").

type Kind = 'logo' | 'stacked' | 'mark';
// The files' own <title> is left out: the wrapper is named from the catalogue instead (a <title>
// would also show as a tooltip under the Magic Remote's pointer).
const bare = (svg: string) => svg.replace(/<title>[^<]*<\/title>/, '');
const SVG: Record<Kind, string> = { logo: bare(logoSvg), stacked: bare(stackedSvg), mark: bare(markSvg) };

/**
 * One of the logo's three forms: `logo` (the TV beside "arc / MEDIA SERVER") where there's width,
 * `stacked` (the TV above the name) on sign-in and loading screens, `mark` (the TV alone) in small
 * places. Named for screen readers unless `decorative` (beside text that already says Arc).
 */
export function ArcLogo({ kind = 'logo', className = '', decorative }: { kind?: Kind; className?: string; decorative?: boolean }) {
  return (
    <span
      className={`arc-logo arc-logo-${kind} ${className}`.trim()}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : t('app.logo')}
      aria-hidden={decorative || undefined}
      dangerouslySetInnerHTML={{ __html: SVG[kind] }}
    />
  );
}

/** A starting or loading screen: the stacked logo where the TV's splash put it, a line below. */
export function Splash({ line }: { line?: string }) {
  return (
    <div className="screen splash">
      <ArcLogo kind="stacked" />
      {line && <p className="muted splash-line">{line}</p>}
    </div>
  );
}
