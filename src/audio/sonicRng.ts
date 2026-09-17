import { TrackEffects, Note, InstrumentId } from '../types/daw';
import { DEFAULT_TRACK_EFFECTS } from './constants';
import { SeededRNG } from './seededRng';

export class SonicRNGEngine {
  // Roll a procedural patch / effects preset for a track
  public static rollPatch(rng: SeededRNG, instrument: InstrumentId, chaos: number = 0.5): TrackEffects {
    const base = { ...DEFAULT_TRACK_EFFECTS };

    // Jitter helper
    const jitter = (val: number, range: number) => {
      const delta = (rng.next() * 2 - 1) * range * chaos;
      return val + delta;
    };

    switch (instrument) {
      case 'synth_lead':
        return {
          cutoff: Math.max(400, Math.min(18000, jitter(4000, 6000))),
          resonance: Math.max(0.5, Math.min(18, jitter(5.0, 8.0))),
          distortion: Math.max(0, Math.min(0.9, rng.next() * chaos)),
          delaySend: rng.next() * 0.6 * chaos,
          delayTime: [0.125, 0.25, 0.333, 0.375, 0.5][rng.nextInt(0, 5)],
          reverbSend: Math.max(0.1, Math.min(0.8, jitter(0.35, 0.3))),
          attack: Math.max(0.002, Math.min(0.4, rng.next() * 0.1 * chaos)),
          decay: Math.max(0.05, Math.min(1.2, jitter(0.4, 0.3))),
          sustain: Math.max(0.1, Math.min(1.0, jitter(0.7, 0.4))),
          release: Math.max(0.05, Math.min(2.5, jitter(0.5, 0.5))),
        };

      case 'analog_bass':
        return {
          cutoff: Math.max(120, Math.min(3500, jitter(800, 800))),
          resonance: Math.max(0.5, Math.min(12, jitter(3.0, 4.0))),
          distortion: Math.max(0.05, Math.min(0.7, rng.next() * 0.6 * chaos)),
          delaySend: rng.next() < 0.2 ? 0.15 : 0,
          delayTime: 0.25,
          reverbSend: 0.05,
          attack: 0.005,
          decay: Math.max(0.1, Math.min(1.0, jitter(0.35, 0.25))),
          sustain: Math.max(0.2, Math.min(0.9, jitter(0.6, 0.3))),
          release: Math.max(0.05, Math.min(0.8, jitter(0.2, 0.2))),
        };

      case 'ambient_pad':
        return {
          cutoff: Math.max(800, Math.min(14000, jitter(3500, 2500))),
          resonance: Math.max(0.5, Math.min(8, jitter(1.8, 2.0))),
          distortion: rng.next() * 0.2 * chaos,
          delaySend: Math.max(0.2, Math.min(0.8, jitter(0.45, 0.25))),
          delayTime: [0.333, 0.375, 0.5, 0.666][rng.nextInt(0, 4)],
          reverbSend: Math.max(0.4, Math.min(0.95, jitter(0.65, 0.2))),
          attack: Math.max(0.2, Math.min(2.0, jitter(0.8, 0.6))),
          decay: Math.max(0.5, Math.min(2.0, jitter(1.0, 0.5))),
          sustain: Math.max(0.5, Math.min(1.0, jitter(0.85, 0.2))),
          release: Math.max(0.8, Math.min(3.5, jitter(1.8, 0.8))),
        };

      case 'chiptune':
        return {
          cutoff: Math.max(2000, Math.min(18000, jitter(12000, 4000))),
          resonance: Math.max(0.5, Math.min(15, jitter(4.0, 6.0))),
          distortion: rng.next() < 0.4 ? 0.3 : 0,
          delaySend: rng.next() * 0.4 * chaos,
          delayTime: 0.125,
          reverbSend: 0.15,
          attack: 0.002,
          decay: 0.15,
          sustain: 0.6,
          release: 0.1,
        };

      default:
        return {
          ...base,
          cutoff: Math.max(500, Math.min(16000, jitter(base.cutoff, 3000))),
          resonance: Math.max(0.5, Math.min(10, jitter(base.resonance, 3))),
          distortion: rng.next() * 0.3 * chaos,
          delaySend: rng.next() * 0.4 * chaos,
          reverbSend: Math.max(0.05, Math.min(0.6, jitter(base.reverbSend, 0.2))),
        };
    }
  }

  // Roll a procedural glitch / fill into existing notes
  public static rollGlitchFill(rng: SeededRNG, notes: Note[], targetBeat: number, durationBeats: number = 1.0): Note[] {
    const glitchNotes: Note[] = [];
    const stepCount = durationBeats * 8; // 32nd notes
    const stepDuration = durationBeats / stepCount;

    // Pick a base pitch from existing notes or default to 60 (C4)
    const basePitch = notes.length > 0 ? notes[rng.nextInt(0, notes.length)].pitch : 60;
    const mode = rng.nextInt(0, 3);

    for (let i = 0; i < stepCount; i++) {
      const beat = targetBeat + i * stepDuration;
      let pitch = basePitch;

      if (mode === 0) {
        // Pitch roll up
        pitch = basePitch + Math.floor(i * 1.5);
      } else if (mode === 1) {
        // Octave stutter
        pitch = i % 2 === 0 ? basePitch : basePitch + 12;
      } else {
        // Rapid random stutter
        pitch = basePitch + [-5, 0, 3, 7, 12][rng.nextInt(0, 5)];
      }

      glitchNotes.push({
        id: `glitch-${targetBeat}-${i}`,
        pitch,
        time: Number(beat.toFixed(3)),
        duration: Number((stepDuration * 0.85).toFixed(3)),
        velocity: 0.6 + (i / stepCount) * 0.4,
      });
    }

    return glitchNotes;
  }
}
