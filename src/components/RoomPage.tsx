import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { loadNickname, saveNickname } from '../lib/storage';
import { useRoom } from '../hooks/useRoom';
import { useGameSounds } from '../hooks/useSound';
import { Logo } from './Logo';
import { Lobby } from './Lobby';
import { Game } from './Game';
import { Results } from './Results';

interface Props {
  code: string;
  userId: string;
}

/** Rejoint la salle (ou y revient après un rechargement), puis affiche l'écran adapté. */
export function RoomPage({ code, userId }: Props) {
  const [nickname, setNickname] = useState(loadNickname);
  const [draft, setDraft] = useState(nickname);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nickname) return;
    let cancelled = false;
    api
      .joinRoom(code, nickname)
      .then((ref) => !cancelled && setRoomId(ref.room_id))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [code, nickname]);

  if (error) {
    return (
      <div className="page center">
        <div className="card narrow">
          <Logo />
          <p className="error">{error}</p>
          <div className="row">
            {/pseudo/i.test(error) && (
              <button
                className="btn"
                onClick={() => {
                  setError(null);
                  setNickname('');
                }}
              >
                Changer de pseudo
              </button>
            )}
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Retour à l’accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!nickname) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      const nick = draft.trim();
      if (!nick) return;
      saveNickname(nick);
      setNickname(nick);
    };
    return (
      <div className="page center">
        <form className="card narrow" onSubmit={submit}>
          <Logo />
          <p>
            Vous rejoignez la salle <strong className="code-tag">{code}</strong>
          </p>
          <label className="field">
            <span>Votre pseudo</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20} autoFocus />
          </label>
          <button className="btn btn-primary btn-big" type="submit">
            Entrer dans la salle
          </button>
        </form>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="page center">
        <Logo />
        <p className="muted">Entrée dans la salle {code}…</p>
      </div>
    );
  }

  return <RoomView roomId={roomId} userId={userId} nickname={nickname} />;
}

function RoomView({ roomId, userId, nickname }: { roomId: string; userId: string; nickname: string }) {
  const conn = useRoom(roomId, userId, nickname);
  const { state, fatalError } = conn;
  useGameSounds(state, userId);

  const leave = async () => {
    try {
      await api.leaveRoom(roomId);
    } finally {
      navigate('/');
    }
  };

  if (fatalError) {
    return (
      <div className="page center">
        <div className="card narrow">
          <Logo />
          <p className="error">{fatalError}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Retour à l’accueil
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page center">
        <Logo />
        <p className="muted">Chargement de la salle…</p>
      </div>
    );
  }

  switch (state.room.status) {
    case 'lobby':
      return <Lobby conn={conn} state={state} userId={userId} onLeave={leave} />;
    case 'playing':
      return <Game conn={conn} state={state} userId={userId} onLeave={leave} />;
    case 'finished':
      return <Results conn={conn} state={state} userId={userId} onLeave={leave} />;
  }
}
