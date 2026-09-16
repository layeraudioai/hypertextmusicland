import { ProjectState } from '../types/daw';
import { DEFAULT_TRACK_EFFECTS } from './constants';

export function createDefaultProject(): ProjectState {
  return {
    id: 'project-aura-01',
    title: 'AuraVision Hybrid Genesis',
    bpm: 124,
    timeSignature: [4, 4],
    totalBars: 4,
    selectedTrackId: 'track-lead',
    masterVolume: 0.9,
    masterLimiter: true,
    visionFlow: {
      theme: 'neon-aura',
      bloom: 0.85,
      reactivity: 1.4,
      flowSpeed: 1.0,
      particleCount: 180,
      showPianoWaterfall: true,
      showWaveform: true,
      showSpectrogram: true,
      showTextOverlay: true,
      titleText: 'AURAVISION HYBRID • 124 BPM',
      aspectRatio: '16:9',
    },
    tracks: [
      {
        id: 'track-bass',
        name: 'Aura Sub 808',
        instrument: 'analog_bass',
        color: '#a855f7', // Purple
        volume: 0.85,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        effects: {
          ...DEFAULT_TRACK_EFFECTS,
          cutoff: 900,
          resonance: 4.5,
          distortion: 0.15,
          delaySend: 0.05,
          reverbSend: 0.05,
          decay: 0.4,
          sustain: 0.8,
        },
        notes: [
          // D1 = 38, F1 = 41, G1 = 43, C1 = 36
          { id: 'b1', pitch: 38, time: 0, duration: 1.8, velocity: 0.95 },
          { id: 'b2', pitch: 38, time: 2, duration: 1.5, velocity: 0.85 },
          { id: 'b3', pitch: 41, time: 4, duration: 1.8, velocity: 0.9 },
          { id: 'b4', pitch: 43, time: 6, duration: 1.5, velocity: 0.85 },
          { id: 'b5', pitch: 36, time: 8, duration: 1.8, velocity: 0.95 },
          { id: 'b6', pitch: 38, time: 10, duration: 1.5, velocity: 0.85 },
          { id: 'b7', pitch: 41, time: 12, duration: 1.8, velocity: 0.9 },
          { id: 'b8', pitch: 43, time: 14, duration: 1.5, velocity: 0.85 },
        ],
      },
      {
        id: 'track-lead',
        name: '66GHz Neon Saw Lead',
        instrument: 'synth_lead',
        color: '#f43f5e', // Rose
        volume: 0.75,
        pan: 0.15,
        muted: false,
        solo: false,
        armed: true,
        effects: {
          ...DEFAULT_TRACK_EFFECTS,
          cutoff: 4200,
          resonance: 6.0,
          delaySend: 0.35,
          delayTime: 0.375,
          reverbSend: 0.4,
          attack: 0.01,
          decay: 0.3,
          sustain: 0.7,
        },
        notes: [
          // D Minor Pentatonic Lead Riff
          { id: 'l1', pitch: 62, time: 0, duration: 0.45, velocity: 0.85 },
          { id: 'l2', pitch: 65, time: 0.5, duration: 0.45, velocity: 0.8 },
          { id: 'l3', pitch: 69, time: 1.0, duration: 0.9, velocity: 0.9 },
          { id: 'l4', pitch: 67, time: 2.0, duration: 0.45, velocity: 0.8 },
          { id: 'l5', pitch: 65, time: 2.5, duration: 0.45, velocity: 0.85 },
          { id: 'l6', pitch: 62, time: 3.0, duration: 0.9, velocity: 0.8 },

          { id: 'l7', pitch: 74, time: 4.0, duration: 0.45, velocity: 0.9 },
          { id: 'l8', pitch: 72, time: 4.5, duration: 0.45, velocity: 0.85 },
          { id: 'l9', pitch: 69, time: 5.0, duration: 0.9, velocity: 0.9 },
          { id: 'l10', pitch: 65, time: 6.0, duration: 0.9, velocity: 0.85 },
          { id: 'l11', pitch: 67, time: 7.0, duration: 0.9, velocity: 0.8 },

          { id: 'l12', pitch: 62, time: 8.0, duration: 0.45, velocity: 0.85 },
          { id: 'l13', pitch: 65, time: 8.5, duration: 0.45, velocity: 0.8 },
          { id: 'l14', pitch: 69, time: 9.0, duration: 0.9, velocity: 0.9 },
          { id: 'l15', pitch: 72, time: 10.0, duration: 0.45, velocity: 0.85 },
          { id: 'l16', pitch: 74, time: 10.5, duration: 0.9, velocity: 0.95 },
          { id: 'l17', pitch: 77, time: 11.5, duration: 0.45, velocity: 0.9 },

          { id: 'l18', pitch: 74, time: 12.0, duration: 0.9, velocity: 0.85 },
          { id: 'l19', pitch: 69, time: 13.0, duration: 0.9, velocity: 0.8 },
          { id: 'l20', pitch: 65, time: 14.0, duration: 0.9, velocity: 0.85 },
          { id: 'l21', pitch: 62, time: 15.0, duration: 0.9, velocity: 0.9 },
        ],
      },
      {
        id: 'track-pad',
        name: 'Vision Celestial Pad',
        instrument: 'ambient_pad',
        color: '#34d399', // Emerald
        volume: 0.65,
        pan: -0.2,
        muted: false,
        solo: false,
        armed: false,
        effects: {
          ...DEFAULT_TRACK_EFFECTS,
          cutoff: 2800,
          resonance: 1.5,
          delaySend: 0.4,
          delayTime: 0.5,
          reverbSend: 0.65,
          attack: 0.6,
          decay: 0.8,
          sustain: 0.9,
          release: 1.5,
        },
        notes: [
          // Dm7: D3(50), F3(53), A3(57), C4(60)
          { id: 'p1', pitch: 50, time: 0, duration: 3.8, velocity: 0.65 },
          { id: 'p2', pitch: 57, time: 0, duration: 3.8, velocity: 0.6 },
          { id: 'p3', pitch: 60, time: 0, duration: 3.8, velocity: 0.55 },

          // Bbmaj7: Bb2(46), D3(50), F3(53), A3(57)
          { id: 'p4', pitch: 46, time: 4, duration: 3.8, velocity: 0.65 },
          { id: 'p5', pitch: 53, time: 4, duration: 3.8, velocity: 0.6 },
          { id: 'p6', pitch: 57, time: 4, duration: 3.8, velocity: 0.55 },

          // C: C3(48), E3(52), G3(55)
          { id: 'p7', pitch: 48, time: 8, duration: 3.8, velocity: 0.65 },
          { id: 'p8', pitch: 55, time: 8, duration: 3.8, velocity: 0.6 },
          { id: 'p9', pitch: 60, time: 8, duration: 3.8, velocity: 0.55 },

          // Gm7: G2(43), Bb2(46), D3(50), F3(53)
          { id: 'p10', pitch: 43, time: 12, duration: 3.8, velocity: 0.65 },
          { id: 'p11', pitch: 50, time: 12, duration: 3.8, velocity: 0.6 },
          { id: 'p12', pitch: 53, time: 12, duration: 3.8, velocity: 0.55 },
        ],
      },
      {
        id: 'track-rhodes',
        name: 'SF2 Stage Rhodes Bell',
        instrument: 'rhodes',
        color: '#fbbf24', // Amber
        volume: 0.7,
        pan: -0.1,
        muted: false,
        solo: false,
        armed: false,
        effects: {
          ...DEFAULT_TRACK_EFFECTS,
          cutoff: 5500,
          reverbSend: 0.3,
          delaySend: 0.2,
          attack: 0.008,
          decay: 0.5,
          sustain: 0.6,
        },
        notes: [
          { id: 'r1', pitch: 65, time: 1.5, duration: 0.45, velocity: 0.75 },
          { id: 'r2', pitch: 69, time: 2.5, duration: 0.45, velocity: 0.8 },
          { id: 'r3', pitch: 72, time: 3.5, duration: 0.45, velocity: 0.7 },

          { id: 'r4', pitch: 65, time: 5.5, duration: 0.45, velocity: 0.75 },
          { id: 'r5', pitch: 69, time: 6.5, duration: 0.45, velocity: 0.8 },

          { id: 'r6', pitch: 67, time: 9.5, duration: 0.45, velocity: 0.75 },
          { id: 'r7', pitch: 72, time: 10.5, duration: 0.45, velocity: 0.8 },

          { id: 'r8', pitch: 65, time: 13.5, duration: 0.45, velocity: 0.75 },
          { id: 'r9', pitch: 67, time: 14.5, duration: 0.45, velocity: 0.8 },
        ],
      },
      {
        id: 'track-drums',
        name: 'AuraBeat 808 Unit',
        instrument: 'drums',
        color: '#ec4899', // Pink
        volume: 0.85,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        effects: {
          ...DEFAULT_TRACK_EFFECTS,
          cutoff: 14000,
          distortion: 0.05,
          delaySend: 0.05,
          reverbSend: 0.15,
        },
        notes: [
          // 4 bars of punchy 808 drums (16 beats)
          // Kicks (36)
          { id: 'dk1', pitch: 36, time: 0, duration: 0.25, velocity: 1.0 },
          { id: 'dk2', pitch: 36, time: 1.5, duration: 0.25, velocity: 0.85 },
          { id: 'dk3', pitch: 36, time: 2.0, duration: 0.25, velocity: 0.95 },
          { id: 'dk4', pitch: 36, time: 4.0, duration: 0.25, velocity: 1.0 },
          { id: 'dk5', pitch: 36, time: 6.0, duration: 0.25, velocity: 0.95 },
          { id: 'dk6', pitch: 36, time: 8.0, duration: 0.25, velocity: 1.0 },
          { id: 'dk7', pitch: 36, time: 9.5, duration: 0.25, velocity: 0.85 },
          { id: 'dk8', pitch: 36, time: 10.0, duration: 0.25, velocity: 0.95 },
          { id: 'dk9', pitch: 36, time: 12.0, duration: 0.25, velocity: 1.0 },
          { id: 'dk10', pitch: 36, time: 14.0, duration: 0.25, velocity: 0.95 },

          // Snares (38)
          { id: 'ds1', pitch: 38, time: 1.0, duration: 0.25, velocity: 0.9 },
          { id: 'ds2', pitch: 38, time: 3.0, duration: 0.25, velocity: 0.9 },
          { id: 'ds3', pitch: 38, time: 5.0, duration: 0.25, velocity: 0.9 },
          { id: 'ds4', pitch: 38, time: 7.0, duration: 0.25, velocity: 0.9 },
          { id: 'ds5', pitch: 38, time: 9.0, duration: 0.25, velocity: 0.9 },
          { id: 'ds6', pitch: 38, time: 11.0, duration: 0.25, velocity: 0.9 },
          { id: 'ds7', pitch: 38, time: 13.0, duration: 0.25, velocity: 0.9 },
          { id: 'ds8', pitch: 38, time: 15.0, duration: 0.25, velocity: 0.9 },

          // Hi-Hats (42) every 8th note
          ...Array.from({ length: 32 }).map((_, i) => ({
            id: `dh${i}`,
            pitch: 42,
            time: i * 0.5,
            duration: 0.15,
            velocity: i % 2 === 0 ? 0.75 : 0.5,
          })),
        ],
      },
    ],
  };
}
