// Older TV browsers (2019–2020 sets run Chrome 68–79) miss some newer JavaScript built-ins.
import 'core-js/stable';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
