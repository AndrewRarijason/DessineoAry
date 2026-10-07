import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { serverNow } from '../lib/clock';
import { DRAW_EVENTS, type DrawMessage } from '../lib/drawing';
import type { RoomState } from '../lib/types';

type DrawListener = (msg: DrawMessage) => void;

export interface RoomConnection {
  state: RoomState | null;
  /** Erreur bloquante (exclu de la salle, salle supprimée…) */
  fatalError: string | null;
  online: Set<string>;
  connected: boolean;
  refresh: () => void;
  sendDraw: (msg: DrawMessage) => void;
  onDraw: (listener: DrawListener) => () => void;
}

const POLL_MS = 8000;

/**
 * Connexion temps réel à une salle :
 * - l'état du jeu vient de la base (get_room_state), rechargé à chaque changement (postgres_changes) ;
 * - le dessin passe par Broadcast (rien n'est stocké) ;
 * - la présence indique qui est connecté ;
 * - quand un chrono expire, le client demande au serveur d'avancer (advance_room).
 */
export function useRoom(roomId: string, userId: string, nickname: string): RoomConnection {
  const [state, setState] = useState<RoomState | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const [connected, setConnected] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const listenersRef = useRef(new Set<DrawListener>());
  const fetchRef = useRef({ running: false, pending: false, timer: 0 });
  const advanceRef = useRef({ key: '', at: 0 });

  const fetchState = useCallback(async () => {
    const f = fetchRef.current;
    if (f.running) {
      f.pending = true;
      return;
    }
    f.running = true;
    try {
      const next = await api.getRoomState(roomId);
      setState(next);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/plus partie|Accès refusé/i.test(message)) setFatalError(message);
    } finally {
      f.running = false;
      if (f.pending) {
        f.pending = false;
        void fetchState();
      }
    }
  }, [roomId]);

  const refresh = useCallback(() => {
    const f = fetchRef.current;
    window.clearTimeout(f.timer);
    f.timer = window.setTimeout(() => void fetchState(), 60);
  }, [fetchState]);

  // Canal temps réel
  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: false }, presence: { key: userId } },
    });

    for (const event of DRAW_EVENTS) {
      channel.on('broadcast', { event }, ({ payload }) => {
        const msg = { event, payload } as DrawMessage;
        listenersRef.current.forEach((listener) => listener(msg));
      });
    }

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guesses', filter: `room_id=eq.${roomId}` }, refresh)
      .on('presence', { event: 'sync' }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
        refresh();
      });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        void channel.track({ nickname });
        refresh();
      } else {
        setConnected(false);
      }
    });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
    // le pseudo ne change pas pendant la vie du canal
  }, [roomId, userId, refresh]);

  // Chargement initial + filet de sécurité si un événement temps réel est perdu
  useEffect(() => {
    void fetchState();
    const id = window.setInterval(() => void fetchState(), POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void fetchState();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchState]);

  // Fin de chrono : on demande au serveur de passer à la phase suivante
  const playing = state?.room.status === 'playing';
  const roundKey = state?.round ? `${state.round.id}|${state.round.phase}|${state.round.phase_ends_at}` : '';
  useEffect(() => {
    if (!playing || !roundKey) return;
    const endsAt = roundKey.split('|')[2];
    // petit décalage aléatoire pour que tous les clients n'appellent pas en même temps
    const due = Date.parse(endsAt) + 250 + Math.random() * 600;
    const id = window.setInterval(() => {
      if (serverNow() < due) return;
      const a = advanceRef.current;
      if (a.key === roundKey && Date.now() - a.at < 2500) return;
      a.key = roundKey;
      a.at = Date.now();
      api
        .advanceRoom(roomId)
        .catch(() => undefined)
        .finally(() => void fetchState());
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, roundKey, roomId, fetchState]);

  const sendDraw = useCallback((msg: DrawMessage) => {
    const channel = channelRef.current;
    if (!channel || channel.state !== 'joined') return;
    void channel.send({ type: 'broadcast', event: msg.event, payload: msg.payload });
  }, []);

  const onDraw = useCallback((listener: DrawListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return { state, fatalError, online, connected, refresh, sendDraw, onDraw };
}
