// Older TV browsers (LG's 2019 sets run Chrome 53) miss newer JavaScript built-ins. core-js adds
// the language ones; AbortController (Chrome 66) is added separately, with fetch wrapped so an
// abort (our request timeouts) still rejects the request.
import 'core-js/stable';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
