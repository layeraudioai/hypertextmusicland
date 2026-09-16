import { Note, Track, InstrumentId } from '../types/daw';
import { MUSICAL_SCALES, ROOT_NOTES } from './constants';

export class MidiMuseEngine {
  // Quantize a pitch into a selected scale and root
  public static quantizeToScale(pitch: number, scaleName: string, rootNote: string): number {
    const scale = MUSICAL_SCALES[scaleName] || MUSICAL_SCALES['Natural Minor'];
    const rootIndex = ROOT_NOTES.indexOf(rootNote);
    const validPitchesInOctave = scale.intervals.map((i) => (rootIndex + i) % 12);

    const pitchClass = pitch % 12;
    if (validPitchesInOctave.includes(pitchClass)) {
      return pitch;
    }

    // Find closest pitch in scale
    let bestPitch = pitch;
    let minDiff = 999;
    for (let offset = -6; offset <= 6; offset++) {
      const candidate = pitch + offset;
      if (validPitchesInOctave.includes(candidate % 12)) {
        if (Math.abs(offset) < minDiff) {
          minDiff = Math.abs(offset);
          bestPitch = candidate;
        }
      }
    }
    return bestPitch;
  }

  // Generates Euclidean rhythm binary array: e.g. Euclidean(5, 16)
  public static euclideanRhythm(hits: number, steps: number): boolean[] {
    const pattern = new Array(steps).fill(false);
    if (hits <= 0) return pattern;
    if (hits >= steps) return new Array(steps).fill(true);

    let bucket = 0;
    for (let i = 0; i < steps; i++) {
      bucket += hits;
      if (bucket >= steps) {
        bucket -= steps;
        pattern[i] = true;
      }
    }
    return pattern;
  }

  // Triadex Muse Algorithmic Shift-Register Sequence
  public static generateMuseSequence(
    lengthBars: number,
    scaleName: string,
    rootNote: string,
    octave: number = 4,
    density: number = 0.75,
    style: 'arpeggio' | 'melody' | 'bass' | 'chords' = 'melody'
  ): Note[] {
    const totalBeats = lengthBars * 4;
    const notes: Note[] = [];
    const rootPitch = (octave + 1) * 12 + ROOT_NOTES.indexOf(rootNote);

    // Shift registers for algorithmic pseudo-random walk
    let regA = 0b10110010;
    let regB = 0b01101001;

    if (style === 'chords') {
      const chordRoots = [0, -4, -2, -5]; // i - VI - VII - v progression relative
      for (let bar = 0; bar < lengthBars; bar++) {
        const rootOffset = chordRoots[bar % chordRoots.length];
        const triadOffsets = [0, 3, 7]; // minor triad base
        triadOffsets.forEach((t) => {
          const rawPitch = rootPitch + rootOffset + t;
          const quantized = this.quantizeToScale(rawPitch, scaleName, rootNote);
          notes.push({
            id: `muse-chord-${bar}-${t}`,
            pitch: quantized,
            time: bar * 4,
            duration: 3.8,
            velocity: 0.7,
          });
        });
      }
      return notes;
    }

    if (style === 'bass') {
      const bassRoot = rootPitch - 24;
      const bassProgression = [0, -5, -2, -4];
      for (let beat = 0; beat < totalBeats; beat += 0.5) {
        const barIndex = Math.floor(beat / 4);
        const chordStep = bassProgression[barIndex % bassProgression.length];
        const isPulse = (beat % 1 === 0) || (Math.random() < 0.6);
        if (isPulse) {
          const octaveHop = beat % 2 === 0 ? 0 : 12;
          const rawPitch = bassRoot + chordStep + octaveHop;
          notes.push({
            id: `muse-bass-${beat}`,
            pitch: this.quantizeToScale(rawPitch, scaleName, rootNote),
            time: beat,
            duration: 0.45,
            velocity: beat % 1 === 0 ? 0.9 : 0.75,
          });
        }
      }
      return notes;
    }

    // Algorithmic Lead / Arp
    const stepSize = style === 'arpeggio' ? 0.25 : 0.5;
    for (let beat = 0; beat < totalBeats; beat += stepSize) {
      // Clock the shift register
      const bitA = (regA ^ (regA >> 2) ^ (regA >> 3)) & 1;
      regA = ((regA << 1) | bitA) & 0xff;
      const bitB = (regB ^ (regB >> 1) ^ (regB >> 4)) & 1;
      regB = ((regB << 1) | bitB) & 0xff;

      const probability = (regA & 0x0f) / 15;
      if (probability <= density) {
        const intervalJump = ((regB & 0x0f) % 14) - 4;
        const rawPitch = rootPitch + intervalJump;
        const quantized = this.quantizeToScale(rawPitch, scaleName, rootNote);
        notes.push({
          id: `muse-note-${beat}`,
          pitch: quantized,
          time: beat,
          duration: style === 'arpeggio' ? 0.22 : 0.45,
          velocity: 0.65 + ((regA & 0x07) / 7) * 0.3,
        });
      }
    }

    return notes;
  }

  // Generate Drums with Euclidean Rhythms
  public static generateEuclideanDrums(lengthBars: number): Note[] {
    const totalSteps = lengthBars * 16; // 16th notes
    const notes: Note[] = [];

    // Kick: 4 on the floor or syncopated
    const kickHits = lengthBars * 4;
    const kickPattern = this.euclideanRhythm(kickHits, totalSteps);

    // Snare: 2 and 4 (beats 1 and 3 in 0-indexed half-bars)
    const snareHits = lengthBars * 2;
    // Hi-Hat: 16th note Euclidean 11 hits per bar
    const hatPattern = this.euclideanRhythm(lengthBars * 11, totalSteps);

    for (let step = 0; step < totalSteps; step++) {
      const beat = step * 0.25;

      // Kick (Pitch 36)
      if (kickPattern[step] || (step % 4 === 0)) {
        notes.push({
          id: `drum-k-${step}`,
          pitch: 36,
          time: beat,
          duration: 0.25,
          velocity: step % 16 === 0 ? 1.0 : 0.85,
        });
      }

      // Snare (Pitch 38)
      if (step % 16 === 4 || step % 16 === 12) {
        notes.push({
          id: `drum-s-${step}`,
          pitch: 38,
          time: beat,
          duration: 0.25,
          velocity: 0.95,
        });
      }

      // Hi-Hat (Pitch 42)
      if (hatPattern[step]) {
        notes.push({
          id: `drum-h-${step}`,
          pitch: 42,
          time: beat,
          duration: 0.15,
          velocity: step % 2 === 0 ? 0.75 : 0.5,
        });
      }
    }

    return notes;
  }
}
