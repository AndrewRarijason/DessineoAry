import { audio } from '../lib/audio';
import { useSoundSettings } from '../hooks/useSound';

/** Boutons pour couper / remettre les bruitages et la musique (choix mémorisé). */
export function SoundToggle() {
  const { sfx, music } = useSoundSettings();
  return (
    <div className="sound-toggle" role="group" aria-label="Son">
      <button
        type="button"
        className={`icon-btn${sfx ? '' : ' off'}`}
        aria-pressed={sfx}
        title={sfx ? 'Couper les bruitages' : 'Activer les bruitages'}
        onClick={() => {
          audio.setSfx(!sfx);
          if (!sfx) audio.play('pop');
        }}
      >
        {sfx ? '🔊' : '🔇'}
      </button>
      <button
        type="button"
        className={`icon-btn${music ? '' : ' off'}`}
        aria-pressed={music}
        title={music ? 'Couper la musique' : 'Activer la musique'}
        onClick={() => audio.setMusic(!music)}
      >
        🎵
      </button>
    </div>
  );
}
