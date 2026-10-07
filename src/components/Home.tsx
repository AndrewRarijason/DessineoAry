import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { api } from '../lib/api';
import { audio } from '../lib/audio';
import { navigate, roomPath } from '../lib/router';
import { loadNickname, saveNickname } from '../lib/storage';
import { useAction } from '../hooks/useAction';
import { HeroLogo } from './Logo';
import { Rules } from './Rules';
import { Credits } from './Credits';
import { SoundToggle } from './SoundToggle';

const DOODLES = ['✏️', '🎨', '🖍️', '⭐', '💡', '🖌️', '❓', '🌀', '✨', '🎉'];

export function Home() {
  const [nickname, setNickname] = useState(loadNickname);
  const [code, setCode] = useState('');
  const { run, busy, error, setError } = useAction();

  const fail = (message: string) => {
    setError(message);
    audio.play('wrong');
  };

  const requireNickname = () => {
    const nick = nickname.trim();
    if (!nick) {
      fail('Choisissez d’abord un pseudo.');
      return null;
    }
    saveNickname(nick);
    return nick;
  };

  const create = () => {
    const nick = requireNickname();
    if (!nick) return;
    void run(async () => {
      const room = await api.createRoom(nick);
      navigate(roomPath(room.code));
    });
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const nick = requireNickname();
    if (!nick) return;
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      fail('Entrez le code de la salle (5 caractères).');
      return;
    }
    navigate(roomPath(clean));
  };

  return (
    <div className="page home">
      <div className="doodles" aria-hidden="true">
        {DOODLES.map((d, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties}>
            {d}
          </span>
        ))}
      </div>

      <div className="home-sound">
        <SoundToggle />
      </div>

      <header className="hero">
        <HeroLogo />
        <p className="tagline anim-up" style={{ '--d': '0.25s' } as CSSProperties}>
          Dessinez, devinez, marquez ! Le jeu de dessin à plusieurs, sur PC ou téléphone.
        </p>
      </header>

      <div className="card home-card anim-up" style={{ '--d': '0.35s' } as CSSProperties}>
        <label className="field">
          <span>Votre pseudo</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Ex. : Rakoto"
            autoComplete="nickname"
          />
        </label>

        <button className="btn btn-primary btn-big shine" onClick={create} disabled={busy}>
          🎨 Créer une salle
        </button>

        <div className="divider">
          <span>ou rejoindre une salle</span>
        </div>

        <form className="join-row" onSubmit={join}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="CODE"
            className="code-input"
            autoCapitalize="characters"
            aria-label="Code de la salle"
          />
          <button className="btn btn-accent" type="submit" disabled={busy}>
            Rejoindre
          </button>
        </form>

        {error && <p className="error shake">{error}</p>}
      </div>

      <Rules />
      <Credits />
    </div>
  );
}
