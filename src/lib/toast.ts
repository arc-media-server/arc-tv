import { useEffect, useState } from 'react';

// A short note at the bottom of the screen ("… plays next"), gone after a few seconds.

let text = '';
let timer = 0;
const subs = new Set<(s: string) => void>();

export function toast(message: string) {
  text = message;
  subs.forEach((s) => s(text));
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { text = ''; subs.forEach((s) => s('')); }, 4000);
}

export function useToast(): string {
  const [s, setS] = useState(text);
  useEffect(() => { subs.add(setS); return () => { subs.delete(setS); }; }, []);
  return s;
}
