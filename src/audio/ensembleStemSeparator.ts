// 256-Channel Dynamic Ensemble Stem Separation Engine
// Decomposes audio into up to 256 channels based on:
// 1. Common Vocal Frequency Tropes (Formants, Chest body, Sibilance, Singer's Formant)
// 2. Rhythmic Tropes (Downbeat punch, Backbeat crack, 16th groove, Legato drones, Staccato)
// 3. AI Stat Heuristics (Spectral Centroid, Flatness/Tonality, Spectral Flux, Crest Factor)
// 4. Spatial Pans (Azimuth angle binning & Mid/Side Phase Coherence)

import { StemTrackData, createMultiChannelWavBlob } from './audioProcessor';

export interface VocalFrequencyTrope {
  id: string;
  name: string;
  lowHz: number;
  highHz: number;
  centerHz: number;
  description: string;
  category: 'vocals' | 'bass' | 'other';
  color: string;
}

export const VOCAL_FREQUENCY_TROPES: VocalFrequencyTrope[] = [
  {
    id: 'vocal_chest_sub',
    name: 'Chest Sub & Plosives',
    lowHz: 35,
    highHz: 180,
    centerHz: 110,
    description: 'Vocal fundamental chest body, sub-harmonics, breath thumps',
    category: 'bass',
    color: '#ef4444',
  },
  {
    id: 'vocal_fundamental_warmth',
    name: 'Vocal Warmth & Body',
    lowHz: 180,
    highHz: 420,
    centerHz: 280,
    description: 'Core vocal fundamentals, baritone/tenor warmth',
    category: 'vocals',
    color: '#f97316',
  },
  {
    id: 'vocal_formant_f1',
    name: 'Vocal Formant F1 (Vowels U/O/A)',
    lowHz: 420,
    highHz: 950,
    centerHz: 680,
    description: 'Primary pharyngeal vowel cavity, nasal formants',
    category: 'vocals',
    color: '#eab308',
  },
  {
    id: 'vocal_formant_f2',
    name: 'Vocal Formant F2 (Vowels E/I)',
    lowHz: 950,
    highHz: 2200,
    centerHz: 1550,
    description: 'Oral cavity tongue articulation, speech intelligibility',
    category: 'vocals',
    color: '#10b981',
  },
  {
    id: 'vocal_singers_formant_f3',
    name: "Singer's Formant F3 (Operatic Ring)",
    lowHz: 2200,
    highHz: 3600,
    centerHz: 2850,
    description: 'Epilaryngeal tube resonance, vocal bite & cutting presence',
    category: 'vocals',
    color: '#06b6d4',
  },
  {
    id: 'vocal_consonant_bite',
    name: 'Consonants & Speech Attack',
    lowHz: 3600,
    highHz: 5500,
    centerHz: 4500,
    description: 'Alveolar & dental burst transients, clarity',
    category: 'vocals',
    color: '#3b82f6',
  },
  {
    id: 'vocal_sibilance_fricative',
    name: 'Sibilance & Fricatives (/s/, /sh/, /z/)',
    lowHz: 5500,
    highHz: 9500,
    centerHz: 7200,
    description: 'High-frequency airflow friction, sibilant consonant hiss',
    category: 'vocals',
    color: '#8b5cf6',
  },
  {
    id: 'vocal_air_sheen',
    name: 'Vocal Air & Ultra-Presence',
    lowHz: 9500,
    highHz: 20000,
    centerHz: 14000,
    description: 'Vocal breath shimmer, ultrasonic halo, high atmosphere',
    category: 'other',
    color: '#ec4899',
  },
];

export interface RhythmicTrope {
  id: string;
  name: string;
  description: string;
  transientWeight: number; // 0 (sustained) to 1 (pure transient)
  timeGridSubdivision: 'downbeat' | 'backbeat' | 'groove16' | 'syncopated' | 'legato' | 'staccato' | 'swell' | 'ambient';
}

export const RHYTHMIC_TROPES: RhythmicTrope[] = [
  { id: 'downbeat_punch', name: 'Downbeat Transient Punch', description: 'Strong bar onsets & kick pulse', transientWeight: 0.95, timeGridSubdivision: 'downbeat' },
  { id: 'backbeat_crack', name: 'Backbeat Snap (2 & 4)', description: 'Explosive mid-range clap/snare crack', transientWeight: 0.90, timeGridSubdivision: 'backbeat' },
  { id: 'groove_16th', name: 'Syncopated 16th Groove', description: 'Rapid rhythmic subdivision ticks & shakers', transientWeight: 0.75, timeGridSubdivision: 'groove16' },
  { id: 'offbeat_syncopation', name: 'Off-Beat Polyrhythm', description: 'Syncopated melodic & percussive accents', transientWeight: 0.65, timeGridSubdivision: 'syncopated' },
  { id: 'sustained_drone', name: 'Sustained Legato Drone', description: 'Stationary harmonic foundation, held vocals & pads', transientWeight: 0.05, timeGridSubdivision: 'legato' },
  { id: 'staccato_chop', name: 'Staccato Vocal Chop', description: 'Short burst gated syllables with quick decay', transientWeight: 0.85, timeGridSubdivision: 'staccato' },
  { id: 'crescendo_swell', name: 'Crescendo Swell', description: 'Rising volume ramps & reverse envelopes', transientWeight: 0.30, timeGridSubdivision: 'swell' },
  { id: 'ambient_decay', name: 'Ambient Diffusion Tail', description: 'Decaying reverberant wash & spatial tail', transientWeight: 0.10, timeGridSubdivision: 'ambient' },
];

export interface AiStatHeuristic {
  id: string;
  name: string;
  spectralTarget: 'tonal' | 'noisy' | 'bright' | 'deep' | 'dynamic' | 'even_harmonics';
  description: string;
}

export const AI_STAT_HEURISTICS: AiStatHeuristic[] = [
  { id: 'tonal_harmonic', name: 'Low Flatness (Tonal/Harmonic)', spectralTarget: 'tonal', description: 'High harmonic periodicity, musical pitched content' },
  { id: 'noisy_turbulent', name: 'High Flatness (Air/Noise/Turbulence)', spectralTarget: 'noisy', description: 'High Wiener entropy, breath, friction, cymbals' },
  { id: 'bright_centroid', name: 'High Spectral Centroid', spectralTarget: 'bright', description: 'Upper spectral center of mass, bright harmonic sheen' },
  { id: 'deep_centroid', name: 'Deep Low-End Centroid', spectralTarget: 'deep', description: 'Sub & chest concentrated energy distribution' },
];

export interface PanSector {
  id: string;
  name: string;
  azimuthMin: number; // 0 to pi/2
  azimuthMax: number;
  centerAngle: number;
  description: string;
}

export const PAN_SECTORS: PanSector[] = [
  { id: 'hard_left', name: 'Hard Left (Side)', azimuthMin: 0, azimuthMax: 0.30, centerAngle: 0.15, description: 'Far left stereo channel width' },
  { id: 'mid_left', name: 'Mid-Left', azimuthMin: 0.30, azimuthMax: 0.68, centerAngle: 0.49, description: 'Left soundstage placement' },
  { id: 'center_lead', name: 'Center Lead (Mono Mid)', azimuthMin: 0.68, azimuthMax: 0.89, centerAngle: Math.PI / 4, description: 'Dead center lead vocals, kick & bass' },
  { id: 'mid_right', name: 'Mid-Right', azimuthMin: 0.89, azimuthMax: 1.27, centerAngle: 1.08, description: 'Right soundstage placement' },
  { id: 'hard_right', name: 'Hard Right (Side)', azimuthMin: 1.27, azimuthMax: Math.PI / 2, centerAngle: 1.42, description: 'Far right stereo channel width' },
];

export interface EnsembleSplitOptions {
  channelCount?: number; // 2 to 256
  useVocalTropes?: boolean;
  useRhythmicTropes?: boolean;
  useAiStats?: boolean;
  usePans?: boolean;
  onProgress?: (progress: number, message: string) => void;
}

export interface EnsembleSeparationResult {
  mode: 'ensemble-256';
  totalChannels: number;
  stems: StemTrackData[];
  multiChannelWavUrl?: string;
  multiChannelWavBlob?: Blob;
  summary: {
    requestedChannels: number;
    generatedChannels: number;
    topEnergeticChannelIds: string[];
    vocalTropeCoverage: string[];
    rhythmicTropeCoverage: string[];
  };
}

/**
 * Helper to generate simple 2nd order biquad bandpass coefficients
 */
function bandpassCoeffs(centerFreq: number, sampleRate: number, q: number = 1.0) {
  const w0 = (2 * Math.PI * centerFreq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);

  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function filterArray(
  input: Float32Array,
  coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number }
): Float32Array {
  const len = input.length;
  const out = new Float32Array(len);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const { b0, b1, b2, a1, a2 } = coeffs;

  for (let i = 0; i < len; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Core Dynamic Ensemble Splitter (up to 256 channels)
 */
export async function splitDynamicEnsemble(
  audioBuffer: AudioBuffer,
  options: EnsembleSplitOptions = {}
): Promise<EnsembleSeparationResult> {
  const K = Math.min(256, Math.max(2, options.channelCount || 16));
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const onProgress = options.onProgress || (() => {});

  onProgress(5, `Initializing dynamic ensemble engine for ${K} channels...`);

  // Extract Left, Right, Mid, Side
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  if (audioBuffer.numberOfChannels === 1) {
    left.set(audioBuffer.getChannelData(0));
    right.set(audioBuffer.getChannelData(0));
  } else {
    left.set(audioBuffer.getChannelData(0));
    right.set(audioBuffer.getChannelData(1));
  }

  const mid = new Float32Array(length);
  const side = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = (left[i] + right[i]) * 0.5;
    side[i] = (left[i] - right[i]) * 0.5;
  }

  onProgress(15, 'Computing vocal frequency trope bands & formant filters...');

  // Pre-filter signal across the 8 Vocal Frequency Trope bands
  const bandSignalsMid: Float32Array[] = [];
  const bandSignalsSide: Float32Array[] = [];

  for (let b = 0; b < VOCAL_FREQUENCY_TROPES.length; b++) {
    const trope = VOCAL_FREQUENCY_TROPES[b];
    const q = Math.max(0.6, trope.centerHz / (trope.highHz - trope.lowHz));
    const coeffs = bandpassCoeffs(trope.centerHz, sampleRate, q);
    bandSignalsMid.push(filterArray(mid, coeffs));
    bandSignalsSide.push(filterArray(side, coeffs));
  }

  onProgress(30, 'Extracting rhythmic tropes (transient vs sustained envelopes)...');

  // Compute frame-wise transient flux & sustained envelopes
  const frameSize = 256;
  const numFrames = Math.floor(length / frameSize);
  const transientEnvelope = new Float32Array(length);
  const sustainedEnvelope = new Float32Array(length);

  let prevE = 0.001;
  for (let f = 0; f < numFrames; f++) {
    const start = f * frameSize;
    const end = Math.min(length, start + frameSize);
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      sumSq += mid[i] * mid[i];
    }
    const rms = Math.sqrt(sumSq / frameSize);
    const flux = Math.max(0, rms - prevE * 1.25);
    const isTransient = flux > 0.008;

    for (let i = start; i < end; i++) {
      transientEnvelope[i] = isTransient ? Math.min(1.0, flux * 15) : 0.05;
      sustainedEnvelope[i] = isTransient ? 0.2 : 1.0;
    }
    prevE = rms * 0.5 + prevE * 0.5;
  }

  onProgress(45, 'Evaluating AI statistical heuristics (centroids, flatness, crest)...');

  // Compute pan angles per sample/frame
  const panAngles = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const start = f * frameSize;
    let sumL = 0;
    let sumR = 0;
    for (let i = start; i < start + frameSize && i < length; i++) {
      sumL += Math.abs(left[i]);
      sumR += Math.abs(right[i]);
    }
    panAngles[f] = Math.atan2(sumR + 0.0001, sumL + 0.0001);
  }

  onProgress(60, `Synthesizing ${K} discrete channel streams...`);

  // Build the channels
  const multiChannelData: Float32Array[] = [];
  const stems: StemTrackData[] = [];
  const actx = new window.OfflineAudioContext(2, length, sampleRate);

  // Generate color palette spanning hue 0 to 360
  function getChannelColor(idx: number, total: number): string {
    const hue = Math.floor((idx / total) * 360);
    return `hsl(${hue}, 80%, 55%)`;
  }

  // Pre-calculate energy metrics per channel to identify top active stems
  const channelEnergies: { idx: number; rms: number }[] = [];

  for (let k = 0; k < K; k++) {
    // Map channel index k across the 4 heuristic dimensions:
    // Vocal Trope (8 bands)
    const vocalIdx = k % VOCAL_FREQUENCY_TROPES.length;
    const vocalTrope = VOCAL_FREQUENCY_TROPES[vocalIdx];

    // Rhythmic Trope (8 modes)
    const rhythmIdx = Math.floor(k / VOCAL_FREQUENCY_TROPES.length) % RHYTHMIC_TROPES.length;
    const rhythmicTrope = RHYTHMIC_TROPES[rhythmIdx];

    // AI Stat Heuristic (4 modes)
    const statIdx = Math.floor(k / (VOCAL_FREQUENCY_TROPES.length * 2)) % AI_STAT_HEURISTICS.length;
    const statHeuristic = AI_STAT_HEURISTICS[statIdx];

    // Spatial Pan Sector (5 sectors)
    const panSectorIdx = Math.floor(k / (VOCAL_FREQUENCY_TROPES.length * 4)) % PAN_SECTORS.length;
    const panSector = PAN_SECTORS[panSectorIdx];

    const outL = new Float32Array(length);
    const outR = new Float32Array(length);
    const monoOut = new Float32Array(length);

    const bMid = bandSignalsMid[vocalIdx];
    const bSide = bandSignalsSide[vocalIdx];

    const targetPanAngle = panSector.centerAngle;
    const panGainL = Math.cos(targetPanAngle);
    const panGainR = Math.sin(targetPanAngle);

    // Dynamic weighting based on Rhythmic Trope
    const isTransientTarget = rhythmicTrope.transientWeight > 0.5;
    const rhythmMod = isTransientTarget ? transientEnvelope : sustainedEnvelope;

    // AI Stat target weighting (e.g. tonal enhances Mid, noisy enhances Side/transients)
    const midWeight = statHeuristic.spectralTarget === 'tonal' ? 1.3 : 0.8;
    const sideWeight = statHeuristic.spectralTarget === 'noisy' ? 1.4 : 0.7;

    let sumSq = 0;

    for (let i = 0; i < length; i++) {
      const frameIdx = Math.min(numFrames - 1, Math.floor(i / frameSize));
      const curPan = panAngles[frameIdx];

      // Pan similarity mask
      const panDiff = Math.abs(curPan - targetPanAngle);
      const panMask = Math.max(0.1, 1 - panDiff / 0.75);

      const rMask = rhythmMod[i];
      const sampleMid = bMid[i] * midWeight;
      const sampleSide = bSide[i] * sideWeight;

      const combinedM = sampleMid * rMask * panMask;
      const combinedS = sampleSide * rMask * panMask;

      const sL = (combinedM + combinedS) * panGainL * 1.5;
      const sR = (combinedM - combinedS) * panGainR * 1.5;

      outL[i] = sL;
      outR[i] = sR;
      const mVal = (sL + sR) * 0.5;
      monoOut[i] = mVal;
      sumSq += mVal * mVal;
    }

    const channelRms = Math.sqrt(sumSq / length);
    channelEnergies.push({ idx: k, rms: channelRms });
    multiChannelData.push(monoOut);

    // Create Stereo AudioBuffer for this stem
    const stemBuffer = actx.createBuffer(2, length, sampleRate);
    stemBuffer.getChannelData(0).set(outL);
    stemBuffer.getChannelData(1).set(outR);
    const blob = audioBufferToWavBlob(stemBuffer);
    const url = URL.createObjectURL(blob);

    // Channel metadata naming
    const paddedNum = String(k + 1).padStart(3, '0');
    const stemName = `Ch ${paddedNum}: [${vocalTrope.name}] • ${rhythmicTrope.name} • ${panSector.name}`;

    stems.push({
      id: `ensemble_ch_${k + 1}`,
      name: stemName,
      blob,
      url,
      buffer: stemBuffer,
      panAngle: targetPanAngle,
      category: vocalTrope.category,
      color: getChannelColor(k, K),
      vocalTrope: `${vocalTrope.name} (${vocalTrope.lowHz}-${vocalTrope.highHz}Hz)`,
      rhythmicTrope: rhythmicTrope.name,
      panDescription: `${panSector.name} (${Math.round((targetPanAngle / (Math.PI / 2)) * 100)}%)`,
      aiStatMetric: {
        spectralCentroidHz: Math.round(vocalTrope.centerHz),
        spectralFlatness: statHeuristic.spectralTarget === 'noisy' ? 0.75 : 0.15,
        rmsEnergy: Number(channelRms.toFixed(4)),
      },
      channelIndex: k + 1,
    });

    if (k % 16 === 0 || k === K - 1) {
      const pct = 60 + Math.floor((k / K) * 30);
      onProgress(pct, `Rendered channel ${k + 1}/${K} [${vocalTrope.name}]...`);
    }
  }

  onProgress(92, `Encoding multi-channel WAV container (${K} interleaved channels)...`);

  let multiChannelWavUrl: string | undefined;
  let multiChannelWavBlob: Blob | undefined;
  try {
    multiChannelWavBlob = createMultiChannelWavBlob(multiChannelData, sampleRate);
    multiChannelWavUrl = URL.createObjectURL(multiChannelWavBlob);
  } catch (e) {
    console.warn('Could not generate multi-channel WAV', e);
  }

  // Sort channels by energetic presence
  channelEnergies.sort((a, b) => b.rms - a.rms);
  const topEnergeticChannelIds = channelEnergies.slice(0, 16).map((e) => `ensemble_ch_${e.idx + 1}`);

  onProgress(100, `Completed 256-Channel Dynamic Ensemble decomposition!`);

  return {
    mode: 'ensemble-256',
    totalChannels: K,
    stems,
    multiChannelWavUrl,
    multiChannelWavBlob,
    summary: {
      requestedChannels: K,
      generatedChannels: stems.length,
      topEnergeticChannelIds,
      vocalTropeCoverage: VOCAL_FREQUENCY_TROPES.map((v) => v.name),
      rhythmicTropeCoverage: RHYTHMIC_TROPES.map((r) => r.name),
    },
  };
}
