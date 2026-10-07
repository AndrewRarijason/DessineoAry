import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'room'; code: string };

function parse(): Route {
  const match = window.location.pathname.match(/^\/salle\/([A-Za-z0-9]{4,8})\/?$/);
  return match ? { name: 'room', code: match[1].toUpperCase() } : { name: 'home' };
}

export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const roomPath = (code: string) => `/salle/${code.toUpperCase()}`;

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return route;
}
