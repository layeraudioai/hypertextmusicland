import { saveAudioData } from '../utils/audioPersistence';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Music,
  FileAudio,
  Play,
  Pause,
  Download,
  Check,
  Sparkles,
  Sliders,
  X,
  Layers,
  ArrowRightLeft,
  Volume2,
  RefreshCw,
  Plus,
  Wand2,
  Mic,
  Volume1,
} from 'lucide-react';
import { ProjectState, Track, Note, CustomSf2Instrument, InstrumentId } from '../types/daw';
import {
  decodeAudioFile,
  detectPitchAutocorrelation,
  transcribeAudioToMidi,
  renderSf2DemoWav,
  audioBufferToWavBlob,
  detectAndSplitStemsDynamic,
  distortAudio,
  DynamicStemResult,
  StemTrackData,
  sampleManager,
  PitchDetectionResult,
} from '../audio/audioProcessor';
import { synth } from '../audio/synthEngine';
import { exportToMidiFile } from '../audio/midiParser';
import { generateSf2Binary } from '../audio/sf2Generator';
import { ROOT_NOTES, SOUNDFONT_PRESETS, getNoteName, getPitchColor, DEFAULT_TRACK_EFFECTS } from '../audio/constants';
import {
  transmuteTtsAllTogether,
  injectTtsTracksToProject,
  TtsTransmuteResult,
} from '../audio/ttsTransmuter';
import { MESPEAK_VOICES, ensureMeSpeakInitialized } from '../audio/meSpeakService';

// Stem Waveform Visualizer
function StemWaveform({ buffer, color = '#38bdf8' }: { buffer?: AudioBuffer; color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!buffer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    ctx.fillStyle = color;
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      if (min > max) {
        min = -0.05;
        max = 0.05;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(2, (max - min) * amp));
    }
  }, [buffer, color]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={48}
      className="w-full h-12 rounded bg-slate-950 border border-slate-800/80"
    />
  );
}

// Musical Showcase Sequences for auditioning SoundFonts
const PRESET_PATTERNS: Record<
  string,
  { name: string; description: string; getNotes: (root: number) => Note[] }
> = {
  preset_arpeggio: {
    name: 'Melodic Arpeggio (Major 9th)',
    description: '8-note soaring arpeggio across 2 octaves',
    getNotes: (r) => [
      { id: 'p0', pitch: r, time: 0, duration: 0.5, velocity: 0.85 },
      { id: 'p1', pitch: r + 4, time: 0.5, duration: 0.5, velocity: 0.8 },
      { id: 'p2', pitch: r + 7, time: 1.0, duration: 0.5, velocity: 0.85 },
      { id: 'p3', pitch: r + 11, time: 1.5, duration: 0.5, velocity: 0.8 },
      { id: 'p4', pitch: r + 14, time: 2.0, duration: 0.5, velocity: 0.9 },
      { id: 'p5', pitch: r + 11, time: 2.5, duration: 0.5, velocity: 0.8 },
      { id: 'p6', pitch: r + 7, time: 3.0, duration: 0.5, velocity: 0.8 },
      { id: 'p7', pitch: r + 4, time: 3.5, duration: 0.5, velocity: 0.75 },
    ],
  },
  preset_chords: {
    name: 'Harmonic Cadence (ii - V - I Chords)',
    description: 'Lush 4-bar chord progression',
    getNotes: (r) => [
      // ii (minor 7th): r+2, r+5, r+9, r+12
      { id: 'c0', pitch: r + 2, time: 0, duration: 2.0, velocity: 0.8 },
      { id: 'c1', pitch: r + 5, time: 0, duration: 2.0, velocity: 0.75 },
      { id: 'c2', pitch: r + 9, time: 0, duration: 2.0, velocity: 0.75 },
      { id: 'c3', pitch: r + 12, time: 0, duration: 2.0, velocity: 0.8 },
      // V (dominant 7th): r+7, r+11, r+14, r+17
      { id: 'c4', pitch: r + 7, time: 2.0, duration: 2.0, velocity: 0.85 },
      { id: 'c5', pitch: r + 11, time: 2.0, duration: 2.0, velocity: 0.8 },
      { id: 'c6', pitch: r + 14, time: 2.0, duration: 2.0, velocity: 0.8 },
      { id: 'c7', pitch: r + 17, time: 2.0, duration: 2.0, velocity: 0.85 },
      // I (major 7th): r, r+4, r+7, r+11
      { id: 'c8', pitch: r, time: 4.0, duration: 4.0, velocity: 0.9 },
      { id: 'c9', pitch: r + 4, time: 4.0, duration: 4.0, velocity: 0.85 },
      { id: 'c10', pitch: r + 7, time: 4.0, duration: 4.0, velocity: 0.85 },
      { id: 'c11', pitch: r + 11, time: 4.0, duration: 4.0, velocity: 0.9 },
    ],
  },
  preset_bassline: {
    name: 'Funky Bassline Groove',
    description: '16-beat syncopated octave bassline',
    getNotes: (r) => {
      const base = Math.max(24, r - 24);
      return [
        { id: 'b0', pitch: base, time: 0, duration: 0.5, velocity: 0.9 },
        { id: 'b1', pitch: base + 12, time: 0.75, duration: 0.25, velocity: 0.7 },
        { id: 'b2', pitch: base + 3, time: 1.0, duration: 0.5, velocity: 0.85 },
        { id: 'b3', pitch: base + 5, time: 1.5, duration: 0.5, velocity: 0.85 },
        { id: 'b4', pitch: base + 7, time: 2.0, duration: 0.5, velocity: 0.9 },
        { id: 'b5', pitch: base + 10, time: 2.5, duration: 0.5, velocity: 0.8 },
        { id: 'b6', pitch: base + 12, time: 3.0, duration: 0.75, velocity: 0.95 },
      ];
    },
  },
  preset_range: {
    name: 'Chromatic Full-Range Test',
    description: 'Ascending semitones across full register',
    getNotes: (r) =>
      Array.from({ length: 13 }).map((_, i) => ({
        id: `cr-${i}`,
        pitch: r - 6 + i,
        time: i * 0.35,
        duration: 0.35,
        velocity: 0.8,
      })),
  },
};

export type TransmuterTab =
  | 'audio-to-sf2'
  | 'audio-to-midi'
  | 'midi-sf2-to-audio'
  | 'audio-to-stems'
  | 'tts-all-together';

interface AudioTransmuterModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  initialTab?: TransmuterTab | 'midi-to-audio' | 'sf2-to-audio' | 'audio-to-stems' | 'tts' | 'tts-all-together';
}

export const AudioTransmuterModal: React.FC<AudioTransmuterModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  initialTab = 'audio-to-sf2',
}) => {
  const getNormalizedTab = (tab?: string): TransmuterTab => {
    if (tab === 'midi-to-audio' || tab === 'sf2-to-audio' || tab === 'midi-sf2-to-audio') {
      return 'midi-sf2-to-audio';
    }
    if (tab === 'audio-to-midi') return 'audio-to-midi';
    if (tab === 'audio-to-stems') return 'audio-to-stems';
    if (tab === 'tts' || tab === 'tts-all-together') return 'tts-all-together';
    return 'audio-to-sf2';
  };

  const [activeTab, setActiveTab] = useState<TransmuterTab>(getNormalizedTab(initialTab));

  // Audio Upload & Processing state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Audio to SF2 State
  const [pitchResult, setPitchResult] = useState<PitchDetectionResult | null>(null);
  const [rootPitchOverride, setRootPitchOverride] = useState<number>(60);
  const [sf2InstrumentName, setSf2InstrumentName] = useState<string>('Custom SoundFont Sample');

  // Audio to MIDI State
  const [transcribedNotes, setTranscribedNotes] = useState<Note[]>([]);
  const [transcriptionSensitivity, setTranscriptionSensitivity] = useState(0.5);

  // Merged MIDI & SF2 to Audio State
  // midiSource: 'uploaded_transcribed' | `track_${trackId}` | 'preset_arpeggio' | 'preset_chords' | 'preset_bassline' | 'preset_range'
  const [midiSource, setMidiSource] = useState<string>('uploaded_transcribed');
  // soundbankInstrument: 'uploaded_stem' | custom instrument ID | SOUNDFONT_PRESETS ID
  const [soundbankInstrument, setSoundbankInstrument] = useState<string>('uploaded_stem');
  const [synthBpm, setSynthBpm] = useState<number>(project.bpm);
  const [filterCutoff, setFilterCutoff] = useState<number>(12000);
  const [reverbSend, setReverbSend] = useState<number>(0.25);
  const [resonance, setResonance] = useState<number>(2.0);
  const [renderedWavUrl, setRenderedWavUrl] = useState<string | null>(null);
  const [isRenderingAudio, setIsRenderingAudio] = useState(false);
  const [renderedNotes, setRenderedNotes] = useState<Note[]>([]);
  const [renderedInstrument, setRenderedInstrument] = useState<string>('uploaded_stem');
  
  // Audio to Stems State
  const [detectedStems, setDetectedStems] = useState<DynamicStemResult | null>(null);
  const [isSplittingStems, setIsSplittingStems] = useState(false);
  const [stemMode, setStemMode] = useState<'4-stem' | '2-stem' | 'spatial'>('4-stem');

  // TTS Speech to SF2 + MIDI + Stem State
  const [ttsText, setTtsText] = useState('Hyper Text Music Land synthesized speech');
  const [ttsVoice, setTtsVoice] = useState('en/en-us');
  const [ttsPitch, setTtsPitch] = useState(50);
  const [ttsSpeed, setTtsSpeed] = useState(160);
  const [ttsCorrection, setTtsCorrection] = useState<'natural' | 'auto-tune' | 'vocoder-robot'>('auto-tune');
  const [ttsTargetRoot, setTtsTargetRoot] = useState(60);
  const [isSynthesizingTts, setIsSynthesizingTts] = useState(false);
  const [ttsResult, setTtsResult] = useState<TtsTransmuteResult | null>(null);
  const [isPlayingTts, setIsPlayingTts] = useState(false);

  // Success notifications
  const [notification, setNotification] = useState<string | null>(null);

  // Audio preview playback node
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number>(0);

  const stopAudioPlayback = useCallback(() => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch (e) {}
      activeSourceRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsPlayingAudio(false);
    setPlaybackProgress(0);
  }, []);

  useEffect(() => {
    setActiveTab(getNormalizedTab(initialTab));
  }, [initialTab]);

  // Synchronize the uploaded audio stem with the SoundFont instrument catalog whenever root pitch or sample changes
  useEffect(() => {
    if (audioBuffer) {
      synth.registerCustomSample('uploaded_stem', audioBuffer, rootPitchOverride);
      sampleManager.registerInstrument({
        id: 'uploaded_stem',
        name: sf2InstrumentName || `Stem: ${audioFile?.name.replace(/\.[^/.]+$/, '') || 'Sample'}`,
        audioBuffer: audioBuffer,
        rootPitch: rootPitchOverride,
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
      });
    }
  }, [audioBuffer, rootPitchOverride, sf2InstrumentName, audioFile]);

  // Clean up audio playback on unmount or file change
  useEffect(() => {
    return () => {
      stopAudioPlayback();
    };
  }, [stopAudioPlayback]);

  // Draw waveform whenever audioBuffer updates
  useEffect(() => {
    if (!audioBuffer || !waveformCanvasRef.current) return;
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Background grid
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    // Waveform bars
    ctx.fillStyle = '#38bdf8';
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const y1 = Math.max(0, (1 + min) * amp);
      const y2 = Math.min(height, (1 + max) * amp);
      ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
    }
  }, [audioBuffer]);

  if (!isOpen) return null;

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | null = null;
    if ('dataTransfer' in e) {
      e.preventDefault();
      file = e.dataTransfer.files[0];
    } else if (e.target.files) {
      file = e.target.files[0];
    }
    if (!file) return;

    setIsProcessing(true);
    setNotification(null);
    setAudioFile(file);

    try {
      synth.init();
      const ctx = synth.getAudioContext();
      const buffer = await decodeAudioFile(file, ctx || undefined);
      setAudioBuffer(buffer);

      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const stemName = `SF2 ${baseName}`;
      setSf2InstrumentName(stemName);

      // 1. Detect Pitch with YIN algorithm
      const detected = detectPitchAutocorrelation(buffer);
      setPitchResult(detected);
      setRootPitchOverride(detected.midiPitch);

      // 2. Perform Audio-to-MIDI Transcription
      const notes = transcribeAudioToMidi(buffer, project.bpm, transcriptionSensitivity);
      setTranscribedNotes(notes);

      // 3. Register as in-memory stem SoundFont instrument
      const arrayBuffer = await file.arrayBuffer();
      await saveAudioData('uploaded_stem', arrayBuffer);
      
      const newInstrument: CustomSf2Instrument = {
        id: 'uploaded_stem',
        name: stemName,
        rootPitch: detected.midiPitch,
        sampleRate: buffer.sampleRate,
        duration: buffer.duration,
      };
      
      synth.registerCustomSample('uploaded_stem', buffer, detected.midiPitch);
      sampleManager.registerInstrument({ ...newInstrument, audioBuffer: buffer });
      
      onUpdateProject(prev => ({
        ...prev,
        customInstruments: [...(prev.customInstruments || []).filter(i => i.id !== 'uploaded_stem'), newInstrument]
      }));

      // 4. Automatically select uploaded audio stem and transcribed melody in merged studio
      setMidiSource('uploaded_transcribed');
      setSoundbankInstrument('uploaded_stem');

      setNotification(
        `✓ Decoded ${file.name} (${buffer.duration.toFixed(2)}s) • Root: ${detected.noteName} • Transcribed ${notes.length} notes!`
      );
    } catch (err: any) {
      console.error(err);
      alert('Error decoding audio: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTogglePlayAudio = () => {
    if (!audioBuffer) return;
    synth.init();
    const ctx = synth.getAudioContext();
    if (!ctx) return;

    if (isPlayingAudio) {
      stopAudioPlayback();
    } else {
      stopAudioPlayback();
      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ctx.destination);
      src.start();
      activeSourceRef.current = src;
      setIsPlayingAudio(true);
      playStartTimeRef.current = ctx.currentTime;

      src.onended = () => {
        setIsPlayingAudio(false);
        setPlaybackProgress(0);
      };

      const trackProgress = () => {
        if (!activeSourceRef.current) return;
        const elapsed = ctx.currentTime - playStartTimeRef.current;
        const p = Math.min(1, elapsed / audioBuffer.duration);
        setPlaybackProgress(p);
        if (p < 1 && isPlayingAudio) {
          animFrameRef.current = requestAnimationFrame(trackProgress);
        }
      };
      animFrameRef.current = requestAnimationFrame(trackProgress);
    }
  };

  // --- 1. Audio to SF2 Actions ---
  const handleRegisterSf2InDaw = () => {
    if (!audioBuffer) return;

    const instId = `sf2-${Date.now()}`;
    const customInst: CustomSf2Instrument = {
      id: instId,
      name: sf2InstrumentName,
      rootPitch: rootPitchOverride,
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
      audioBuffer,
    };

    // Register in sampleManager and in synthEngine
    sampleManager.registerInstrument(customInst);
    synth.registerCustomSample(instId, audioBuffer, rootPitchOverride);

    // Add a new track to the DAW utilizing this SoundFont
    const beats = (audioBuffer.duration * project.bpm) / 60;
    const requiredBars = Math.max(1, Math.ceil(beats / 4));

    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: sf2InstrumentName,
      instrument: instId as InstrumentId,
      color: '#f43f5e',
      volume: 0.85,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      notes: transcribedNotes.length > 0 ? transcribedNotes : [],
      effects: {
        cutoff: 12000,
        resonance: 1.5,
        distortion: 0.0,
        delaySend: 0.2,
        delayTime: 0.35,
        reverbSend: 0.3,
        attack: 0.005,
        decay: 0.4,
        sustain: 0.8,
        release: 0.5,
      },
    };

    onUpdateProject((prev) => ({
      ...prev,
      totalBars: Math.max(prev.totalBars, requiredBars),
      tracks: [...prev.tracks, newTrack],
      selectedTrackId: newTrack.id,
    }));

    setNotification(`✓ Registered "${sf2InstrumentName}" into DAW! Project set to ${Math.max(project.totalBars, requiredBars)} bars.`);
  };

  const handleSyncProjectBarsToAudio = () => {
    if (!audioBuffer) return;
    const beats = (audioBuffer.duration * project.bpm) / 60;
    const requiredBars = Math.max(1, Math.ceil(beats / 4));
    onUpdateProject((prev) => ({
      ...prev,
      totalBars: requiredBars,
    }));
    setNotification(`✓ Synchronized project length to ${requiredBars} bars (${beats.toFixed(1)} beats) based on input audio!`);
  };

  const handleAddAudioStemTrackToDaw = () => {
    if (!audioBuffer) return;
    const beats = (audioBuffer.duration * project.bpm) / 60;
    const requiredBars = Math.max(1, Math.ceil(beats / 4));
    const stemId = `stem-${Date.now()}`;
    const objectUrl = audioFile ? URL.createObjectURL(audioFile) : '';

    const newTrack: Track = {
      id: `track-stem-${Date.now()}`,
      name: `Stem: ${audioFile?.name.replace(/\.[^/.]+$/, '') || 'Input Audio'}`,
      instrument: 'synth_lead',
      color: '#10b981',
      volume: 0.85,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      notes: [],
      audioStem: {
        id: stemId,
        name: audioFile?.name || 'Input Audio',
        url: objectUrl,
        duration: beats,
        buffer: audioBuffer,
      },
      effects: {
        cutoff: 12000,
        resonance: 1.5,
        distortion: 0.0,
        delaySend: 0.2,
        delayTime: 0.35,
        reverbSend: 0.3,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.8,
        release: 0.4,
      },
    };

    onUpdateProject((prev) => ({
      ...prev,
      totalBars: Math.max(prev.totalBars, requiredBars),
      tracks: [...prev.tracks, newTrack],
      selectedTrackId: newTrack.id,
    }));

    setNotification(
      `✓ Added "${newTrack.name}" to DAW! Project set to ${Math.max(project.totalBars, requiredBars)} bars (${beats.toFixed(1)} beats).`
    );
  };

  const handleAddStemToDaw = (stem: StemTrackData) => {
    if (!audioBuffer) return;
    const stemBuf = stem.buffer || audioBuffer;
    const beats = (stemBuf.duration * project.bpm) / 60;
    const requiredBars = Math.max(1, Math.ceil(beats / 4));

    const newTrack: Track = {
      id: `track-stem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: stem.name,
      instrument: 'synth_lead',
      color: stem.color || '#6366f1',
      volume: 0.85,
      pan: stem.category === 'drums' ? 0 : stem.category === 'bass' ? 0 : stem.category === 'vocals' ? 0 : 0.15,
      muted: false,
      solo: false,
      armed: false,
      notes: [],
      audioStem: {
        id: stem.id,
        name: stem.name,
        url: stem.url,
        duration: beats,
        buffer: stemBuf,
      },
      effects: {
        cutoff: 12000,
        resonance: 1.5,
        distortion: 0,
        delaySend: 0.2,
        delayTime: 0.35,
        reverbSend: 0.25,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.8,
        release: 0.4,
      },
    };

    onUpdateProject((prev) => ({
      ...prev,
      totalBars: Math.max(prev.totalBars, requiredBars),
      tracks: [...prev.tracks, newTrack],
      selectedTrackId: newTrack.id,
    }));

    setNotification(
      `✓ Added Stem "${stem.name}" to DAW! Project length set to ${Math.max(project.totalBars, requiredBars)} bars.`
    );
  };

  const handleAddAllStemsToDaw = () => {
    if (!detectedStems || detectedStems.stems.length === 0 || !audioBuffer) return;
    const stemBuf = detectedStems.stems[0].buffer || audioBuffer;
    const beats = (stemBuf.duration * project.bpm) / 60;
    const requiredBars = Math.max(1, Math.ceil(beats / 4));

    const newTracks: Track[] = detectedStems.stems.map((stem, idx) => ({
      id: `track-stem-${Date.now()}-${idx}`,
      name: stem.name,
      instrument: 'synth_lead',
      color: stem.color || ['#f97316', '#a855f7', '#06b6d4', '#10b981', '#f59e0b'][idx % 5],
      volume: 0.85,
      pan:
        stem.category === 'drums'
          ? 0
          : stem.category === 'bass'
          ? 0
          : stem.category === 'vocals'
          ? 0
          : idx % 2 === 1
          ? -0.25
          : 0.25,
      muted: false,
      solo: false,
      armed: false,
      notes: [],
      audioStem: {
        id: stem.id,
        name: stem.name,
        url: stem.url,
        duration: beats,
        buffer: stem.buffer || audioBuffer,
      },
      effects: {
        cutoff: 12000,
        resonance: 1.5,
        distortion: 0,
        delaySend: 0.2,
        delayTime: 0.35,
        reverbSend: 0.25,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.8,
        release: 0.4,
      },
    }));

    onUpdateProject((prev) => ({
      ...prev,
      totalBars: Math.max(prev.totalBars, requiredBars),
      tracks: [...prev.tracks, ...newTracks],
      selectedTrackId: newTracks[0]?.id || prev.selectedTrackId,
    }));

    setNotification(
      `✓ Added all ${newTracks.length} stems to DAW and expanded project to ${Math.max(project.totalBars, requiredBars)} bars!`
    );
  };

  const handleDownloadSf2Binary = () => {
    if (!audioBuffer) return;
    const sf2Bytes = generateSf2Binary(
      sf2InstrumentName,
      audioBuffer,
      rootPitchOverride,
      sf2InstrumentName,
      pitchResult?.cents || 0
    );

    const blob = new Blob([sf2Bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sf2InstrumentName.replace(/\s+/g, '_')}.sf2`;
    a.click();
    URL.revokeObjectURL(url);

    setNotification(`✓ Downloaded "${sf2InstrumentName}.sf2" (SoundFont 2.04 format)`);
  };

  // --- 2. Audio to MIDI Actions ---
  const handleAddMidiTrackToDaw = () => {
    if (transcribedNotes.length === 0) return;

    const newTrack: Track = {
      id: `transcribed-track-${Date.now()}`,
      name: `MIDI: ${audioFile?.name.replace(/\.[^/.]+$/, '') || 'Transcribed Take'}`,
      instrument: 'synth_lead',
      color: '#34d399',
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      notes: transcribedNotes,
      effects: {
        cutoff: 8000,
        resonance: 2.0,
        distortion: 0.0,
        delaySend: 0.2,
        delayTime: 0.35,
        reverbSend: 0.25,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.7,
        release: 0.3,
      },
    };

    onUpdateProject((prev) => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
      selectedTrackId: newTrack.id,
    }));

    setNotification(`✓ Added transcribed MIDI track (${transcribedNotes.length} notes) to DAW!`);
  };

  const handleDownloadTranscribedMidi = () => {
    if (transcribedNotes.length === 0) return;
    const trackForMidi: Track = {
      id: 'midi-export',
      name: audioFile?.name || 'Transcribed',
      instrument: 'synth_lead',
      color: '#38bdf8',
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      notes: transcribedNotes,
      effects: { ...DEFAULT_TRACK_EFFECTS },
    };

    const midiBytes = exportToMidiFile([trackForMidi], project.bpm, 'Transcribed Audio');
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(audioFile?.name || 'transcribed').replace(/\.[^/.]+$/, '')}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- 3. Unified MIDI & SF2 to Audio Synthesis Actions ---
  const handleSynthesizeMidiSf2ToAudio = async (
    customNotes?: Note[],
    customInstrument?: string
  ) => {
    setIsRenderingAudio(true);
    setNotification(null);
    try {
      synth.init();

      // 1. Resolve notes
      let notesToRender: Note[] = [];
      let noteSourceName = '';

      if (customNotes && customNotes.length > 0) {
        notesToRender = customNotes;
        noteSourceName = 'Transcribed Melody';
      } else if (midiSource === 'uploaded_transcribed') {
        if (transcribedNotes.length === 0 && audioBuffer) {
          const freshNotes = transcribeAudioToMidi(audioBuffer, synthBpm, transcriptionSensitivity);
          setTranscribedNotes(freshNotes);
          notesToRender = freshNotes;
        } else {
          notesToRender = transcribedNotes;
        }
        noteSourceName = `Uploaded Audio Melody (${notesToRender.length} notes)`;
      } else if (midiSource.startsWith('track_')) {
        const trackId = midiSource.replace('track_', '');
        const trk = project.tracks.find((t) => t.id === trackId);
        notesToRender = trk?.notes || [];
        noteSourceName = trk ? `DAW Track: ${trk.name}` : 'DAW Track';
      } else if (PRESET_PATTERNS[midiSource]) {
        const root = audioBuffer ? rootPitchOverride : 60;
        notesToRender = PRESET_PATTERNS[midiSource].getNotes(root);
        noteSourceName = PRESET_PATTERNS[midiSource].name;
      }

      if (notesToRender.length === 0) {
        alert('No MIDI notes found to synthesize. Please select a track with notes or upload audio to transcribe.');
        setIsRenderingAudio(false);
        return;
      }

      // 2. Resolve instrument
      const instId = customInstrument || soundbankInstrument;
      let instDisplayName = '';

      if (instId === 'uploaded_stem') {
        if (!audioBuffer) {
          alert('Please upload an audio sample first to use the stem SoundFont soundbank.');
          setIsRenderingAudio(false);
          return;
        }
        synth.registerCustomSample('uploaded_stem', audioBuffer, rootPitchOverride);
        instDisplayName = `Stem: ${sf2InstrumentName || 'Uploaded Audio'} (Root: ${getNoteName(rootPitchOverride)})`;
      } else {
        const custom = sampleManager.getInstrument(instId);
        const preset = SOUNDFONT_PRESETS.find((p) => p.id === instId);
        instDisplayName = custom?.name || preset?.name || instId;
      }

      // 3. Compute duration & render offline
      const maxBeat = Math.max(8, ...notesToRender.map((n) => n.time + n.duration));
      const totalBars = Math.max(2, Math.ceil((maxBeat + 2) / 4));

      const renderTrack: Track = {
        id: 'render-temp-track',
        name: `Synthesized: ${instDisplayName}`,
        instrument: instId as InstrumentId,
        color: '#a855f7',
        volume: 0.9,
        pan: 0,
        muted: false,
        solo: false,
        armed: false,
        notes: notesToRender,
        effects: {
          cutoff: filterCutoff,
          resonance: resonance,
          distortion: 0.0,
          delaySend: 0.15,
          delayTime: 0.35,
          reverbSend: reverbSend,
          attack: 0.01,
          decay: 0.3,
          sustain: 0.8,
          release: 0.35,
        },
      };

      const renderProject: ProjectState = {
        ...project,
        id: 'render-proj',
        title: 'Rendered Audio',
        bpm: synthBpm,
        totalBars: totalBars,
        masterVolume: 0.95,
        tracks: [renderTrack],
        selectedTrackId: renderTrack.id,
      };

      const wavBlob = await synth.renderOffline(renderProject);
      const url = URL.createObjectURL(wavBlob);
      setRenderedWavUrl(url);
      setRenderedNotes(notesToRender);
      setRenderedInstrument(instId);
      setNotification(`✓ Synthesized ${notesToRender.length} notes with "${instDisplayName}" to WAV audio!`);
    } catch (err: any) {
      console.error(err);
      alert('Synthesizer render error: ' + err.message);
    } finally {
      setIsRenderingAudio(false);
    }
  };

  // 1-Click Auto Resynthesizer: seamlessly connects uploaded audio's transcribed MIDI with its own stem SoundFont
  const handleAutoResynthesizeStem = async () => {
    if (!audioBuffer) return;
    synth.registerCustomSample('uploaded_stem', audioBuffer, rootPitchOverride);
    sampleManager.registerInstrument({
      id: 'uploaded_stem',
      name: sf2InstrumentName || `Stem: ${audioFile?.name.replace(/\.[^/.]+$/, '') || 'Audio'}`,
      audioBuffer: audioBuffer,
      rootPitch: rootPitchOverride,
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
    });

    let notes = transcribedNotes;
    if (notes.length === 0) {
      notes = transcribeAudioToMidi(audioBuffer, synthBpm, transcriptionSensitivity);
      setTranscribedNotes(notes);
    }

    setMidiSource('uploaded_transcribed');
    setSoundbankInstrument('uploaded_stem');
    await handleSynthesizeMidiSf2ToAudio(notes, 'uploaded_stem');
  };

  const handleSplitStems = async () => {
    if (!audioBuffer) return;

    setIsSplittingStems(true);
    try {
      const result = await detectAndSplitStemsDynamic(audioBuffer, stemMode);
      setDetectedStems(result);
      setNotification(`✓ Extracted ${result.stems.length} stems via ${result.mode.toUpperCase()} separation!`);
    } catch (err: any) {
      console.error(err);
      alert('Error splitting stems: ' + err.message);
    } finally {
      setIsSplittingStems(false);
    }
  };

  // Add the newly synthesized track to the DAW project
  const handleAddSynthesizedTrackToDaw = () => {
    if (renderedNotes.length === 0) return;

    const instName =
      renderedInstrument === 'uploaded_stem'
        ? `Resynthesized ${audioFile?.name.replace(/\.[^/.]+$/, '') || 'Stem'}`
        : `Synth: ${renderedInstrument}`;

    const newTrack: Track = {
      id: `synth-track-${Date.now()}`,
      name: instName,
      instrument: renderedInstrument as InstrumentId,
      color: '#a855f7',
      volume: 0.85,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      notes: renderedNotes,
      effects: {
        cutoff: filterCutoff,
        resonance: resonance,
        distortion: 0.0,
        delaySend: 0.2,
        delayTime: 0.35,
        reverbSend: reverbSend,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.8,
        release: 0.35,
      },
    };

    onUpdateProject((prev) => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
      selectedTrackId: newTrack.id,
    }));

    setNotification(
      `✓ Added "${newTrack.name}" (${renderedNotes.length} notes) directly to DAW timeline!`
    );
  };

  // TTS Speech to SF2 + MIDI + Stem Handlers
  const handleSynthesizeTts = async () => {
    if (!ttsText.trim()) return;
    setIsSynthesizingTts(true);
    try {
      ensureMeSpeakInitialized();
      const res = await transmuteTtsAllTogether(ttsText.trim(), {
        voice: ttsVoice,
        pitch: ttsPitch,
        speed: ttsSpeed,
        bpm: project.bpm,
        targetMidiRoot: ttsTargetRoot,
        pitchCorrection: ttsCorrection,
      });
      setTtsResult(res);

      // Add instrument to project
      onUpdateProject(prev => {
        const { audioBuffer, ...instrumentWithoutBuffer } = res.sf2Instrument;
        return {
          ...prev,
          customInstruments: [...(prev.customInstruments || []), instrumentWithoutBuffer]
        };
      });
      setNotification(`✓ Transmuted speech! Audio Stem + SF2 Instrument + ${res.transcribedNotes.length} MIDI notes generated.`);

      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      console.error('TTS synthesis error:', err);
      setNotification('TTS error: ' + (err?.message || err));
    } finally {
      setIsSynthesizingTts(false);
    }
  };

  const handleInjectTtsToDaw = () => {
    if (!ttsResult) return;
    onUpdateProject((prev) => {
      const { tracks, totalBars } = injectTtsTracksToProject(ttsResult, prev.tracks, prev.totalBars);
      return {
        ...prev,
        tracks,
        totalBars,
        selectedTrackId: tracks[tracks.length - 1]?.id || prev.selectedTrackId,
      };
    });
    setNotification('✓ Injected Voice Stem track and Playable SF2 Instrument track into DAW timeline!');
    setTimeout(() => setNotification(null), 5000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Audio & SF2 Transmuter</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800/40">
                  sf2.2kool4u.net • midi.2kool4u.net
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Audio upload, SoundFont SF2 synthesis, pitch transcription & offline rendering
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('audio-to-sf2')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'audio-to-sf2'
                ? 'border-sky-400 text-sky-300 bg-sky-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Audio to SF2</span>
          </button>

          <button
            onClick={() => setActiveTab('audio-to-midi')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'audio-to-midi'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Music className="w-4 h-4" />
            <span>Audio to MIDI</span>
          </button>

          <button
            onClick={() => setActiveTab('midi-sf2-to-audio')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'midi-sf2-to-audio'
                ? 'border-purple-400 text-purple-300 bg-purple-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wand2 className="w-4 h-4 text-purple-400" />
            <span>MIDI & SF2 to Audio</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/50 uppercase font-mono font-bold">
              Merged Studio
            </span>
          </button>

          <button
            onClick={() => setActiveTab('audio-to-stems')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'audio-to-stems'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Audio to Stems</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50 uppercase font-mono font-bold">
              AI Splitter
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tts-all-together')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'tts-all-together'
                ? 'border-teal-400 text-teal-300 bg-teal-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="w-4 h-4 text-teal-400" />
            <span>TTS Voice (meSpeak)</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800/50 uppercase font-mono font-bold">
              All Together
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex flex-col gap-5 text-xs">
          {/* Notification Banner */}
          {notification && (
            <div className="p-3 rounded-xl bg-slate-950 border border-sky-800/60 text-sky-300 font-mono text-[11px] flex items-center justify-between">
              <span>{notification}</span>
              <button
                onClick={() => setNotification(null)}
                className="text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          {/* Persistent Audio Dropzone for 'audio-to-sf2' and 'audio-to-midi' */}
          {(activeTab === 'audio-to-sf2' || activeTab === 'audio-to-midi') && (
            <div className="flex flex-col gap-3">
              {/* File Upload Drop Area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleAudioUpload}
                className="border-2 border-dashed border-slate-700/80 hover:border-sky-500/80 rounded-2xl p-4 bg-slate-950/60 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors relative"
              >
                <input
                  type="file"
                  accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
                  onChange={handleAudioUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-sky-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <span className="font-semibold text-slate-200 block text-xs">
                    {audioFile ? audioFile.name : 'Drop audio sample here, or click to upload'}
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Supports WAV, MP3, FLAC, OGG, AIFF, M4A (vocals, instruments, synth hits, loops)
                  </span>
                </div>
              </div>

              {/* Waveform Preview Display */}
              {audioBuffer && (
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTogglePlayAudio}
                        className={`p-1.5 rounded-lg flex items-center gap-1.5 font-sans font-bold text-xs ${
                          isPlayingAudio
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                        }`}
                      >
                        {isPlayingAudio ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{isPlayingAudio ? 'Pause' : 'Audition'}</span>
                      </button>
                      <span>
                        {(audioBuffer?.duration ?? 0).toFixed(2)}s • {audioBuffer.sampleRate}Hz •{' '}
                        {audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo'}
                      </span>
                    </div>

                    {pitchResult && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400 font-bold">
                        <span>Pitch: {pitchResult.noteName}</span>
                        <span className="text-[10px] text-slate-500">
                          ({pitchResult.frequency}Hz, {Math.round(pitchResult.confidence * 100)}% conf)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Audio Bar Count & Length Telemetry */}
                  {(() => {
                    const durationSec = audioBuffer?.duration ?? 0;
                    const beats = (durationSec * (project.bpm || 120)) / 60;
                    const requiredBars = Math.max(1, Math.ceil(beats / 4));
                    return (
                      <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-emerald-400 font-bold">Audio Metrics:</span>
                          <span className="text-slate-300">
                            {durationSec.toFixed(2)}s = <strong className="text-cyan-300">{beats.toFixed(1)} beats</strong> @ {project.bpm} BPM (<strong className="text-purple-300">{requiredBars} bars</strong>)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSyncProjectBarsToAudio}
                            className="px-2.5 py-1 rounded-md bg-purple-600/90 hover:bg-purple-500 text-white font-bold text-[11px] transition-colors"
                            title={`Set project totalBars to ${requiredBars}`}
                          >
                            Sync Project to {requiredBars} Bars
                          </button>
                          <button
                            onClick={handleAddAudioStemTrackToDaw}
                            className="px-2.5 py-1 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] flex items-center gap-1 transition-colors"
                            title="Add input audio as stem track and fit project bar count"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Add as Stem Track</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="h-20 w-full relative rounded-lg overflow-hidden border border-slate-800/80">
                    <canvas
                      ref={waveformCanvasRef}
                      width={680}
                      height={80}
                      className="w-full h-full block"
                    />
                    {/* Playback progress cursor */}
                    {isPlayingAudio && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)] pointer-events-none"
                        style={{ left: `${playbackProgress * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: AUDIO TO SF2 */}
          {activeTab === 'audio-to-sf2' && (
            <div className="flex flex-col gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span>SoundFont Instrument Parameter Configurator</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-[11px] block mb-1">
                      SF2 Instrument Name:
                    </label>
                    <input
                      type="text"
                      value={sf2InstrumentName}
                      onChange={(e) => setSf2InstrumentName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-400 text-[11px] block">
                        Root Pitch Key (Center Frequency):
                      </label>
                      {pitchResult && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                            rootPitchOverride === pitchResult.midiPitch
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                              : 'bg-amber-950/60 text-amber-300 border-amber-800/40'
                          }`}
                        >
                          {rootPitchOverride === pitchResult.midiPitch
                            ? `✓ Auto-Synced (${pitchResult.noteName})`
                            : `Shifted (Auto was ${pitchResult.noteName})`}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={rootPitchOverride}
                        onChange={(e) => setRootPitchOverride(parseInt(e.target.value))}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none font-mono text-xs"
                      >
                        {Array.from({ length: 11 }).map((_, oct) => {
                          const startPitch = oct * 12;
                          if (startPitch > 127) return null;
                          const octaveLabel = `Octave ${oct - 1} (MIDI ${startPitch}–${Math.min(127, startPitch + 11)})`;
                          return (
                            <optgroup key={oct} label={octaveLabel}>
                              {Array.from({ length: 12 }).map((_, n) => {
                                const p = startPitch + n;
                                if (p > 127) return null;
                                return (
                                  <option key={p} value={p}>
                                    {getNoteName(p)} — MIDI {p}
                                  </option>
                                );
                              })}
                            </optgroup>
                          );
                        })}
                      </select>

                      {/* Octave Shifter & Auto Reset Buttons */}
                      <button
                        onClick={() => setRootPitchOverride((p) => Math.max(0, p - 12))}
                        className="px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                        title="Shift down 1 octave (-12 semitones)"
                      >
                        -12
                      </button>

                      {pitchResult && (
                        <button
                          onClick={() => setRootPitchOverride(pitchResult.midiPitch)}
                          className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                            rootPitchOverride === pitchResult.midiPitch
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'bg-slate-800 hover:bg-slate-700 text-sky-400'
                          }`}
                          title={`Reset to detected root pitch: ${pitchResult.noteName} (${pitchResult.frequency}Hz)`}
                        >
                          Auto ({pitchResult.noteName})
                        </button>
                      )}

                      <button
                        onClick={() => setRootPitchOverride((p) => Math.min(127, p + 12))}
                        className="px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
                        title="Shift up 1 octave (+12 semitones)"
                      >
                        +12
                      </button>
                    </div>
                  </div>
                </div>

                {pitchResult && (
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
                    <span className="text-slate-400">YIN Pitch Engine:</span>
                    <span className="text-sky-400 font-bold font-mono">
                      Detected: {pitchResult.noteName} ({pitchResult.frequency} Hz)
                    </span>
                    <span className="text-slate-400 font-mono">
                      Detuning: {pitchResult.cents > 0 ? `+${pitchResult.cents}` : pitchResult.cents} cents
                    </span>
                    <span className="text-emerald-400 font-mono">
                      Confidence: {Math.round(pitchResult.confidence * 100)}%
                    </span>
                  </div>
                )}

                <p className="text-[11px] text-slate-400">
                  When registered, this sample is mathematically resampled across all 128 keys so you can play chords, melodies, and arpeggios seamlessly across the entire piano roll and timeline!
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleRegisterSf2InDaw}
                  disabled={!audioBuffer}
                  className="px-4 py-2.5 rounded-xl font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-sky-500/20 disabled:opacity-50 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register & Play in DAW</span>
                </button>

                <button
                  onClick={handleDownloadSf2Binary}
                  disabled={!audioBuffer}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-2 disabled:opacity-50 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .SF2 SoundFont File</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: AUDIO TO MIDI */}
          {activeTab === 'audio-to-midi' && (
            <div className="flex flex-col gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2">
                    <Music className="w-4 h-4 text-emerald-400" />
                    <span>Pitch & Onset Transcription</span>
                  </h3>
                  <span className="font-mono text-emerald-400 text-xs font-bold">
                    {transcribedNotes.length} notes transcribed
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                    <span>Onset Detection Sensitivity:</span>
                    <span>{Math.round(transcriptionSensitivity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={transcriptionSensitivity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTranscriptionSensitivity(val);
                      if (audioBuffer) {
                        const newNotes = transcribeAudioToMidi(audioBuffer, project.bpm, val);
                        setTranscribedNotes(newNotes);
                      }
                    }}
                    className="w-full h-1.5 accent-emerald-400 cursor-pointer"
                  />
                </div>

                {/* Note preview roll */}
                <div className="bg-slate-900 rounded-lg p-3 max-h-36 overflow-y-auto flex flex-wrap gap-1.5 border border-slate-800">
                  {transcribedNotes.length === 0 ? (
                    <span className="text-slate-500 text-center w-full py-4">
                      Upload audio to transcribe melodies or drum hits into notes
                    </span>
                  ) : (
                    transcribedNotes.map((n, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                        style={{
                          backgroundColor: `${getPitchColor(n.pitch)}33`,
                          color: getPitchColor(n.pitch),
                          border: `1px solid ${getPitchColor(n.pitch)}66`,
                        }}
                      >
                        {getNoteName(n.pitch)} @ Beat {n.time}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleAddMidiTrackToDaw}
                  disabled={transcribedNotes.length === 0}
                  className="px-4 py-2.5 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Transcribed Track to DAW</span>
                </button>

                <button
                  onClick={handleDownloadTranscribedMidi}
                  disabled={transcribedNotes.length === 0}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-2 disabled:opacity-50 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Transcribed .MID File</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: MERGED MIDI & SF2 TO AUDIO STUDIO */}
          {activeTab === 'midi-sf2-to-audio' && (
            <div className="flex flex-col gap-5">
              {/* Top Quick-Action Resynthesizer Banner */}
              {audioBuffer ? (
                <div className="p-4 rounded-xl border border-purple-500/40 bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-purple-950/30">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                        <Wand2 className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-slate-100 text-xs tracking-wide">
                        1-Click Neural Resynthesizer (Transcribed Melody × Stem SoundFont)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 max-w-xl leading-relaxed">
                      Auto-pairs the uploaded audio's transcribed melody ({transcribedNotes.length} notes) directly with its extracted stem soundbank (Root: <span className="font-mono text-sky-400 font-semibold">{getNoteName(rootPitchOverride)}</span>, {pitchResult?.cents ?? 0} cents) to synthesize a pristine, pitch-corrected studio WAV.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono text-purple-300">
                        🎵 {transcribedNotes.length} Transcribed Notes
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono text-sky-300">
                        📦 Stem: {sf2InstrumentName || audioFile?.name}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono text-amber-300">
                        ⏱️ {(audioBuffer?.duration ?? 0).toFixed(2)}s Sample
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleAutoResynthesizeStem}
                    disabled={isRenderingAudio}
                    className="px-4 py-2.5 rounded-xl font-bold bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-purple-500/25 shrink-0 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRenderingAudio ? 'animate-spin' : ''}`} />
                    <span>{isRenderingAudio ? 'Synthesizing...' : '⚡ Auto-Resynthesize Stem Audio'}</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-400">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-900 text-slate-400">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-slate-200 font-semibold text-xs">
                        Upload audio to enable 1-Click Auto Resynthesis
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Upload an audio sample above to extract its transcribed MIDI melody and generate its stem SoundFont soundbank automatically.
                      </p>
                    </div>
                  </div>
                  <label className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs cursor-pointer transition-colors shrink-0">
                    <span>Upload Audio Sample</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Dual-Column Source Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column 1: MIDI Notes Input */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2">
                      <Music className="w-4 h-4 text-emerald-400" />
                      <span>1. MIDI Note Sequence</span>
                    </label>
                    {midiSource === 'uploaded_transcribed' && audioBuffer && (
                      <button
                        onClick={() => {
                          const fresh = transcribeAudioToMidi(audioBuffer, synthBpm, transcriptionSensitivity);
                          setTranscribedNotes(fresh);
                          setNotification(`✓ Re-transcribed audio into ${fresh.length} MIDI notes`);
                        }}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 underline"
                      >
                        Re-transcribe
                      </button>
                    )}
                  </div>

                  <div>
                    <select
                      value={midiSource}
                      onChange={(e) => setMidiSource(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none font-medium text-xs"
                    >
                      {audioBuffer && (
                        <optgroup label="Uploaded Audio Stem Melody">
                          <option value="uploaded_transcribed">
                            🎵 Transcribed Audio Melody ({transcribedNotes.length} notes)
                          </option>
                        </optgroup>
                      )}
                      <optgroup label="DAW Project Tracks">
                        {project.tracks.map((t) => (
                          <option key={t.id} value={`track_${t.id}`}>
                            🎹 {t.name} ({t.notes.length} notes) • {t.instrument}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Musical Showcase Sequences">
                        {Object.entries(PRESET_PATTERNS).map(([key, pat]) => (
                          <option key={key} value={key}>
                            ✨ {pat.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Sequence Telemetry Box */}
                  {(() => {
                    let notes: Note[] = [];
                    if (midiSource === 'uploaded_transcribed') notes = transcribedNotes;
                    else if (midiSource.startsWith('track_')) {
                      const t = project.tracks.find((trk) => trk.id === midiSource.replace('track_', ''));
                      notes = t?.notes || [];
                    } else if (PRESET_PATTERNS[midiSource]) {
                      notes = PRESET_PATTERNS[midiSource].getNotes(audioBuffer ? rootPitchOverride : 60);
                    }

                    const minPitch = notes.length > 0 ? Math.min(...notes.map((n) => n.pitch)) : 60;
                    const maxPitch = notes.length > 0 ? Math.max(...notes.map((n) => n.pitch)) : 60;
                    const maxBeat = notes.length > 0 ? Math.max(...notes.map((n) => n.time + n.duration)) : 0;

                    return (
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 flex flex-col gap-1 text-[11px]">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Total Notes:</span>
                          <span className="font-mono text-emerald-400 font-bold">{notes.length}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Pitch Range:</span>
                          <span className="font-mono text-slate-200">
                            {notes.length > 0 ? `${getNoteName(minPitch)} (${minPitch}) → ${getNoteName(maxPitch)} (${maxPitch})` : 'None'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Length:</span>
                          <span className="font-mono text-slate-200">
                            {(maxBeat || 0).toFixed(1)} beats (~{Math.ceil((maxBeat || 0) / 4)} bars)
                          </span>
                        </div>
                        {midiSource === 'uploaded_transcribed' && notes.length === 0 && audioBuffer && (
                          <button
                            onClick={() => {
                              const notes = transcribeAudioToMidi(audioBuffer, synthBpm, transcriptionSensitivity);
                              setTranscribedNotes(notes);
                            }}
                            className="mt-1 w-full py-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold text-[10px] hover:bg-emerald-500/30"
                          >
                            Extract MIDI Notes from Audio Now
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Column 2: SoundFont / Soundbank Instrument */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <span>2. SoundFont / Soundbank Instrument</span>
                    </label>
                    <span className="text-[10px] text-purple-400 font-mono">128-Key Resampling</span>
                  </div>

                  <div>
                    <select
                      value={soundbankInstrument}
                      onChange={(e) => setSoundbankInstrument(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 outline-none font-medium text-xs"
                    >
                      {audioBuffer && (
                        <optgroup label="Uploaded Audio Stem Soundbank">
                          <option value="uploaded_stem">
                            📦 Stem: {sf2InstrumentName || audioFile?.name} (Root: {getNoteName(rootPitchOverride)})
                          </option>
                        </optgroup>
                      )}
                      {sampleManager.getAllInstruments().filter((i) => i.id !== 'uploaded_stem').length > 0 && (
                        <optgroup label="Custom Registered SoundFonts">
                          {sampleManager
                            .getAllInstruments()
                            .filter((i) => i.id !== 'uploaded_stem')
                            .map((ci) => (
                              <option key={ci.id} value={ci.id}>
                                💾 {ci.name} (Root: {getNoteName(ci.rootPitch)})
                              </option>
                            ))}
                        </optgroup>
                      )}
                      <optgroup label="Standard SoundFont Presets">
                        {SOUNDFONT_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            🎹 {p.name} ({p.category})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Instrument Telemetry Box */}
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 flex flex-col gap-1 text-[11px]">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Sound Source:</span>
                      <span className="font-mono text-purple-300 font-semibold">
                        {soundbankInstrument === 'uploaded_stem'
                          ? 'Uploaded Audio Stem (In-Memory SF2)'
                          : SOUNDFONT_PRESETS.find((p) => p.id === soundbankInstrument)?.name || soundbankInstrument}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Root Key:</span>
                      <span className="font-mono text-slate-200">
                        {soundbankInstrument === 'uploaded_stem'
                          ? `${getNoteName(rootPitchOverride)} (${rootPitchOverride}) • ${pitchResult?.cents ?? 0} cents`
                          : 'Sample Default (C4 / 60)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Key Mapping:</span>
                      <span className="font-mono text-slate-300">
                        C-1 (0) to G9 (127) with real-time pitch ratio shift
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Acoustic Shaping & Render Parameters */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <span>3. Acoustic Shaping & DSP Controls</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    32-bit Floating Point DSP • 44.1kHz Stereo
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* BPM */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Tempo:</span>
                      <span className="font-mono text-sky-400 font-bold">{synthBpm} BPM</span>
                    </div>
                    <input
                      type="number"
                      min={40}
                      max={240}
                      value={synthBpm}
                      onChange={(e) => setSynthBpm(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-mono outline-none"
                    />
                  </div>

                  {/* Filter Cutoff */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Lowpass Cutoff:</span>
                      <span className="font-mono text-sky-400 font-bold">{filterCutoff} Hz</span>
                    </div>
                    <input
                      type="range"
                      min={400}
                      max={18000}
                      step={100}
                      value={filterCutoff}
                      onChange={(e) => setFilterCutoff(Number(e.target.value))}
                      className="accent-sky-500 cursor-pointer h-2 bg-slate-900 rounded-lg mt-1"
                    />
                  </div>

                  {/* Resonance */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Resonance (Q):</span>
                      <span className="font-mono text-sky-400 font-bold">{(resonance ?? 1.0).toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={8.0}
                      step={0.1}
                      value={resonance ?? 1.0}
                      onChange={(e) => setResonance(Number(e.target.value))}
                      className="accent-sky-500 cursor-pointer h-2 bg-slate-900 rounded-lg mt-1"
                    />
                  </div>

                  {/* Reverb Send */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Reverb Ambience:</span>
                      <span className="font-mono text-sky-400 font-bold">{Math.round(reverbSend * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1.0}
                      step={0.05}
                      value={reverbSend}
                      onChange={(e) => setReverbSend(Number(e.target.value))}
                      className="accent-sky-500 cursor-pointer h-2 bg-slate-900 rounded-lg mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Render Primary Action */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleSynthesizeMidiSf2ToAudio()}
                  disabled={isRenderingAudio}
                  className="px-5 py-3 rounded-xl font-bold bg-purple-500 hover:bg-purple-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all cursor-pointer text-xs"
                >
                  <RefreshCw className={`w-4 h-4 ${isRenderingAudio ? 'animate-spin' : ''}`} />
                  <span>
                    {isRenderingAudio
                      ? 'Synthesizing with 32-bit Float DSP...'
                      : '⚡ Synthesize Selected MIDI & SoundFont to Audio (WAV)'}
                  </span>
                </button>
              </div>

              {/* Rendered Output Player & Studio Integration */}
              {renderedWavUrl && (
                <div className="p-4 rounded-xl border border-purple-500/50 bg-slate-950 flex flex-col gap-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileAudio className="w-4 h-4 text-purple-400" />
                      <span className="font-bold text-slate-200 text-xs">
                        Synthesized WAV Audio Output
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/40">
                        {renderedNotes.length} notes rendered
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        44.1kHz Stereo
                      </span>
                    </div>
                  </div>

                  <audio src={renderedWavUrl} controls className="w-full h-10 rounded-lg" />

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <a
                      href={renderedWavUrl}
                      download={`synthesized_${renderedInstrument}_${Date.now()}.wav`}
                      className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download WAV Audio</span>
                    </a>

                    <button
                      onClick={handleAddSynthesizedTrackToDaw}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer text-xs"
                    >
                      <Plus className="w-4 h-4 text-purple-400" />
                      <span>Add as Track to DAW Project</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIO TO STEMS */}
          {activeTab === 'audio-to-stems' && (
            <div className="flex flex-col gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <span>Studio STEM Separation (Frequency Crossover & Phase Isolation)</span>
                  </h3>
                  <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full font-mono">
                    High-Fidelity Offline Audio Engine
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Isolate audio into distinct, uncompressed stereo tracks with accurate transient retention, bass filtering, and center-vocal formant extraction. Stems can be auditioned immediately or inserted directly into the DAW timeline as playable synchronized audio tracks.
                </p>

                {/* Separation Mode Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-300">Separation Algorithm Mode:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setStemMode('4-stem')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        stemMode === '4-stem'
                          ? 'bg-indigo-950/60 border-indigo-500 text-indigo-100 shadow-md shadow-indigo-500/10'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">4-Stem Studio</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-900/80 text-indigo-300 font-mono">Pro</span>
                      </div>
                      <span className="text-[10px] opacity-80">
                        Drums, Bass/Sub, Vocals/Lead & Instruments/Atmosphere.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStemMode('2-stem')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        stemMode === '2-stem'
                          ? 'bg-indigo-950/60 border-indigo-500 text-indigo-100 shadow-md shadow-indigo-500/10'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">2-Stem Acapella / Karaoke</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-900/80 text-cyan-300 font-mono">Vocal</span>
                      </div>
                      <span className="text-[10px] opacity-80">
                        Isolated Lead Vocals & Instrumental Backing mix.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStemMode('spatial')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        stemMode === 'spatial'
                          ? 'bg-indigo-950/60 border-indigo-500 text-indigo-100 shadow-md shadow-indigo-500/10'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">Spatial Pan Ensemble</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-900/80 text-fuchsia-300 font-mono">Surround</span>
                      </div>
                      <span className="text-[10px] opacity-80">
                        Angular pan-histogram multi-channel stem separation.
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleSplitStems}
                    disabled={isSplittingStems || !audioBuffer}
                    className="px-5 py-2.5 rounded-xl font-bold bg-indigo-500 hover:bg-indigo-400 text-slate-950 flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all cursor-pointer text-xs"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSplittingStems ? 'animate-spin' : ''}`} />
                    <span>
                      {isSplittingStems ? 'Analyzing & Separating Audio Stems...' : '⚡ Split to Stems'}
                    </span>
                  </button>
                  {!audioBuffer && (
                    <span className="text-xs text-amber-400">Please upload an audio file first.</span>
                  )}
                </div>

                {detectedStems && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-slate-200 text-xs">
                          Separated Stems ({detectedStems.stems.length} channels ready)
                        </span>
                      </div>
                      <button
                        onClick={handleAddAllStemsToDaw}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold flex items-center gap-1.5 text-xs transition-colors cursor-pointer shadow-md"
                        title="Create separate DAW tracks for each separated stem and fit project bar count"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add All Stems to DAW (Auto-fits Bars)</span>
                      </button>
                    </div>

                    {detectedStems.multiChannelUrl && (
                      <div className="p-3.5 rounded-xl border border-fuchsia-500/40 bg-slate-900/90 flex flex-col gap-2 shadow-lg">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-fuchsia-400" />
                            <span className="font-bold text-slate-200 text-xs">Full Multi-Channel Stem Package (Surround / WavPack)</span>
                          </div>
                          <a
                            href={detectedStems.multiChannelUrl}
                            download={`stems_multichannel_${detectedStems.ensembleSize}ch.wav`}
                            className="px-3 py-1.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-950 font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
                          >
                            <Download className="w-3.5 h-3.5" /> Download Multi-Channel WAV
                          </a>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {detectedStems.stems.map((stem, index) => (
                        <div
                          key={stem.id}
                          className="p-3.5 rounded-xl border border-slate-800 bg-slate-900 flex flex-col gap-2.5 shadow-md transition-all hover:border-slate-700"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: stem.color || '#6366f1' }}
                              />
                              <span className="font-bold text-slate-200 text-xs">{stem.name}</span>
                            </div>
                            <button
                              onClick={() => handleAddStemToDaw(stem)}
                              className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                              title="Add this single stem as a DAW track"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add to DAW</span>
                            </button>
                          </div>

                          {/* Mini Waveform Visualization */}
                          <StemWaveform buffer={stem.buffer} color={stem.color || '#38bdf8'} />

                          <audio src={stem.url} controls className="w-full h-8 rounded-lg" />

                          <div className="flex justify-end pt-1">
                            <a
                              href={stem.url}
                              download={`${stem.id}.wav`}
                              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer text-[11px]"
                            >
                              <Download className="w-3 h-3" /> Download Stem WAV
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: TTS All Together (meSpeak -> SF2 + MIDI + Audio Stem) */}
          {activeTab === 'tts-all-together' && (
            <div className="flex flex-col gap-6">
              {/* Introduction Card */}
              <div className="p-4 rounded-xl bg-teal-950/20 border border-teal-800/40 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                  <Mic className="w-4 h-4 text-teal-400" />
                  <span>meSpeak Text-To-Speech → SF2, MIDI & Stem Transmuter</span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Synthesize vocal phrases directly in the browser via meSpeak. Automatically packages the voice into a
                  playable <strong>SoundFont SF2</strong> instrument, transcribes syllabic rhythms into melodic <strong>MIDI notes</strong>,
                  and places a high-fidelity <strong>Audio Stem</strong> onto the timeline all together.
                </p>
              </div>

              {/* TTS Input Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left 2 Cols: Text Prompt & Voice Settings */}
                <div className="lg:col-span-2 flex flex-col gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-300 font-semibold text-xs flex items-center justify-between">
                      <span>Speech Text Prompt</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {ttsText.length} characters
                      </span>
                    </label>
                    <textarea
                      value={ttsText}
                      onChange={(e) => setTtsText(e.target.value)}
                      placeholder="Type what you want the meSpeak vocal synthesizer to vocalize..."
                      rows={3}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono text-xs focus:border-teal-500 focus:outline-none resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Voice Select */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-300 font-semibold text-xs">Voice Profile</label>
                      <select
                        value={ttsVoice}
                        onChange={(e) => setTtsVoice(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:border-teal-500 focus:outline-none"
                      >
                        {MESPEAK_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.lang.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tuning / Pitch Correction Mode */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-300 font-semibold text-xs">Vocal Processing Style</label>
                      <select
                        value={ttsCorrection}
                        onChange={(e: any) => setTtsCorrection(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:border-teal-500 focus:outline-none"
                      >
                        <option value="auto-tune">Auto-Tune Melodic (Musical Quantization)</option>
                        <option value="vocoder-robot">Robot Vocoder (Precision Fixed Root)</option>
                        <option value="natural">Natural Acoustic (Raw meSpeak Microtonal)</option>
                      </select>
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="flex flex-col gap-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Speed</span>
                        <span className="font-mono text-teal-300">{ttsSpeed} WPM</span>
                      </div>
                      <input
                        type="range"
                        min="80"
                        max="260"
                        step="5"
                        value={ttsSpeed}
                        onChange={(e) => setTtsSpeed(Number(e.target.value))}
                        className="accent-teal-500 h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    <div className="flex flex-col gap-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Voice Pitch</span>
                        <span className="font-mono text-teal-300">{ttsPitch}</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="90"
                        step="1"
                        value={ttsPitch}
                        onChange={(e) => setTtsPitch(Number(e.target.value))}
                        className="accent-teal-500 h-1.5 bg-slate-800 rounded-lg"
                      />
                    </div>

                    <div className="flex flex-col gap-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Root Key</span>
                        <span className="font-mono text-teal-300">
                          {getNoteName(ttsTargetRoot)} ({ttsTargetRoot})
                        </span>
                      </div>
                      <select
                        value={ttsTargetRoot}
                        onChange={(e) => setTtsTargetRoot(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-700 rounded p-1 text-[11px] text-slate-200"
                      >
                        {[36, 48, 53, 55, 57, 60, 62, 64, 65, 67, 69, 72].map((pitch) => (
                          <option key={pitch} value={pitch}>
                            {getNoteName(pitch)} (MIDI {pitch})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleSynthesizeTts}
                      disabled={isSynthesizingTts || !ttsText.trim()}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isSynthesizingTts ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Synthesizing Voice & Generating All...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Synthesize & Transmute All Together</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Right Col: Feature Overview & Quick Presets */}
                <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="font-bold text-slate-200 text-xs">Pipeline Outputs</span>
                  <div className="flex flex-col gap-2 text-[11px] text-slate-400">
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                      <Volume2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span><strong>Audio Stem:</strong> Decoded 44.1kHz speech waveform</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span><strong>SoundFont SF2:</strong> Playable instrument on any MIDI octave</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                      <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span><strong>MIDI Notes:</strong> Syllable-transcribed rhythms and pitches</span>
                    </div>
                  </div>

                  <span className="font-bold text-slate-200 text-xs pt-1">Sample Phrases</span>
                  <div className="flex flex-col gap-1.5">
                    {[
                      'Drop the bass right here in the mix',
                      'Futuristic cyberspace hyper workstation',
                      'One two three four break the rhythm down',
                    ].map((phrase, idx) => (
                      <button
                        key={idx}
                        onClick={() => setTtsText(phrase)}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800/80 text-slate-300 hover:text-white text-[11px] truncate transition-colors"
                      >
                        "{phrase}"
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* TTS Result Inspection & DAW Injection */}
              {ttsResult && (
                <div className="p-5 rounded-xl bg-slate-950 border border-teal-800/50 flex flex-col gap-4 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-teal-400 animate-pulse" />
                      <div>
                        <h4 className="font-bold text-slate-100 text-sm">
                          Synthesized Vocal Ensemble Ready
                        </h4>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Duration: {ttsResult.durationSec.toFixed(2)}s • {ttsResult.durationBeats.toFixed(1)} beats •{' '}
                          {ttsResult.transcribedNotes.length} Syllables
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleInjectTtsToDaw}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-500/20 transition-all cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Inject All to DAW</span>
                      </button>
                    </div>
                  </div>

                  {/* Waveform & Audio Player */}
                  <div className="flex flex-col gap-2">
                    <StemWaveform buffer={ttsResult.audioBuffer} color="#14b8a6" />
                    <audio src={ttsResult.audioStem.url} controls className="w-full h-8 rounded-lg" />
                  </div>

                  {/* Export Options Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    {/* Stem WAV */}
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between gap-2">
                      <div>
                        <div className="font-bold text-teal-300 text-xs flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Voice WAV Stem</span>
                        </div>
                        <p className="text-[11px] text-slate-400">Direct 44.1kHz raw speech audio</p>
                      </div>
                      <a
                        href={ttsResult.audioStem.url}
                        download={`${ttsResult.audioStem.id}.wav`}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold flex items-center justify-center gap-1.5 text-xs transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Download WAV
                      </a>
                    </div>

                    {/* SoundFont SF2 */}
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between gap-2">
                      <div>
                        <div className="font-bold text-sky-300 text-xs flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          <span>SoundFont SF2</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {ttsResult.customInstrument.name} (Root {ttsResult.customInstrument.rootPitch})
                        </p>
                      </div>
                      <a
                        href={ttsResult.sf2DownloadUrl}
                        download={ttsResult.sf2FileName}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold flex items-center justify-center gap-1.5 text-xs transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Download SF2
                      </a>
                    </div>

                    {/* MIDI Syllables */}
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between gap-2">
                      <div>
                        <div className="font-bold text-purple-300 text-xs flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5" />
                          <span>Syllable MIDI File</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {ttsResult.transcribedNotes.length} transcribed notes
                        </p>
                      </div>
                      <a
                        href={ttsResult.midiDownloadUrl}
                        download={ttsResult.midiFileName}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold flex items-center justify-center gap-1.5 text-xs transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Download MIDI
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            AuraVision Multi-Format Converter Engine
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
