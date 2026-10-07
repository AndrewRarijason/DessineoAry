// Bruitages et musique générés en direct avec la Web Audio API :
// aucun fichier à télécharger, aucun droit d'auteur.

export type Sfx =
  | 'click' | 'pop' | 'join' | 'start' | 'turn' | 'round' | 'go' | 'message'
  | 'wrong' | 'close' | 'correct' | 'found' | 'fail' | 'tick' | 'victory' | 'gameover';

export type Mood = 'menu' | 'game';

export interface SoundSettings {
  sfx: boolean;
  music: boolean;
}

const STORAGE_KEY = 'dessineo.sound';
const SFX_VOLUME = 0.9;
const MUSIC_VOLUME: Record<Mood, number> = { menu: 0.55, game: 0.32 };
const TEMPO: Record<Mood, number> = { menu: 100, game: 116 };

const mtof = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function loadSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { sfx: true, music: true, ...JSON.parse(raw) };
  } catch {
    // stockage indisponible
  }
  return { sfx: true, music: true };
}

interface ToneOptions {
  freq: number;
  /** glissando jusqu'à cette fréquence */
  to?: number;
  /** temps absolu (AudioContext) */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  bus: AudioNode;
  filter?: number;
}

// ---------------------------------------------------------------------
//  Musique : boucle de 8 mesures (Do – La m – Fa – Sol), croches
// ---------------------------------------------------------------------

const STEPS_PER_BAR = 8;
const BARS = 8;
const ROOTS = [48, 45, 41, 43, 48, 45, 50, 43]; // basse
const CHORDS = [
  [60, 64, 67, 72], [57, 60, 64, 69], [57, 60, 65, 69], [55, 59, 62, 67],
  [60, 64, 67, 72], [57, 60, 64, 69], [57, 62, 65, 69], [55, 59, 62, 67],
];
const ARP = [0, 2, 1, 3, 0, 2, 1, 2];
const _ = null;
const MELODY: (number | null)[] = [
  76, _, 79, _, 81, 79, 76, _,
  72, _, 76, _, 74, _, 72, _,
  69, _, 72, _, 74, 72, 69, _,
  67, _, _, 69, 71, 74, _, _,
  76, _, 79, _, 84, _, 81, 79,
  76, _, _, 74, 72, _, 74, _,
  81, _, 79, _, 76, _, 74, _,
  74, _, 76, _, 79, _, _, _,
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listeners = new Set<() => void>();
  private musicTimer = 0;
  private nextStepTime = 0;
  private step = 0;
  private mood: Mood = 'menu';
  settings: SoundSettings = loadSettings();

  // --- réglages -------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSettings = () => this.settings;

  private update(patch: Partial<SoundSettings>) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // ignoré
    }
    this.listeners.forEach((l) => l());
  }

  setSfx(on: boolean) {
    this.update({ sfx: on });
  }

  setMusic(on: boolean) {
    this.update({ music: on });
    if (on) {
      this.unlock();
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  setMood(mood: Mood) {
    if (this.mood === mood) return;
    this.mood = mood;
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(MUSIC_VOLUME[mood], this.ctx.currentTime, 0.4);
    }
  }

  /** À appeler lors d'un geste de l'utilisateur (les navigateurs bloquent le son avant). */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.8;
      const compressor = ctx.createDynamicsCompressor();
      master.connect(compressor).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void ctx.suspend();
        else void ctx.resume();
      });
    }
    if (this.ctx.state === 'suspended' && document.visibilityState === 'visible') void this.ctx.resume();
    if (this.settings.music) this.startMusic();
  }

  // --- synthèse -------------------------------------------------------

  private tone(o: ToneOptions) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, o.at);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.at + o.dur);
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.005;
    env.gain.setValueAtTime(0.0001, o.at);
    env.gain.exponentialRampToValueAtTime(peak, o.at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.filter;
      node = node.connect(lp);
    }
    node.connect(env).connect(o.bus);
    osc.start(o.at);
    osc.stop(o.at + o.dur + 0.05);
  }

  private hiss(at: number, dur: number, gain: number, type: BiquadFilterType, freq: number, to?: number, bus?: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(env).connect(bus ?? this.sfxBus!);
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  /** Suite de notes : [midi, décalage en s, durée en s] */
  private notes(list: [number, number, number][], type: OscillatorType, gain: number) {
    const now = this.ctx!.currentTime + 0.01;
    for (const [midi, offset, dur] of list) {
      this.tone({ freq: mtof(midi), at: now + offset, dur, type, gain, bus: this.sfxBus! });
    }
  }

  // --- bruitages ------------------------------------------------------

  play(name: Sfx) {
    if (!this.settings.sfx) return;
    if (!this.ctx) this.unlock();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const bus = this.sfxBus!;

    switch (name) {
      case 'click':
        this.tone({ freq: 520, to: 780, at: t, dur: 0.07, gain: 0.07, bus });
        break;
      case 'pop':
        this.tone({ freq: 280, to: 900, at: t, dur: 0.12, type: 'triangle', gain: 0.14, bus });
        break;
      case 'join':
        this.notes([[72, 0, 0.15], [76, 0.08, 0.15], [79, 0.16, 0.3]], 'triangle', 0.13);
        break;
      case 'start':
        this.notes(
          [[60, 0, 0.12], [64, 0.07, 0.12], [67, 0.14, 0.12], [72, 0.21, 0.12], [76, 0.28, 0.12], [79, 0.35, 0.12], [84, 0.42, 0.6]],
          'triangle', 0.14,
        );
        this.notes([[72, 0.42, 0.6], [76, 0.42, 0.6]], 'sine', 0.08);
        this.hiss(t + 0.42, 0.4, 0.05, 'highpass', 6000);
        break;
      case 'turn':
        this.notes([[79, 0, 0.7], [86, 0.15, 0.9]], 'sine', 0.16);
        this.notes([[91, 0.15, 0.5]], 'sine', 0.04);
        break;
      case 'round':
        this.hiss(t, 0.35, 0.08, 'bandpass', 400, 3500);
        this.notes([[67, 0.2, 0.3], [74, 0.3, 0.4]], 'triangle', 0.1);
        break;
      case 'go':
        this.notes([[72, 0, 0.1], [79, 0.09, 0.25]], 'square', 0.05);
        break;
      case 'message':
        this.tone({ freq: 880, at: t, dur: 0.05, gain: 0.025, bus });
        break;
      case 'wrong':
        this.tone({ freq: 220, to: 150, at: t, dur: 0.14, type: 'square', gain: 0.05, filter: 1200, bus });
        break;
      case 'close':
        this.notes([[76, 0, 0.12], [79, 0.1, 0.12], [76, 0.2, 0.18]], 'triangle', 0.11);
        break;
      case 'correct':
        this.notes([[72, 0, 0.1], [76, 0.06, 0.1], [79, 0.12, 0.1], [84, 0.18, 0.12], [88, 0.24, 0.45]], 'triangle', 0.15);
        this.notes([[96, 0.3, 0.15], [100, 0.38, 0.15], [103, 0.46, 0.3]], 'sine', 0.05);
        this.hiss(t + 0.24, 0.5, 0.04, 'highpass', 8000);
        break;
      case 'found':
        this.notes([[79, 0, 0.15], [84, 0.1, 0.35]], 'triangle', 0.12);
        break;
      case 'fail':
        this.tone({ freq: mtof(67), to: mtof(65), at: t, dur: 0.3, type: 'triangle', gain: 0.13, bus });
        this.tone({ freq: mtof(64), to: mtof(59), at: t + 0.32, dur: 0.6, type: 'triangle', gain: 0.13, bus });
        break;
      case 'tick':
        this.tone({ freq: 1400, to: 900, at: t, dur: 0.04, type: 'square', gain: 0.035, filter: 3000, bus });
        break;
      case 'victory':
        this.notes(
          [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 0.35], [76, 0.8, 0.15], [79, 0.95, 0.9]],
          'triangle', 0.15,
        );
        this.notes([[48, 0, 0.45], [55, 0.45, 0.45], [48, 0.95, 0.9], [60, 0.95, 0.9], [64, 0.95, 0.9]], 'sine', 0.1);
        this.hiss(t + 0.95, 0.8, 0.05, 'highpass', 7000);
        break;
      case 'gameover':
        this.notes([[72, 0, 0.2], [67, 0.2, 0.2], [64, 0.4, 0.2], [72, 0.6, 0.6]], 'triangle', 0.12);
        break;
    }
  }

  // --- musique --------------------------------------------------------

  private startMusic() {
    const ctx = this.ctx;
    if (!ctx || this.musicTimer) return;
    this.musicBus!.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus!.gain.setTargetAtTime(MUSIC_VOLUME[this.mood], ctx.currentTime, 0.8);
    this.step = 0;
    this.nextStepTime = ctx.currentTime + 0.15;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  private stopMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.musicTimer) return;
    this.musicBus!.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  private scheduleMusic() {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') return;
    const stepDur = 60 / TEMPO[this.mood] / 2;
    // Onglet resté en arrière-plan : on repart de maintenant au lieu de rattraper le retard
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % (STEPS_PER_BAR * BARS);
    }
  }

  private playStep(step: number, at: number, stepDur: number) {
    const bus = this.musicBus!;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const beat = step % STEPS_PER_BAR;
    const chord = CHORDS[bar];

    // Arpège doux
    this.tone({ freq: mtof(chord[ARP[beat]]), at, dur: stepDur * 0.9, type: 'triangle', gain: 0.035, filter: 2200, bus });

    // Basse
    if (beat === 0 || beat === 3 || beat === 4 || beat === 6) {
      const midi = beat === 4 ? ROOTS[bar] + 7 : ROOTS[bar];
      this.tone({ freq: mtof(midi), at, dur: stepDur * 1.6, type: 'triangle', gain: 0.1, filter: 600, bus });
    }

    // Mélodie (durée = jusqu'à la note suivante)
    const note = MELODY[step];
    if (note !== null) {
      let len = 1;
      while (len < 4 && MELODY[(step + len) % MELODY.length] === null) len++;
      this.tone({ freq: mtof(note), at, dur: stepDur * len * 0.95, type: 'square', gain: 0.03, attack: 0.01, filter: 1800, bus });
      this.tone({ freq: mtof(note), at, dur: stepDur * len * 0.95, type: 'sine', gain: 0.035, attack: 0.01, bus });
    }

    // Percussions
    if (beat === 0 || beat === 4) this.tone({ freq: 150, to: 45, at, dur: 0.16, gain: 0.22, bus });
    if (this.mood === 'game' && (beat === 2 || beat === 6)) this.hiss(at, 0.09, 0.06, 'bandpass', 1800, undefined, bus);
    if (beat % 2 === 1) this.hiss(at, 0.035, 0.03, 'highpass', 7000, undefined, bus);
  }
}

export const audio = new AudioEngine();
