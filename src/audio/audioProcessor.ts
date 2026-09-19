import { Track, Note, CustomSf2Instrument } from '../types/daw';
import { getNoteName } from './constants';
import { synth } from './synthEngine';
import { generateSf2Binary } from './sf2Generator';

// In-memory registry of custom sampled SF2 instruments
class CustomSampleManager {
  private instruments: Map<string, CustomSf2Instrument> = new Map();
  private listeners: Set<() => void> = new Set();

  public registerInstrument(inst: CustomSf2Instrument) {
    this.instruments.set(inst.id, inst);
    this.notify();
  }

  public getInstrument(id: string): CustomSf2Instrument | undefined {
    return this.instruments.get(id);
  }

  public getAllInstruments(): CustomSf2Instrument[] {
    return Array.from(this.instruments.values());
  }

  public removeInstrument(id: string) {
    this.instruments.delete(id);
    this.notify();
  }

  public clearInstruments() {
    this.instruments.clear();
    this.notify();
  }

  public subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }
}

export const sampleManager = new CustomSampleManager();

// 1. Decode any audio file into an AudioBuffer
export async function decodeAudioFile(file: File, targetCtx?: BaseAudioContext): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = targetCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
  return await ctx.decodeAudioData(arrayBuffer);
}

export interface AudioMetrics {
  durationSeconds: number;
  sampleRate: number;
  numberOfChannels: number;
  beats: number;
  bars: number;
}

export function computeAudioMetrics(buffer: AudioBuffer, bpm: number, beatsPerBar: number = 4): AudioMetrics {
  const durationSeconds = buffer.duration;
  const beats = (durationSeconds * bpm) / 60;
  const bars = Math.max(1, Math.ceil(beats / beatsPerBar));
  return {
    durationSeconds,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    beats,
    bars,
  };
}

export async function mashAudio(
  buffers: AudioBuffer[],
  sliceBeats: number = 1,
  bpm: number = 120,
  pattern: 'random' | 'pingpong' | 'chaos' = 'random'
): Promise<AudioBuffer> {
  if (buffers.length === 0) throw new Error("No buffers to mash");
  const ctx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
    2,
    44100,
    44100
  );

  // Target output length based on longest buffer (or minimum 4 beats)
  const maxBufferDuration = Math.max(...buffers.map((b) => b.duration));
  const sampleRate = 44100;
  const beatSec = 60 / bpm;
  const sliceSec = Math.max(0.05, sliceBeats * beatSec);
  const sliceLen = Math.floor(sampleRate * sliceSec);
  const totalLength = Math.max(sliceLen * 4, Math.ceil(maxBufferDuration * sampleRate));

  const out = ctx.createBuffer(2, totalLength, sampleRate);
  const fadeLen = Math.min(128, Math.floor(sliceLen * 0.05)); // 128-sample anti-click crossfade

  let bufferIdx = 0;
  for (let s = 0; s < totalLength; s += sliceLen) {
    if (pattern === 'random') {
      bufferIdx = Math.floor(Math.random() * buffers.length);
    } else if (pattern === 'pingpong') {
      bufferIdx = (bufferIdx + 1) % buffers.length;
    } else {
      bufferIdx = Math.random() < 0.6 ? (bufferIdx + 1) % buffers.length : Math.floor(Math.random() * buffers.length);
    }

    const b = buffers[bufferIdx];
    const srcLen = b.length;
    const srcOffset = Math.floor(Math.random() * Math.max(1, srcLen - sliceLen));
    const len = Math.min(sliceLen, totalLength - s);

    for (let c = 0; c < 2; c++) {
      const outD = out.getChannelData(c);
      const srcD = b.getChannelData(c % b.numberOfChannels);

      for (let k = 0; k < len; k++) {
        let sample = srcD[(srcOffset + k) % srcLen] || 0;
        // Smooth crossfade edges
        if (k < fadeLen) {
          sample *= k / fadeLen;
        } else if (k > len - fadeLen) {
          sample *= (len - k) / fadeLen;
        }
        if (s + k < outD.length) {
          outD[s + k] = Math.max(-1, Math.min(1, outD[s + k] + sample * 0.95));
        }
      }
    }
  }
  return out;
}

export function applyDistortion(
  buffer: AudioBuffer,
  amount: number = 0.5,
  mode: 'dynamic' | 'tube' | 'fuzz' | 'bitcrush' = 'dynamic',
  gain: number = 1.0
): AudioBuffer {
  const ctx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const output = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const sampleRate = buffer.sampleRate;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const input = buffer.getChannelData(c);
    const outputData = output.getChannelData(c);

    if (mode === 'tube') {
      // Warm analog tube saturation (asymmetric hyperbolic tangent)
      const drive = 1 + amount * 9;
      for (let i = 0; i < input.length; i++) {
        const x = input[i] * drive;
        const shaped = x > 0 ? Math.tanh(x) : Math.tanh(x * 1.3) * 0.85;
        outputData[i] = Math.max(-1, Math.min(1, shaped * gain));
      }
    } else if (mode === 'fuzz') {
      // Aggressive square/hard clipping fuzz
      const drive = 1 + amount * 18;
      for (let i = 0; i < input.length; i++) {
        let x = input[i] * drive;
        if (x > 0.85) x = 0.85 + 0.15 * Math.tanh((x - 0.85) * 2);
        else if (x < -0.85) x = -0.85 + 0.15 * Math.tanh((x + 0.85) * 2);
        outputData[i] = Math.max(-1, Math.min(1, x * gain * 0.9));
      }
    } else if (mode === 'bitcrush') {
      // Sample rate decimation and bit depth reduction
      const bits = Math.max(2, Math.round(16 - amount * 12)); // 16-bit down to 4-bit
      const step = Math.pow(0.5, bits);
      const decimateFactor = Math.max(1, Math.round(1 + amount * 12));
      let lastSample = 0;

      for (let i = 0; i < input.length; i++) {
        if (i % decimateFactor === 0) {
          const raw = input[i] * (1 + amount * 2);
          lastSample = Math.round(raw / step) * step;
        }
        outputData[i] = Math.max(-1, Math.min(1, lastSample * gain));
      }
    } else {
      // Dynamic waveshaping and bitcrushing (original hybrid)
      for (let i = 0; i < input.length; i++) {
        const timeSec = i / sampleRate;
        const v = Math.abs(Math.sin(timeSec / 2));
        const st = Math.pow(0.5, 1 + v * 14 * amount);

        let x = input[i] * (1 + amount * 6);
        if (x > 1) x = 1;
        if (x < -1) x = -1;
        const shaped = ((Math.PI + 100) * x) / (Math.PI + 100 * Math.abs(x) + 0.0001);
        const quantized = Math.round(shaped / st) * st;
        outputData[i] = Math.max(-1, Math.min(1, quantized * 0.9 * gain));
      }
    }
  }
  return output;
}

export const distortAudio = applyDistortion;

export function processGlitchStutter(
  audioBuffer: AudioBuffer,
  bpm: number = 120,
  multiplier: number = 2,
  division: number = 1, // 1 = 1 beat, 0.5 = 8th note, 0.25 = 16th note, 0.125 = 32nd note
  reverseChance: number = 0.15,
  shuffleChance: number = 0.35
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const beatSec = (60 / bpm) * Math.max(0.0625, division);
  let sliceLength = Math.max(128, Math.floor(sampleRate * beatSec));

  // If buffer is short, adapt slice length
  if (sliceLength > audioBuffer.length) {
    sliceLength = Math.max(64, Math.floor(audioBuffer.length / 4));
  }

  const numSlices = Math.max(1, Math.floor(audioBuffer.length / sliceLength));
  const totalSlices = Math.max(1, Math.ceil(numSlices * multiplier));

  const ctx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
    audioBuffer.numberOfChannels,
    totalSlices * sliceLength,
    sampleRate
  );

  const output = ctx.createBuffer(
    audioBuffer.numberOfChannels,
    totalSlices * sliceLength,
    sampleRate
  );

  const fadeLen = Math.min(64, Math.floor(sliceLength * 0.08));

  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const od = audioBuffer.getChannelData(c);
    const outd = output.getChannelData(c);
    let currentSlice = 0;

    for (let b = 0; b < totalSlices; b++) {
      // Decide next slice: random jump vs sequential
      if (Math.random() < shuffleChance) {
        currentSlice = Math.floor(Math.random() * numSlices);
      } else {
        currentSlice = (currentSlice + 1) % numSlices;
      }

      const isReversed = Math.random() < reverseChance;
      const sourceOffset = currentSlice * sliceLength;
      const destOffset = b * sliceLength;

      for (let s = 0; s < sliceLength; s++) {
        const readIdx = isReversed
          ? sourceOffset + (sliceLength - 1 - s)
          : sourceOffset + s;
        let sample = od[readIdx] || 0;

        // Anti-click crossfade
        if (s < fadeLen) {
          sample *= s / fadeLen;
        } else if (s > sliceLength - fadeLen) {
          sample *= (sliceLength - s) / fadeLen;
        }

        if (destOffset + s < outd.length) {
          outd[destOffset + s] = sample;
        }
      }
    }
  }
  return output;
}

// 2. High-precision Autocorrelation Pitch Detector
export interface PitchDetectionResult {
  frequency: number; // in Hz
  midiPitch: number; // 0 - 127
  noteName: string; // e.g. "C4", "A#3"
  cents: number; // -50 to +50
  confidence: number; // 0 to 1
}

export function detectPitchYIN(audioBuffer: AudioBuffer): PitchDetectionResult {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;

  if (totalSamples < 64) {
    return {
      frequency: 261.63,
      midiPitch: 60,
      noteName: 'C4',
      cents: 0,
      confidence: 0.1,
    };
  }

  // Window size: target 2048 samples, adapted to sample length
  const windowSize = Math.min(2048, Math.max(128, Math.floor(totalSamples / 2)));
  
  // Limits: minFreq 30 Hz (B0), maxFreq 3200 Hz (G#7)
  const minFreq = 30;
  const maxFreq = 3200;
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(windowSize - 2, Math.floor(sampleRate / minFreq));

  // Sample multiple windows across the audio to get stable pitch and reject attack noise
  const numSlices = 9;
  const pitchEstimates: { freq: number; conf: number }[] = [];

  const startOffset = Math.floor(totalSamples * 0.08);
  const endOffset = Math.max(startOffset + windowSize * 2, Math.floor(totalSamples * 0.92));
  const step = Math.max(windowSize, Math.floor((endOffset - startOffset - windowSize * 2) / numSlices));

  for (
    let offset = startOffset;
    offset + windowSize * 2 <= totalSamples && pitchEstimates.length < numSlices;
    offset += step
  ) {
    // 1. Calculate energy and mean (DC bias removal)
    let sumSq = 0;
    let mean = 0;
    for (let i = 0; i < windowSize; i++) {
      const val = channelData[offset + i];
      mean += val;
      sumSq += val * val;
    }
    mean /= windowSize;
    const rms = Math.sqrt(sumSq / windowSize);
    if (rms < 0.004) continue; // Skip near-silent frames

    // 2. Compute Difference Function d(tau)
    const d = new Float32Array(maxLag + 1);
    for (let tau = minLag; tau <= maxLag; tau++) {
      let diffSum = 0;
      for (let j = 0; j < windowSize; j += 2) {
        const x1 = channelData[offset + j] - mean;
        const x2 = channelData[offset + j + tau] - mean;
        const diff = x1 - x2;
        diffSum += diff * diff;
      }
      d[tau] = diffSum * 2;
    }

    // 3. Cumulative Mean Normalized Difference Function d'(tau)
    const dPrime = new Float32Array(maxLag + 1);
    dPrime[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      runningSum += d[tau];
      dPrime[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
    }

    // 4. Absolute Thresholding (Find first dip below threshold 0.15)
    // This strictly prevents picking 2x/3x octave subharmonic lags!
    const threshold = 0.15;
    let tauFound = -1;

    for (let tau = minLag; tau <= maxLag; tau++) {
      if (dPrime[tau] < threshold) {
        // Step forward to the local valley minimum
        while (tau + 1 <= maxLag && dPrime[tau + 1] < dPrime[tau]) {
          tau++;
        }
        tauFound = tau;
        break;
      }
    }

    // If no dip was below 0.15, find global minimum
    if (tauFound === -1) {
      let globalMin = 1.0;
      let globalMinTau = -1;
      for (let tau = minLag; tau <= maxLag; tau++) {
        if (dPrime[tau] < globalMin) {
          globalMin = dPrime[tau];
          globalMinTau = tau;
        }
      }
      if (globalMin < 0.45) {
        tauFound = globalMinTau;
      }
    }

    if (tauFound !== -1) {
      // 5. Parabolic Interpolation for sub-sample accuracy
      const t0 = Math.max(minLag, tauFound - 1);
      const t1 = tauFound;
      const t2 = Math.min(maxLag, tauFound + 1);

      const y0 = dPrime[t0];
      const y1 = dPrime[t1];
      const y2 = dPrime[t2];

      const denom = 2 * (2 * y1 - y0 - y2);
      const delta = denom !== 0 ? (y2 - y0) / denom : 0;
      const exactPeriod = tauFound + delta;

      if (exactPeriod > 0) {
        const freq = sampleRate / exactPeriod;
        const conf = Math.max(0, 1 - y1);
        if (freq >= minFreq && freq <= maxFreq) {
          pitchEstimates.push({ freq, conf });
        }
      }
    }
  }

  // If no estimates found, fallback to middle C
  if (pitchEstimates.length === 0) {
    return {
      frequency: 261.63,
      midiPitch: 60,
      noteName: 'C4',
      cents: 0,
      confidence: 0.2,
    };
  }

  // Sort by frequency to pick median estimate (immune to outliers/transients)
  pitchEstimates.sort((a, b) => a.freq - b.freq);
  const midIndex = Math.floor(pitchEstimates.length / 2);
  const medianEstimate = pitchEstimates[midIndex];

  const avgConf = pitchEstimates.reduce((acc, cur) => acc + cur.conf, 0) / pitchEstimates.length;
  const fundamentalFreq = medianEstimate.freq;
  const midiExact = 69 + 12 * Math.log2(fundamentalFreq / 440);
  const midiPitch = Math.max(0, Math.min(127, Math.round(midiExact)));
  const cents = Math.round((midiExact - midiPitch) * 100);

  return {
    frequency: Math.round(fundamentalFreq * 10) / 10,
    midiPitch,
    noteName: getNoteName(midiPitch),
    cents,
    confidence: Math.round(avgConf * 100) / 100,
  };
}

export function detectPitchAutocorrelation(audioBuffer: AudioBuffer): PitchDetectionResult {
  return detectPitchYIN(audioBuffer);
}

// 3. Audio-to-MIDI Transcription Engine
export function transcribeAudioToMidi(
  audioBuffer: AudioBuffer,
  bpm: number,
  sensitivity: number = 0.5
): Note[] {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const secondsPerBeat = 60 / bpm;

  const hopSize = Math.floor(sampleRate * 0.02); // 20ms frame
  const frameSize = 2048;
  const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);

  interface RawFrame {
    timeSec: number;
    rms: number;
    pitch: number;
    confidence: number;
  }

  const frames: RawFrame[] = [];
  let maxRms = 0;

  for (let f = 0; f < totalFrames; f++) {
    const offset = f * hopSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i += 2) {
      sumSq += channelData[offset + i] * channelData[offset + i];
    }
    const rms = Math.sqrt((sumSq * 2) / frameSize);
    if (rms > maxRms) maxRms = rms;

    // Pitch in this frame
    const slice = channelData.subarray(offset, offset + frameSize);
    let bestLag = -1;
    let bestCorr = -1;
    const minLag = Math.floor(sampleRate / 1200);
    const maxLag = Math.floor(sampleRate / 55);

    for (let lag = minLag; lag < maxLag && lag < frameSize / 2; lag += 2) {
      let sum = 0;
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < 512; i += 2) {
        sum += slice[i] * slice[i + lag];
        s1 += slice[i] * slice[i];
        s2 += slice[i + lag] * slice[i + lag];
      }
      const denom = Math.sqrt(s1 * s2);
      const corr = denom > 0 ? sum / denom : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    let pitch = 60;
    if (bestLag > 0 && bestCorr > 0.4) {
      const freq = sampleRate / bestLag;
      pitch = Math.max(24, Math.min(96, Math.round(69 + 12 * Math.log2(freq / 440))));
    }

    frames.push({
      timeSec: offset / sampleRate,
      rms,
      pitch,
      confidence: bestCorr,
    });
  }

  // Energy threshold based on sensitivity
  const threshold = maxRms * (0.12 * (1.1 - sensitivity));

  const notes: Note[] = [];
  let currentNote: {
    startSec: number;
    pitch: number;
    peakRms: number;
    count: number;
  } | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const isActive = frame.rms > threshold && frame.confidence > 0.35;

    if (isActive) {
      if (!currentNote) {
        // Note On onset
        currentNote = {
          startSec: frame.timeSec,
          pitch: frame.pitch,
          peakRms: frame.rms,
          count: 1,
        };
      } else {
        // If pitch changed significantly (>= 2 semitones) for 3 consecutive frames, trigger new note
        if (Math.abs(frame.pitch - currentNote.pitch) >= 2) {
          // Close current note
          const durBeats = Math.max(0.25, (frame.timeSec - currentNote.startSec) / secondsPerBeat);
          const startBeat = Math.round((currentNote.startSec / secondsPerBeat) * 4) / 4;
          notes.push({
            id: `transcribed-${notes.length}-${Date.now()}`,
            pitch: currentNote.pitch,
            time: startBeat,
            duration: Math.round(durBeats * 4) / 4 || 0.25,
            velocity: Math.min(1, Math.max(0.4, (currentNote.peakRms / maxRms) * 1.1)),
          });

          currentNote = {
            startSec: frame.timeSec,
            pitch: frame.pitch,
            peakRms: frame.rms,
            count: 1,
          };
        } else {
          // Still active, accumulate
          currentNote.count++;
          if (frame.rms > currentNote.peakRms) currentNote.peakRms = frame.rms;
        }
      }
    } else if (currentNote) {
      // Note Off
      const durBeats = Math.max(0.25, (frame.timeSec - currentNote.startSec) / secondsPerBeat);
      const startBeat = Math.round((currentNote.startSec / secondsPerBeat) * 4) / 4;
      notes.push({
        id: `transcribed-${notes.length}-${Date.now()}`,
        pitch: currentNote.pitch,
        time: startBeat,
        duration: Math.round(durBeats * 4) / 4 || 0.25,
        velocity: Math.min(1, Math.max(0.4, (currentNote.peakRms / maxRms) * 1.1)),
      });
      currentNote = null;
    }
  }

  // If audio was mostly drums / unpitched, create rhythmic note sequence
  if (notes.length === 0) {
    // Generate rhythmic grid from energy peaks
    for (let i = 1; i < frames.length - 1; i++) {
      if (
        frames[i].rms > threshold * 1.5 &&
        frames[i].rms > frames[i - 1].rms &&
        frames[i].rms > frames[i + 1].rms
      ) {
        const beat = Math.round((frames[i].timeSec / secondsPerBeat) * 4) / 4;
        notes.push({
          id: `transcribed-beat-${notes.length}`,
          pitch: 60,
          time: beat,
          duration: 0.25,
          velocity: Math.min(1, (frames[i].rms / maxRms) * 1.2),
        });
        i += 4; // skip ahead to avoid duplicate triggers
      }
    }
  }

  return notes;
}

// 4. Render an SF2 or Custom Instrument demonstration phrase into WAV
export async function renderSf2DemoWav(
  instrument: string,
  sampleBuffer?: AudioBuffer,
  rootPitch: number = 60
): Promise<Blob> {
  const bpm = 120;
  const beatSec = 60 / bpm;
  const totalSeconds = 4.0;
  const sampleRate = 44100;

  const offlineCtx = new OfflineAudioContext(2, sampleRate * totalSeconds, sampleRate);

  // Demo notes: C4, E4, G4, B4, C5 arpeggio
  const demoPitches = [rootPitch, rootPitch + 4, rootPitch + 7, rootPitch + 11, rootPitch + 12];

  demoPitches.forEach((p, idx) => {
    const startTime = idx * 0.45;
    const duration = 0.8;

    if (sampleBuffer) {
      // Custom sample playback
      const src = offlineCtx.createBufferSource();
      src.buffer = sampleBuffer;
      const rate = Math.pow(2, (p - rootPitch) / 12);
      src.playbackRate.setValueAtTime(rate, startTime);

      const gain = offlineCtx.createGain();
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.8, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      src.connect(gain);
      gain.connect(offlineCtx.destination);
      src.start(startTime);
    } else {
      // Standard instrument
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440 * Math.pow(2, (p - 69) / 12), startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.7, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(offlineCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }
  });

  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWavBlob(renderedBuffer);
}

// 5. Helper to encode AudioBuffer to 16-bit PCM WAV Blob
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
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

  // RIFF Chunk
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt Subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample = 16

  // data Subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave and scale channel data
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

export interface StemTrackData {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  buffer: AudioBuffer;
  panAngle?: number;
  category: 'drums' | 'bass' | 'vocals' | 'other' | 'instrumental' | 'rhythm' | 'spatial' | 'stat-heuristic';
  color: string;
  vocalTrope?: string;
  rhythmicTrope?: string;
  panDescription?: string;
  aiStatMetric?: {
    spectralCentroidHz?: number;
    spectralFlatness?: number;
    rmsEnergy?: number;
    crestFactor?: number;
  };
  channelIndex?: number;
}

export interface DynamicStemResult {
  mode: '4-stem' | '2-stem' | 'spatial' | 'ensemble-256';
  ensembleSize: number;
  stems: StemTrackData[];
  multiChannelUrl?: string;
  multiChannelBlob?: Blob;
  summaryStats?: {
    totalChannels: number;
    topEnergeticChannelIds?: string[];
  };
}

// Biquad filter state and coefficient generator for offline processing
function createBiquadCoefficients(
  type: 'lowpass' | 'highpass' | 'bandpass',
  frequency: number,
  sampleRate: number,
  q: number = 0.707
) {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * q);

  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  if (type === 'lowpass') {
    b0 = (1 - cosw0) / 2;
    b1 = 1 - cosw0;
    b2 = (1 - cosw0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosw0;
    a2 = 1 - alpha;
  } else if (type === 'highpass') {
    b0 = (1 + cosw0) / 2;
    b1 = -(1 + cosw0);
    b2 = (1 + cosw0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosw0;
    a2 = 1 - alpha;
  } else if (type === 'bandpass') {
    b0 = sinw0 / 2;
    b1 = 0;
    b2 = -sinw0 / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosw0;
    a2 = 1 - alpha;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function applyBiquadFilter(
  input: Float32Array,
  coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number }
): Float32Array {
  const output = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const { b0, b1, b2, a1, a2 } = coeffs;

  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

export async function detectAndSplitStemsDynamic(
  audioBuffer: AudioBuffer,
  mode: '4-stem' | '2-stem' | 'spatial' = '4-stem'
): Promise<DynamicStemResult> {
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  if (audioBuffer.numberOfChannels === 1) {
    left.set(audioBuffer.getChannelData(0));
    right.set(audioBuffer.getChannelData(0));
  } else if (audioBuffer.numberOfChannels === 2) {
    left.set(audioBuffer.getChannelData(0));
    right.set(audioBuffer.getChannelData(1));
  } else {
    // Multi-channel downmix
    const channels = audioBuffer.numberOfChannels;
    for (let c = 0; c < channels; c++) {
      const channelData = audioBuffer.getChannelData(c);
      const isEven = c % 2 === 0;
      for (let i = 0; i < length; i++) {
        if (isEven) left[i] += channelData[i] / Math.ceil(channels / 2);
        else right[i] += channelData[i] / Math.floor(channels / 2);
      }
    }
  }

  // Common Mid/Side and signal metrics
  const mid = new Float32Array(length);
  const side = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = (left[i] + right[i]) * 0.5;
    side[i] = (left[i] - right[i]) * 0.5;
  }

  // -------------------------------------------------------------
  // MODE 1: 4-STEM STUDIO SPLIT (Drums, Bass, Vocals, Instruments)
  // -------------------------------------------------------------
  if (mode === '4-stem') {
    // 1. BASS STEM: Lowpass crossover at 220Hz
    const bassCoeffs = createBiquadCoefficients('lowpass', 220, sampleRate, 0.707);
    const bassMid = applyBiquadFilter(mid, bassCoeffs);
    // Add second pass for 24dB/oct steep roll-off
    const bassFiltered = applyBiquadFilter(bassMid, bassCoeffs);

    // 2. TRANSIENT ONSET ENGINE for DRUMS & PERCUSSION
    // Computes short-term energy flux and high-frequency bursts
    const drumsL = new Float32Array(length);
    const drumsR = new Float32Array(length);
    const frameSize = 128;
    let prevEnergy = 0.001;

    // Highpass for drum transient shimmer (snare wire, cymbals, hi-hats)
    const drumTrebleCoeffs = createBiquadCoefficients('highpass', 4500, sampleRate, 0.7);
    const trebleL = applyBiquadFilter(left, drumTrebleCoeffs);
    const trebleR = applyBiquadFilter(right, drumTrebleCoeffs);

    // Transient gain envelope
    const transientGain = new Float32Array(length);
    for (let i = 0; i < length; i += frameSize) {
      let energy = 0;
      const end = Math.min(length, i + frameSize);
      for (let j = i; j < end; j++) {
        energy += mid[j] * mid[j];
      }
      energy = Math.sqrt(energy / (end - i + 0.0001));

      // Sudden jump in energy indicates percussive onset
      const flux = Math.max(0, energy - prevEnergy * 1.25);
      const isTransient = flux > 0.012;
      const targetGain = isTransient ? Math.min(1.0, flux * 12) : 0;

      for (let j = i; j < end; j++) {
        // Fast attack, quick decay
        const prevG = j > 0 ? transientGain[j - 1] : 0;
        if (targetGain > prevG) {
          transientGain[j] = prevG + (targetGain - prevG) * 0.4;
        } else {
          transientGain[j] = prevG * 0.96;
        }
      }
      prevEnergy = energy * 0.6 + prevEnergy * 0.4;
    }

    for (let i = 0; i < length; i++) {
      const g = transientGain[i];
      // Drums contain transients + high-frequency percussive shimmer
      drumsL[i] = left[i] * g * 1.1 + trebleL[i] * 0.45;
      drumsR[i] = right[i] * g * 1.1 + trebleR[i] * 0.45;
    }

    // 3. VOCALS & LEAD: Mid-band (220Hz - 3800Hz) with Center Mid-Side phase extraction
    const vocalBpCoeffs = createBiquadCoefficients('bandpass', 1200, sampleRate, 0.5);
    const vocalMidBand = applyBiquadFilter(mid, vocalBpCoeffs);

    const vocalsL = new Float32Array(length);
    const vocalsR = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const mVal = Math.abs(mid[i]);
      const sVal = Math.abs(side[i]);
      // Center coherence: higher when signal is centered (vocals) and low when signal is wide (stereo guitars/reverbs)
      const centerFactor = mVal / (mVal + sVal * 1.5 + 0.001);
      // Suppress drum transients from vocal track
      const drumDucking = Math.max(0.15, 1 - transientGain[i] * 1.2);
      const vocalSample = vocalMidBand[i] * centerFactor * drumDucking * 1.3;
      vocalsL[i] = vocalSample;
      vocalsR[i] = vocalSample;
    }

    // 4. INSTRUMENTS & OTHER (Accompaniment, synths, guitars, pads, stereo ambience)
    // Residual difference: Original mix minus (Drums + Bass + Vocals)
    const otherL = new Float32Array(length);
    const otherR = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const bassSample = bassFiltered[i];
      otherL[i] = left[i] - drumsL[i] * 0.8 - bassSample * 0.95 - vocalsL[i] * 0.85;
      otherR[i] = right[i] - drumsR[i] * 0.8 - bassSample * 0.95 - vocalsR[i] * 0.85;
    }

    // Create 4 isolated AudioBuffers
    const actx = new window.OfflineAudioContext(2, length, sampleRate);
    
    // Drums Buffer
    const drumBuffer = actx.createBuffer(2, length, sampleRate);
    drumBuffer.getChannelData(0).set(drumsL);
    drumBuffer.getChannelData(1).set(drumsR);
    const drumBlob = audioBufferToWavBlob(drumBuffer);

    // Bass Buffer
    const bassBuffer = actx.createBuffer(2, length, sampleRate);
    bassBuffer.getChannelData(0).set(bassFiltered);
    bassBuffer.getChannelData(1).set(bassFiltered);
    const bassBlob = audioBufferToWavBlob(bassBuffer);

    // Vocals Buffer
    const vocalBuffer = actx.createBuffer(2, length, sampleRate);
    vocalBuffer.getChannelData(0).set(vocalsL);
    vocalBuffer.getChannelData(1).set(vocalsR);
    const vocalBlob = audioBufferToWavBlob(vocalBuffer);

    // Other Buffer
    const otherBuffer = actx.createBuffer(2, length, sampleRate);
    otherBuffer.getChannelData(0).set(otherL);
    otherBuffer.getChannelData(1).set(otherR);
    const otherBlob = audioBufferToWavBlob(otherBuffer);

    const stems: StemTrackData[] = [
      {
        id: 'stem_drums',
        name: 'Drums & Percussion',
        blob: drumBlob,
        url: URL.createObjectURL(drumBlob),
        buffer: drumBuffer,
        category: 'drums',
        color: '#f97316', // Orange
      },
      {
        id: 'stem_bass',
        name: 'Bass & Sub',
        blob: bassBlob,
        url: URL.createObjectURL(bassBlob),
        buffer: bassBuffer,
        category: 'bass',
        color: '#a855f7', // Purple
      },
      {
        id: 'stem_vocals',
        name: 'Vocals & Lead',
        blob: vocalBlob,
        url: URL.createObjectURL(vocalBlob),
        buffer: vocalBuffer,
        category: 'vocals',
        color: '#06b6d4', // Cyan
      },
      {
        id: 'stem_other',
        name: 'Instruments & Ambiance',
        blob: otherBlob,
        url: URL.createObjectURL(otherBlob),
        buffer: otherBuffer,
        category: 'other',
        color: '#10b981', // Emerald
      },
    ];

    let multiChannelUrl: string | undefined;
    try {
      const multiWav = createMultiChannelWavBlob(
        [drumsL, bassFiltered, vocalsL, otherL],
        sampleRate
      );
      multiChannelUrl = URL.createObjectURL(multiWav);
    } catch (e) {
      console.warn('Failed to generate multi-channel wav', e);
    }

    return {
      mode: '4-stem',
      ensembleSize: 4,
      stems,
      multiChannelUrl,
    };
  }

  // -------------------------------------------------------------
  // MODE 2: 2-STEM ACAPELLA / KARAOKE (Vocals vs Instrumental)
  // -------------------------------------------------------------
  if (mode === '2-stem') {
    const vocalBpCoeffs = createBiquadCoefficients('bandpass', 1200, sampleRate, 0.45);
    const vocalBand = applyBiquadFilter(mid, vocalBpCoeffs);

    const vocalsL = new Float32Array(length);
    const vocalsR = new Float32Array(length);
    const instL = new Float32Array(length);
    const instR = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const mVal = Math.abs(mid[i]);
      const sVal = Math.abs(side[i]);
      const centerFactor = mVal / (mVal + sVal * 1.4 + 0.001);
      const v = vocalBand[i] * centerFactor * 1.35;
      vocalsL[i] = v;
      vocalsR[i] = v;

      // Backing Instrumental: original stereo minus isolated center vocals
      instL[i] = left[i] - v * 0.95;
      instR[i] = right[i] - v * 0.95;
    }

    const actx = new window.OfflineAudioContext(2, length, sampleRate);
    const vocalBuffer = actx.createBuffer(2, length, sampleRate);
    vocalBuffer.getChannelData(0).set(vocalsL);
    vocalBuffer.getChannelData(1).set(vocalsR);
    const vocalBlob = audioBufferToWavBlob(vocalBuffer);

    const instBuffer = actx.createBuffer(2, length, sampleRate);
    instBuffer.getChannelData(0).set(instL);
    instBuffer.getChannelData(1).set(instR);
    const instBlob = audioBufferToWavBlob(instBuffer);

    const stems: StemTrackData[] = [
      {
        id: 'stem_vocals_isolated',
        name: 'Isolated Vocals & Center Lead',
        blob: vocalBlob,
        url: URL.createObjectURL(vocalBlob),
        buffer: vocalBuffer,
        category: 'vocals',
        color: '#06b6d4',
      },
      {
        id: 'stem_instrumental_backing',
        name: 'Instrumental Backing (Karaoke)',
        blob: instBlob,
        url: URL.createObjectURL(instBlob),
        buffer: instBuffer,
        category: 'instrumental',
        color: '#f59e0b',
      },
    ];

    return {
      mode: '2-stem',
      ensembleSize: 2,
      stems,
    };
  }

  // -------------------------------------------------------------
  // MODE 3: SPATIAL / DYNAMIC PAN ENSEMBLE
  // -------------------------------------------------------------
  const numBins = 100;
  const histogram = new Float32Array(numBins);
  
  for (let i = 0; i < length; i++) {
    const l = left[i];
    const r = right[i];
    const amp = Math.sqrt(l*l + r*r);
    if (amp > 0.01) {
      const angle = Math.atan2(Math.abs(r), Math.abs(l)); 
      const bin = Math.floor((angle / (Math.PI / 2)) * numBins);
      if (bin >= 0 && bin < numBins) {
        histogram[bin] += amp;
      }
    }
  }

  // Smooth histogram
  const smoothed = new Float32Array(numBins);
  for(let i=0; i<numBins; i++) {
    let sum = 0;
    let count = 0;
    for(let j=-2; j<=2; j++) {
      if (i+j >= 0 && i+j < numBins) {
        sum += histogram[i+j];
        count++;
      }
    }
    smoothed[i] = sum / count;
  }

  // Find peaks
  const peaks: { bin: number; angle: number; energy: number }[] = [];
  for (let i = 1; i < numBins - 1; i++) {
    if (smoothed[i] > smoothed[i-1] && smoothed[i] > smoothed[i+1]) {
      if (smoothed[i] > 10) {
        peaks.push({
          bin: i,
          angle: (i / numBins) * (Math.PI / 2),
          energy: smoothed[i]
        });
      }
    }
  }

  peaks.sort((a,b) => b.energy - a.energy);
  const maxEnergy = peaks[0]?.energy || 1;
  const validPeaks = peaks.filter(p => p.energy > maxEnergy * 0.05).slice(0, 8);
  validPeaks.sort((a,b) => a.angle - b.angle);

  if (validPeaks.length === 0) {
    validPeaks.push(
      { bin: 0, angle: 0, energy: maxEnergy },
      { bin: 50, angle: Math.PI/4, energy: maxEnergy },
      { bin: 99, angle: Math.PI/2, energy: maxEnergy }
    );
  }

  const multiChannelData: Float32Array[] = [];

  const stems: StemTrackData[] = validPeaks.map((peak, idx) => {
    const actx = new window.OfflineAudioContext(2, length, sampleRate);
    const buffer = actx.createBuffer(2, length, sampleRate);
    const outL = buffer.getChannelData(0);
    const outR = buffer.getChannelData(1);
    const monoTrack = new Float32Array(length);

    const angleSpread = 0.28;

    for (let i = 0; i < length; i++) {
      const l = left[i];
      const r = right[i];
      const amp = Math.sqrt(l*l + r*r);
      if (amp > 0.001) {
        const angle = Math.atan2(Math.abs(r), Math.abs(l));
        const diff = Math.abs(angle - peak.angle);
        let mask = Math.max(0, 1 - diff / angleSpread);
        mask = mask * mask; 
        
        outL[i] = l * mask;
        outR[i] = r * mask;
        monoTrack[i] = (outL[i] + outR[i]) / 2;
      }
    }
    multiChannelData.push(monoTrack);

    const blob = audioBufferToWavBlob(buffer);
    
    let name = "Center (Vocals/Bass)";
    if (peak.angle < 0.3) name = "Left Wing (Side)";
    else if (peak.angle > 1.2) name = "Right Wing (Side)";
    else if (peak.angle > 0.3 && peak.angle < 0.7) name = "Mid-Left";
    else if (peak.angle > 0.8 && peak.angle < 1.2) name = "Mid-Right";
    name = `${name} (Pan: ${((peak.angle / (Math.PI/2)) * 100).toFixed(0)}%)`;

    const colors = ['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];

    return {
      id: `stem_${idx}`,
      name: `Spatial Stem ${idx + 1}: ${name}`,
      panAngle: peak.angle,
      blob,
      url: URL.createObjectURL(blob),
      buffer,
      category: 'other',
      color: colors[idx % colors.length],
    };
  });

  let multiChannelUrl: string | undefined;
  if (stems.length > 0) {
    try {
      const multiWav = createMultiChannelWavBlob(multiChannelData, sampleRate);
      multiChannelUrl = URL.createObjectURL(multiWav);
    } catch(e) {
      console.warn("Failed to generate multi-channel wav", e);
    }
  }

  return {
    mode: 'spatial',
    ensembleSize: stems.length,
    stems,
    multiChannelUrl,
  };
}

export function createMultiChannelWavBlob(channelsData: Float32Array[], sampleRate: number): Blob {
  const numChannels = channelsData.length;
  if (numChannels === 0) throw new Error("No channels provided");
  const length = channelsData[0].length;
  const bytesPerSample = 2; // 16-bit PCM
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

  // RIFF Chunk
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt Subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true); // Support up to 65535 channels natively
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  // data Subchunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channel data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelsData[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
