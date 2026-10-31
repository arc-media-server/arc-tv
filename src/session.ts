import { configure } from './api';

// What the TV remembers between launches: the chosen server and this TV's sign-in token.

export interface SavedServer { url: string; name: string; id: string }

const SERVER = 'arc.server';
const TOKEN = 'arc.token';

export function loadSession(): { server: SavedServer | null; token: string } {
  let server: SavedServer | null = null;
  try {
    server = JSON.parse(localStorage.getItem(SERVER) ?? 'null');
  } catch { /* ignore */ }
  const token = localStorage.getItem(TOKEN) ?? '';
  if (server) configure({ server: server.url, token });
  return { server, token };
}

export function saveServer(server: SavedServer) {
  localStorage.setItem(SERVER, JSON.stringify(server));
  configure({ server: server.url });
}

export function saveToken(token: string) {
  if (token) localStorage.setItem(TOKEN, token);
  else localStorage.removeItem(TOKEN);
  configure({ token });
}

export function forgetServer() {
  localStorage.removeItem(SERVER);
  saveToken('');
}
