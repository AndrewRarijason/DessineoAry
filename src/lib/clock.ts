import { api } from './api';

// Décalage entre l'horloge locale et celle du serveur (les chronos viennent du serveur)
let offsetMs = 0;
let bestRtt = Number.POSITIVE_INFINITY;

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export async function syncClock(samples = 3): Promise<void> {
  for (let i = 0; i < samples; i++) {
    try {
      const t0 = Date.now();
      const server = Date.parse(await api.serverNow());
      const t1 = Date.now();
      const rtt = t1 - t0;
      if (rtt < bestRtt) {
        bestRtt = rtt;
        offsetMs = server - (t0 + t1) / 2;
      }
    } catch {
      // horloge locale par défaut
    }
  }
}

/** Secondes restantes avant une échéance serveur (ISO). */
export function secondsLeft(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - serverNow()) / 1000));
}
