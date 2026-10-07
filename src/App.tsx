import { useEffect, useState } from 'react';
import { ensureSession, isConfigured } from './lib/supabase';
import { syncClock } from './lib/clock';
import { audio } from './lib/audio';
import { useRoute } from './lib/router';
import { Home } from './components/Home';
import { RoomPage } from './components/RoomPage';
import { HeroLogo, Logo } from './components/Logo';

export function App() {
  const route = useRoute();
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le son ne peut démarrer qu'après un geste de l'utilisateur ; petit « clic » sur chaque bouton
  useEffect(() => {
    const unlock = () => audio.unlock();
    const onClick = (e: MouseEvent) => {
      const button = (e.target as Element | null)?.closest?.('button');
      if (button && !button.disabled && !button.closest('.sound-toggle')) audio.play('click');
    };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    ensureSession()
      .then((id) => {
        setUserId(id);
        void syncClock();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (!isConfigured) {
    return (
      <div className="page center">
        <div className="card narrow">
          <Logo />
          <h2>Configuration manquante</h2>
          <p>
            Créez un fichier <code>.env.local</code> à partir de <code>.env.example</code> avec l'URL et la clé
            publique de votre projet Supabase, puis relancez <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page center">
        <div className="card narrow">
          <Logo />
          <p className="error">{error}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="page center">
        <HeroLogo />
        <p className="muted loading-dots">Connexion</p>
      </div>
    );
  }

  return route.name === 'room' ? <RoomPage key={route.code} code={route.code} userId={userId} /> : <Home />;
}
