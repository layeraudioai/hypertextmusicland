export type InstrumentId =
  | 'grand_piano'
  | 'rhodes'
  | 'synth_lead'
  | 'analog_bass'
  | 'ambient_pad'
  | 'chiptune'
  | 'drums'
  | (string & {});

export interface CustomSf2Instrument {
  id: string;
  name: string;
  rootPitch: number; // e.g. 60 (C4)
  sampleRate: number;
  duration: number;
  audioBuffer?: AudioBuffer;
  sf2Blob?: Blob;
  loopStart?: number;
  loopEnd?: number;
}

export interface Note {
  id: string;
  pitch: number; // MIDI note number 0-127 (e.g. 60 = C4)
  time: number; // In beats (1 beat = quarter note)
  duration: number; // In beats
  velocity: number; // 0 to 1
  selected?: boolean;
}

export interface TrackEffects {
  cutoff: number; // 20 - 20000 Hz
  resonance: number; // 0.1 - 20
  distortion: number; // 0 - 1
  delaySend: number; // 0 - 1
  delayTime: number; // 0.1 - 1.0 s
  reverbSend: number; // 0 - 1
  attack: number; // 0.001 - 2 s
  decay: number; // 0.05 - 2 s
  sustain: number; // 0 - 1
  release: number; // 0.05 - 4 s
}

export interface Track {
  id: string;
  name: string;
  instrument: InstrumentId;
  color: string;
  volume: number; // 0 to 1.25
  pan: number; // -1 (left) to 1 (right)
  muted: boolean;
  solo: boolean;
  armed: boolean;
  notes: Note[];
  effects: TrackEffects;
}

export type VisualTheme =
  | 'neon-aura'
  | 'cyber-grid'
  | 'particle-vortex'
  | 'nebula-bloom'
  | 'retro-vhs'
  | 'kaleidoscope';

export interface VisionFlowConfig {
  theme: VisualTheme;
  bloom: number; // 0 - 1
  reactivity: number; // 0.5 - 2.5
  flowSpeed: number; // 0.2 - 3.0
  particleCount: number; // 50 - 500
  showPianoWaterfall: boolean;
  showWaveform: boolean;
  showSpectrogram: boolean;
  showTextOverlay: boolean;
  titleText: string;
  aspectRatio: '16:9' | '1:1' | '9:16';
}

export interface ProjectState {
  id: string;
  title: string;
  bpm: number;
  timeSignature: [number, number]; // [4, 4]
  totalBars: number;
  tracks: Track[];
  selectedTrackId: string;
  masterVolume: number;
  masterLimiter: boolean;
  visionFlow: VisionFlowConfig;
}

export interface ScaleDefinition {
  name: string;
  intervals: number[]; // relative semitones from root
}

export interface SoundFontPreset {
  id: InstrumentId;
  name: string;
  category: 'Keyboards' | 'Synths' | 'Bass' | 'Pads' | 'Retro' | 'Percussion';
  sf2PatchNumber: number;
  description: string;
  defaultColor: string;
}
