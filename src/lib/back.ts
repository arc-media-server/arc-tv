import { useEffect, useRef } from 'react';

// Back on the remote goes to whatever opened last: a menu over a page, the player's controls,
// then the screen itself (App pops the screen when nothing else wants it).

type Handler = () => boolean | void;
const handlers: { fn: { current: Handler } }[] = [];

/** While mounted (and `enabled`), Back calls `fn` first; return false to let it fall through. */
export function useBack(fn: Handler, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const entry = { fn: ref };
    handlers.push(entry);
    return () => {
      const i = handlers.indexOf(entry);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, [enabled]);
}

/** Runs the newest Back handler; true when one took it. */
export function handleBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i].fn.current() !== false) return true;
  }
  return false;
}
