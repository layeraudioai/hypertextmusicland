// TTS Transmuter: Synthesizes speech via meSpeak, converts to SoundFont 2 (.sf2),
// and extracts melodic/rhythmic MIDI notes in a unified "All Together" pipeline.

import { saveAudioData } from '../utils/audioPersistence';
import { Note, Track, CustomSf2Instrument } from '../types/daw';
import { sampleManager, decodeAudioFile, detectPitchYIN } from './audioProcessor';
import { generateSf2Binary } from './sf2Generator';
import { exportToMidiFile } from './midiParser';
import { synthesizeSpeechToAudioBuffer, TtsSynthOptions, MESPEAK_VOICES } from './meSpeakService';
import { DEFAULT_TRACK_EFFECTS, getNoteName } from './constants';

export interface TtsTransmuteOptions extends TtsSynthOptions {
  instrumentName?: string;
  targetMidiRoot?: number; // e.g. 60 for C4
  quantizeGrid?: number; // e.g. 0.25 (16th notes) or 0.5 (8th notes)
  bpm?: number;
  pitchCorrection?: 'natural' | 'auto-tune' | 'vocoder-robot';
}

export interface TtsTransmuteResult {
  text: string;
  audioBuffer: AudioBuffer;
  wavBlob: Blob;
  wavUrl: string;
  sf2Blob: Blob;
  sf2Url: string;
  sf2Instrument: CustomSf2Instrument;
  midiBytes: Uint8Array;
  midiBlob: Blob;
  midiUrl: string;
  transcribedNotes: Note[];
  detectedPitch: {
    frequency: number;
    midiPitch: number;
    noteName: string;
    confidence: number;
  };
  durationSeconds: number;
  durationBeats: number;
  requiredBars: number;
}

/**
 * Transcribes speech audio buffer into structured MIDI notes based on
 * energy envelope onsets, syllable bursts, and pitch tracking.
 */
export function transcribeSpeechToMidiNotes(
  audioBuffer: AudioBuffer,
  bpm: number = 120,
  targetRootPitch: number = 60,
  pitchCorrection: 'natural' | 'auto-tune' | 'vocoder-robot' = 'natural'
): Note[] {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const durationSec = audioBuffer.duration;
  const beatsPerSec = bpm / 60;

  // Window-based envelope analysis for syllable detection
  const frameSize = Math.floor(sampleRate * 0.025); // 25ms frames
  const hopSize = Math.floor(sampleRate * 0.010); // 10ms hop
  const numFrames = Math.floor((totalSamples - frameSize) / hopSize);

  if (numFrames <= 0) return [];

  const energies = new Float32Array(numFrames);
  let maxEnergy = 0.0001;

  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = channelData[start + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / frameSize);
    energies[f] = rms;
    if (rms > maxEnergy) maxEnergy = rms;
  }

  // Threshold for speech syllable detection
  const energyThresh = maxEnergy * 0.12;
  const rawSegments: { startFrame: number; endFrame: number; avgEnergy: number }[] = [];
  let inSegment = false;
  let segStart = 0;
  let segSum = 0;

  for (let f = 0; f < numFrames; f++) {
    const e = energies[f];
    if (e >= energyThresh) {
      if (!inSegment) {
        inSegment = true;
        segStart = f;
        segSum = e;
      } else {
        segSum += e;
      }
    } else {
      if (inSegment) {
        inSegment = false;
        const segLen = f - segStart;
        // Keep segments that are at least 40ms long
        if (segLen >= 4) {
          rawSegments.push({
            startFrame: segStart,
            endFrame: f,
            avgEnergy: segSum / segLen,
          });
        }
      }
    }
  }

  // If inSegment at the end
  if (inSegment) {
    const segLen = numFrames - segStart;
    if (segLen >= 4) {
      rawSegments.push({
        startFrame: segStart,
        endFrame: numFrames,
        avgEnergy: segSum / segLen,
      });
    }
  }

  // Fallback if no syllables detected: create at least 1 note
  if (rawSegments.length === 0) {
    return [
      {
        id: `tts_note_${Date.now()}_0`,
        pitch: targetRootPitch,
        time: 0,
        duration: Math.max(0.5, Number((durationSec * beatsPerSec).toFixed(2))),
        velocity: 0.85,
      },
    ];
  }

  const notes: Note[] = [];
  // Musical intervals for vocal inflection (pentatonic / diatonic inflections)
  const melodicOffsets = [0, 2, 4, 7, 5, 2, 0, -2, 0, 4, 7, 9];

  rawSegments.forEach((seg, idx) => {
    const startTimeSec = (seg.startFrame * hopSize) / sampleRate;
    const endTimeSec = (seg.endFrame * hopSize) / sampleRate;
    const segDurationSec = endTimeSec - startTimeSec;

    // Convert to beats
    let startBeat = startTimeSec * beatsPerSec;
    let durationBeats = segDurationSec * beatsPerSec;

    // Snap to 16th grid (0.25 beat)
    startBeat = Math.round(startBeat * 4) / 4;
    durationBeats = Math.max(0.25, Math.round(durationBeats * 4) / 4);

    // Determine pitch based on correction mode
    let notePitch = targetRootPitch;
    if (pitchCorrection === 'vocoder-robot') {
      notePitch = targetRootPitch; // Fixed robotic drone note
    } else if (pitchCorrection === 'auto-tune') {
      const offset = melodicOffsets[idx % melodicOffsets.length];
      notePitch = Math.max(36, Math.min(84, targetRootPitch + offset));
    } else {
      // Natural inflection with subtle melodic step
      const step = idx === 0 ? 0 : (idx % 3 === 1 ? 2 : (idx % 3 === 2 ? -1 : 0));
      notePitch = Math.max(36, Math.min(84, targetRootPitch + step));
    }

    const velocity = Math.min(1.0, Math.max(0.5, (seg.avgEnergy / maxEnergy) * 0.95));

    notes.push({
      id: `tts_note_${Date.now()}_${idx}`,
      pitch: notePitch,
      time: Number(startBeat.toFixed(3)),
      duration: Number(durationBeats.toFixed(3)),
      velocity: Number(velocity.toFixed(2)),
    });
  });

  return notes;
}

/**
 * Executes the complete "TTS + SF2 + MIDI All Together" pipeline
 */
export async function transmuteTtsAllTogether(
  text: string,
  options: TtsTransmuteOptions = {},
  audioCtx?: BaseAudioContext
): Promise<TtsTransmuteResult> {
  const bpm = options.bpm || 120;
  const targetRootPitch = options.targetMidiRoot ?? 60;
  const instrumentName = options.instrumentName || `TTS Voice (${text.slice(0, 16)}...)`;

  // 1. Synthesize Speech Audio Buffer via meSpeak
  const { audioBuffer, wavBlob, wavArrayBuffer } = await synthesizeSpeechToAudioBuffer(
    text,
    options,
    audioCtx
  );
  const wavUrl = URL.createObjectURL(wavBlob);

  // 2. Pitch Detection & Frequency Analysis
  const detected = detectPitchYIN(audioBuffer);
  const rootPitchToUse = targetRootPitch || detected.midiPitch || 60;

  // 3. Generate SoundFont 2.04 (.sf2) binary container
  const sf2Binary = generateSf2Binary(
    'TTS Sample',
    audioBuffer,
    rootPitchToUse,
    instrumentName
  );
  const sf2Blob = new Blob([sf2Binary as BlobPart], { type: 'application/x-soundfont' });
  const sf2Url = URL.createObjectURL(sf2Blob);

  // Register into sampleManager for direct playback in DAW
  const sf2InstId = `custom_tts_${Date.now()}`;
  await saveAudioData(sf2InstId, sf2Binary.buffer);
  const sf2Instrument: CustomSf2Instrument = {
    id: sf2InstId,
    name: `🗣️ ${instrumentName}`,
    rootPitch: rootPitchToUse,
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
    audioBuffer: audioBuffer,
    sf2Blob,
    isSf2: true,
  };
  sampleManager.registerInstrument(sf2Instrument);

  // 4. Syllable & Phoneme MIDI Transcription
  const transcribedNotes = transcribeSpeechToMidiNotes(
    audioBuffer,
    bpm,
    rootPitchToUse,
    options.pitchCorrection || 'auto-tune'
  );

  // 5. Generate Standard MIDI File (.mid)
  const trackForMidi: Track = {
    id: `track_tts_temp_${Date.now()}`,
    name: instrumentName,
    color: '#38bdf8',
    instrument: sf2InstId as any,
    volume: 0.85,
    pan: 0,
    muted: false,
    solo: false,
    armed: false,
    notes: transcribedNotes,
    effects: { ...DEFAULT_TRACK_EFFECTS },
  };

  const midiBytes = exportToMidiFile([trackForMidi], bpm, `TTS: ${text.slice(0, 24)}`);
  const midiBlob = new Blob([midiBytes as BlobPart], { type: 'audio/midi' });
  const midiUrl = URL.createObjectURL(midiBlob);

  const durationSeconds = audioBuffer.duration;
  const durationBeats = (durationSeconds * bpm) / 60;
  const requiredBars = Math.max(1, Math.ceil(durationBeats / 4));

  return {
    text,
    audioBuffer,
    wavBlob,
    wavUrl,
    sf2Blob,
    sf2Url,
    sf2Instrument,
    midiBytes,
    midiBlob,
    midiUrl,
    transcribedNotes,
    detectedPitch: {
      frequency: detected.frequency,
      midiPitch: detected.midiPitch,
      noteName: detected.noteName,
      confidence: detected.confidence,
    },
    durationSeconds,
    durationBeats,
    requiredBars,
  };
}

/**
 * Injects both the Audio Stem Track and the SF2 MIDI Track into the Project State
 */
export function injectTtsTracksToProject(
  result: TtsTransmuteResult,
  currentTracks: Track[],
  currentTotalBars: number
): { tracks: Track[]; totalBars: number } {
  const newTracks = [...currentTracks];

  // 1. Audio Stem Track
  const stemTrackId = `track_tts_stem_${Date.now()}`;
  const stemTrack: Track = {
    id: stemTrackId,
    name: `🗣️ Voice Stem: "${result.text.slice(0, 14)}..."`,
    color: '#06b6d4', // Cyan
    instrument: 'grand_piano',
    volume: 0.88,
    pan: 0,
    muted: false,
    solo: false,
    armed: false,
    notes: [],
    effects: { ...DEFAULT_TRACK_EFFECTS },
    audioStem: {
      id: `stem_tts_${Date.now()}`,
      name: `TTS Audio: ${result.text.slice(0, 20)}`,
      url: result.wavUrl,
      buffer: result.audioBuffer,
      duration: result.durationBeats,
    },
  };
  newTracks.push(stemTrack);

  // 2. SF2 MIDI Instrument Track
  const sf2TrackId = `track_tts_sf2_${Date.now() + 1}`;
  const sf2Track: Track = {
    id: sf2TrackId,
    name: `🎹 TTS SF2 Synth: "${result.text.slice(0, 14)}..."`,
    color: '#a855f7', // Purple
    instrument: result.sf2Instrument.id as any,
    volume: 0.85,
    pan: 0,
    muted: false,
    solo: false,
    armed: false,
    notes: result.transcribedNotes,
    effects: { ...DEFAULT_TRACK_EFFECTS, reverbSend: 0.25, delaySend: 0.15 },
  };
  newTracks.push(sf2Track);

  const updatedBars = Math.max(currentTotalBars, result.requiredBars);

  return {
    tracks: newTracks,
    totalBars: updatedBars,
  };
}
