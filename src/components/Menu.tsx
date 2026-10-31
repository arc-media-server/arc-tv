import { Spotlight } from '@enact/spotlight';
import { useEffect, useRef, type ReactNode } from 'react';
import { useBack } from '../lib/back';
import { focusElement, Focusable, Trap } from './spot';

// Panels over a page (a title's ⋯ menu, Media Info, a library's Sort and Filters, the player's
// menus): the focus stays inside until Back or a choice closes it, then goes back to what opened it.

let nextId = 0;
// Where the focus goes back to as each open panel closes. A panel opened from another (Media
// Info from the ⋯ menu) goes back to what opened the first.
const returns: (HTMLElement | null)[] = [];

function inPanel(el: HTMLElement | null) {
  return !!el && (!document.body.contains(el) || !!(el.closest && el.closest('.overlay, .side-panel')));
}

/** Moves the focus into a panel when it opens and back to where it was when it closes. */
export function useFocusTrap(): string {
  const id = useRef(`trap-${++nextId}`).current;
  useEffect(() => {
    const current = Spotlight.getCurrent() as HTMLElement | null;
    const prev = inPanel(current) && returns.length ? returns[returns.length - 1] : current;
    returns.push(prev);
    const timer = window.setTimeout(() => Spotlight.focus(id), 0);
    return () => {
      window.clearTimeout(timer);
      // After the panel's gone, so its own items can't take the focus back (and a panel opening
      // in its place still knows where to return).
      window.setTimeout(() => {
        returns.splice(returns.lastIndexOf(prev), 1);
        if (prev && document.body.contains(prev)) focusElement(prev);
        else if (!Spotlight.getCurrent()) Spotlight.focus();
      }, 0);
    };
  }, [id]);
  return id;
}

export function Overlay({ width = 840, onClose, children, className = '' }: { width?: number; onClose: () => void; children: ReactNode; className?: string }) {
  const id = useFocusTrap();
  useBack(() => { onClose(); });
  return (
    <div className="overlay">
      <Trap spotlightId={id} className={`overlay-panel ${className}`} style={{ width }}>
        {children}
      </Trap>
    </div>
  );
}

/** A panel down the right of the screen (the player's menus). */
export function SidePanel({ title, body, onClose, children }: { title: string; body?: string; onClose: () => void; children: ReactNode }) {
  const id = useFocusTrap();
  useBack(() => { onClose(); });
  return (
    <Trap spotlightId={id} className="side-panel">
      <h2>{title}</h2>
      {body && <p className="muted">{body}</p>}
      {children}
    </Trap>
  );
}

export function MenuItem({ icon, label, detail, checked, onClick, first }: {
  icon?: ReactNode;
  label: string;
  detail?: string;
  checked?: boolean;
  onClick: () => void;
  first?: boolean;
}) {
  return (
    <Focusable className="menu-item" onClick={onClick} data-default={first || undefined}>
      <span className="menu-icon">{checked ? '✓' : icon ?? ''}</span>
      <span className="menu-text">
        <span className="menu-label">{label}</span>
        {detail && <span className="menu-detail">{detail}</span>}
      </span>
    </Focusable>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="menu-heading">{children}</div>;
}
