/**
 * Chaos-Live Sound Engine
 * Procedural Web Audio API sound synthesizer with zero latency
 * plus custom audio file / URL playback support.
 */

export interface SoundPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const SOUND_PRESETS: SoundPreset[] = [
  { id: 'chime-diamond', name: '💎 Diamond Chime', description: 'Crystal chime for gifts', icon: '💎' },
  { id: 'victory-fanfare', name: '🏆 Victory Fanfare', description: 'Triumphant brass fanfare for goals', icon: '🏆' },
  { id: 'tnt-boom', name: '💣 TNT Explosion', description: 'Heavy explosive bass drop for TNT / boss', icon: '💣' },
  { id: 'powerup-level', name: '⚡ Powerup Level', description: 'Ascending synth arpeggio', icon: '⚡' },
  { id: 'retro-8bit', name: '👾 8-Bit Retro Ping', description: 'Arcade style coin / action sound', icon: '👾' },
  { id: 'monster-roar', name: '🦁 Monster Roar', description: 'Deep beast roar for Lion / Bosses', icon: '🦁' },
  { id: 'heart-pop', name: '💖 Heart Pop', description: 'Cute melodic pop for Likes & Follows', icon: '💖' },
  { id: 'bell-alert', name: '🔔 Grand Alert Bell', description: 'Clear metallic bell chime', icon: '🔔' },
];

let audioCtx: AudioContext | null = null;
let masterVolume = 0.8;
let isMuted = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function setMasterVolume(vol: number): void {
  masterVolume = Math.max(0, Math.min(1, vol));
}

export function getMasterVolume(): number {
  return masterVolume;
}

export function setMuted(muted: boolean): void {
  isMuted = muted;
}

export function getMuted(): boolean {
  return isMuted;
}

/**
 * Play a sound effect by preset ID or custom URL
 */
export function playSound(soundIdOrUrl?: string, volumeMultiplier = 1.0): void {
  if (isMuted || !soundIdOrUrl || soundIdOrUrl === 'none' || soundIdOrUrl === 'silent') {
    return;
  }

  // If it's a URL or file path (contains slash or dot extension)
  if (soundIdOrUrl.startsWith('http://') || soundIdOrUrl.startsWith('https://') || soundIdOrUrl.startsWith('/') || soundIdOrUrl.match(/\.(mp3|wav|ogg|aac|m4a)$/i)) {
    try {
      const audio = new Audio(soundIdOrUrl);
      audio.volume = Math.max(0, Math.min(1, masterVolume * volumeMultiplier));
      void audio.play().catch(() => {
        // Autoplay may be blocked if user hasn't interacted yet
      });
      return;
    } catch {
      // Fallback to procedural synth
    }
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(masterVolume * volumeMultiplier, now);
  gainNode.connect(ctx.destination);

  switch (soundIdOrUrl) {
    case 'chime-diamond': {
      // Sparkling multi-tone chime
      const frequencies = [587.33, 880.0, 1174.66, 1760.0];
      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        oscGain.gain.setValueAtTime(0, now + idx * 0.05);
        oscGain.gain.linearRampToValueAtTime(0.3, now + idx * 0.05 + 0.02);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.6);

        osc.connect(oscGain);
        oscGain.connect(gainNode);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.65);
      });
      break;
    }

    case 'victory-fanfare': {
      // Majestic trumpet notes
      const notes = [
        { f: 523.25, t: 0, d: 0.12 },    // C5
        { f: 659.25, t: 0.12, d: 0.12 }, // E5
        { f: 783.99, t: 0.24, d: 0.12 }, // G5
        { f: 1046.5, t: 0.36, d: 0.4 },  // C6
      ];
      notes.forEach((n) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(n.f, now + n.t);

        oscGain.gain.setValueAtTime(0, now + n.t);
        oscGain.gain.linearRampToValueAtTime(0.25, now + n.t + 0.02);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

        osc.connect(oscGain);
        oscGain.connect(gainNode);

        osc.start(now + n.t);
        osc.stop(now + n.t + n.d + 0.05);
      });
      break;
    }

    case 'tnt-boom': {
      // Deep Sub-Bass Impact + White Noise Blast
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);

      oscGain.gain.setValueAtTime(0.7, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(oscGain);
      oscGain.connect(gainNode);

      osc.start(now);
      osc.stop(now + 0.75);

      // Noise burst for explosion texture
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.4);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(gainNode);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.45);
      break;
    }

    case 'powerup-level': {
      // Ascending synth laser
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);

      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.35, now + 0.05);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(oscGain);
      oscGain.connect(gainNode);

      osc.start(now);
      osc.stop(now + 0.45);
      break;
    }

    case 'retro-8bit': {
      // 8-bit coin jump
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.08);

      oscGain.gain.setValueAtTime(0.2, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(oscGain);
      oscGain.connect(gainNode);

      osc.start(now);
      osc.stop(now + 0.28);
      break;
    }

    case 'monster-roar': {
      // Low roaring growl
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.linearRampToValueAtTime(65, now + 0.4);
      osc.frequency.linearRampToValueAtTime(45, now + 0.8);

      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.5, now + 0.05);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      osc.connect(oscGain);
      oscGain.connect(gainNode);

      osc.start(now);
      osc.stop(now + 0.9);
      break;
    }

    case 'heart-pop': {
      // Soft gentle pop
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(1040, now + 0.12);

      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(oscGain);
      oscGain.connect(gainNode);

      osc.start(now);
      osc.stop(now + 0.2);
      break;
    }

    case 'bell-alert':
    default: {
      // Crisp metallic bell
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);

      oscGain.gain.setValueAtTime(0.4, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(oscGain);
      oscGain.connect(gainNode);

      osc.start(now);
      osc.stop(now + 0.55);
      break;
    }
  }
}
