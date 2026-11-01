// Older TV browsers (LG's 2019 sets run Chrome 53) miss newer JavaScript built-ins. core-js adds
// the language ones; AbortController (Chrome 66) is added separately, with fetch wrapped so an
// abort (our request timeouts) still rejects the request.
import 'core-js/stable';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// The app scrolls with transforms (components/Scroller.tsx). Focusing something off screen makes
// the browser scroll its clipped parents too; that's undone here so the two never add up.
document.addEventListener('scroll', (e) => {
  const el = e.target;
  if (el === document) {
    window.scrollTo(0, 0);
  } else if (el instanceof HTMLElement && !el.hasAttribute('data-scrollable')) {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }
}, true);

createRoot(document.getElementById('root')!).render(<App />);
