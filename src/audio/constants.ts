import { SoundFontPreset, ScaleDefinition, TrackEffects } from '../types/daw';

export const SOUNDFONT_PRESETS: SoundFontPreset[] = [
  {
    id: 'grand_piano',
    name: 'SF2 Concert Grand Piano',
    category: 'Keyboards',
    sf2PatchNumber: 0,
    description: 'Acoustic multi-harmonic Steinway model with hammer strike and warm resonance.',
    defaultColor: '#38bdf8', // Sky
  },
  {
    id: 'rhodes',
    name: 'SF2 Vintage Stage Rhodes',
    category: 'Keyboards',
    sf2PatchNumber: 4,
    description: 'Electric piano with magnetic tine bell harmonics and subtle stereo tremolo.',
    defaultColor: '#fbbf24', // Amber
  },
  {
    id: 'synth_lead',
    name: '66GHz Cyber Saw Lead',
    category: 'Synths',
    sf2PatchNumber: 80,
    description: 'Dual detuned sawtooth oscillators with resonant Moog-style 24dB ladder filter.',
    defaultColor: '#f43f5e', // Rose
  },
  {
    id: 'analog_bass',
    name: 'Aura Sub & 808 Bass',
    category: 'Bass',
    sf2PatchNumber: 38,
    description: 'Deep analog sub-bass with fast transient pitch-envelope and saturated harmonics.',
    defaultColor: '#a855f7', // Purple
  },
  {
    id: 'ambient_pad',
    name: 'VisionFlow Shimmer Pad',
    category: 'Pads',
    sf2PatchNumber: 88,
    description: 'Lush atmospheric evolving pad with chorused unison and celestial shimmer.',
    defaultColor: '#34d399', // Emerald
  },
  {
    id: 'chiptune',
    name: 'SonicRNG 8-Bit Chiptune',
    category: 'Retro',
    sf2PatchNumber: 81,
    description: 'Authentic pulse/square wave retro arcade sound with snappy arpeggio response.',
    defaultColor: '#fb923c', // Orange
  },
  {
    id: 'drums',
    name: 'AuraBeat 808/909 Drum Lab',
    category: 'Percussion',
    sf2PatchNumber: 128,
    description: 'Synthesized percussion with punchy sub kicks, crisp snares, metallic hats, and claps.',
    defaultColor: '#ec4899', // Pink
  },
];

export const MUSICAL_SCALES: Record<string, ScaleDefinition> = {
  'Natural Minor': { name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  'Major': { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  'Dorian (Synthwave)': { name: 'Dorian (Synthwave)', intervals: [0, 2, 3, 5, 7, 9, 10] },
  'Phrygian (Cyberpunk)': { name: 'Phrygian (Cyberpunk)', intervals: [0, 1, 3, 5, 7, 8, 10] },
  'Lydian (Dreamy)': { name: 'Lydian (Dreamy)', intervals: [0, 2, 4, 6, 7, 9, 11] },
  'Pentatonic Minor': { name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10] },
  'Pentatonic Major': { name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9] },
  'Blues Scale': { name: 'Blues Scale', intervals: [0, 3, 5, 6, 7, 10] },
  'Japanese Hirajoshi': { name: 'Japanese Hirajoshi', intervals: [0, 2, 3, 7, 8] },
  'Harmonic Minor': { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
};

export const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const DEFAULT_TRACK_EFFECTS: TrackEffects = {
  cutoff: 8000,
  resonance: 2.0,
  distortion: 0.0,
  delaySend: 0.25,
  delayTime: 0.35,
  reverbSend: 0.3,
  attack: 0.01,
  decay: 0.3,
  sustain: 0.7,
  release: 0.4,
};

export const PITCH_CLASS_COLORS = [
  '#ef4444', // C - Red
  '#f97316', // C# - Red-Orange
  '#f59e0b', // D - Orange
  '#eab308', // D# - Amber
  '#84cc16', // E - Lime
  '#10b981', // F - Emerald
  '#06b6d4', // F# - Cyan
  '#0ea5e9', // G - Sky
  '#3b82f6', // G# - Blue
  '#6366f1', // A - Indigo
  '#8b5cf6', // A# - Violet
  '#d946ef', // B - Fuchsia
];

export function getNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const noteIndex = pitch % 12;
  return `${ROOT_NOTES[noteIndex]}${octave}`;
}

export function getPitchColor(pitch: number): string {
  return PITCH_CLASS_COLORS[pitch % 12];
}
