import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Shuffle,
  Sparkles,
  X,
  Play,
  Square,
  Upload,
  Download,
  Plus,
  RefreshCw,
  FileAudio,
  Piano,
  Layers,
  Check,
  Music,
  Sliders,
  Clock,
} from 'lucide-react';
import { ProjectState, Track, Note, AudioStem } from '../types/daw';
import { DEFAULT_TRACK_EFFECTS, getNoteName } from '../audio/constants';
import {
  applyDistortion,
  processGlitchStutter,
  mashAudio,
  decodeAudioFile,
  audioBufferToWavBlob,
} from '../audio/audioProcessor';
import { synth } from '../audio/synthEngine';
import { saveAudioData } from '../utils/audioPersistence';

export type TransmutationMode = 'distort' | 'masterworks' | 'musicmash';
export type TransmutationSourceType = 'pianoroll' | 'timeline' | 'upload';

interface TransmutationProcessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: TransmutationMode;
  project: ProjectState;
  timelineSelection: { startBeat: number; endBeat: number } | null;
  initialSource?: TransmutationSourceType;
  onInjectTrack: (track: Track, insertAtBeat?: number) => void;
  onReplaceTrackStem?: (trackId: string, stem: AudioStem) => void;
}

export const TransmutationProcessorModal: React.FC<TransmutationProcessorModalProps> = ({
  isOpen,
  onClose,
  mode,
  project,
  timelineSelection,
  initialSource,
  onInjectTrack,
  onReplaceTrackStem,
}) => {
  if (!isOpen) return null;

  // Active source tab
  const activeTrack =
    project.tracks.find((t) => t.id === project.selectedTrackId) || project.tracks[0];
  const hasSelectedNotes = activeTrack?.notes?.some((n) => n.selected);

  const [sourceType, setSourceType] = useState<TransmutationSourceType>(
    initialSource || (hasSelectedNotes ? 'pianoroll' : timelineSelection ? 'timeline' : 'timeline')
  );

  // Piano roll options
  const [pianoRollTrackId, setPianoRollTrackId] = useState<string>(activeTrack?.id || project.tracks[0]?.id);
  const [useSelectedNotesOnly, setUseSelectedNotesOnly] = useState<boolean>(Boolean(hasSelectedNotes));

  // Timeline options
  const [timelineTrackId, setTimelineTrackId] = useState<string>(
    activeTrack?.id || 'all_tracks'
  );
  const totalBeats = project.totalBars * 4;
  const [startBeat, setStartBeat] = useState<number>(timelineSelection?.startBeat ?? 0);
  const [endBeat, setEndBeat] = useState<number>(timelineSelection?.endBeat ?? Math.min(16, totalBeats));

  // Uploaded files
  const [uploadedFiles, setUploadedFiles] = useState<{ file: File; buffer: AudioBuffer }[]>([]);
  const [selectedUploadIdx, setSelectedUploadIdx] = useState<number>(0);

  // Multi-input for MusicMash
  const [mashSourceTrackIds, setMashSourceTrackIds] = useState<string[]>(() => {
    const stemTracks = project.tracks.filter((t) => t.audioStem?.buffer).map((t) => t.id);
    return stemTracks.length > 0 ? stemTracks : project.tracks.slice(0, 2).map((t) => t.id);
  });
  const [includeUploadsInMash, setIncludeUploadsInMash] = useState(true);

  // DSP Parameters
  // Distort
  const [distortAmount, setDistortAmount] = useState<number>(0.65);
  const [distortMode, setDistortMode] = useState<'dynamic' | 'tube' | 'fuzz' | 'bitcrush'>('dynamic');
  const [distortGain, setDistortGain] = useState<number>(1.0);

  // MasterWorks
  const [glitchDivision, setGlitchDivision] = useState<number>(0.5); // 0.5 = 8th note
  const [glitchMultiplier, setGlitchMultiplier] = useState<number>(2);
  const [glitchShuffleChance, setGlitchShuffleChance] = useState<number>(0.35);
  const [glitchReverseChance, setGlitchReverseChance] = useState<number>(0.15);

  // MusicMash
  const [mashSliceBeats, setMashSliceBeats] = useState<number>(1);
  const [mashPattern, setMashPattern] = useState<'random' | 'pingpong' | 'chaos'>('random');

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [inputBuffer, setInputBuffer] = useState<AudioBuffer | null>(null);
  const [inputBufferLabel, setInputBufferLabel] = useState<string>('');
  const [outputBuffer, setOutputBuffer] = useState<AudioBuffer | null>(null);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Audio Preview Player
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stop playback on unmount or buffer change
  const stopPreview = () => {
    if (activeSourceNodeRef.current) {
      try {
        activeSourceNodeRef.current.stop();
        activeSourceNodeRef.current.disconnect();
      } catch (e) {}
      activeSourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  // Update input buffer when source settings change
  const loadInputFromSource = async () => {
    stopPreview();
    setIsProcessing(true);
    try {
      synth.init();
      const bpm = project.bpm || 120;

      if (mode === 'musicmash') {
        // Collect multiple buffers for mash
        const buffers: AudioBuffer[] = [];
        const trackLabels: string[] = [];

        for (const trackId of mashSourceTrackIds) {
          const track = project.tracks.find((t) => t.id === trackId);
          if (!track) continue;

          if (track.audioStem?.buffer) {
            buffers.push(track.audioStem.buffer);
            trackLabels.push(track.name);
          } else if (track.notes.length > 0) {
            const rendered = await synth.renderNotesToAudioBuffer(track, track.notes, bpm);
            buffers.push(rendered.buffer);
            trackLabels.push(`${track.name} (MIDI)`);
          }
        }

        if (includeUploadsInMash && uploadedFiles.length > 0) {
          for (const uf of uploadedFiles) {
            buffers.push(uf.buffer);
            trackLabels.push(uf.file.name);
          }
        }

        if (buffers.length === 0) {
          // Fallback to active track
          if (activeTrack?.audioStem?.buffer) {
            buffers.push(activeTrack.audioStem.buffer);
          } else if (activeTrack?.notes?.length) {
            const r = await synth.renderNotesToAudioBuffer(activeTrack, activeTrack.notes, bpm);
            buffers.push(r.buffer);
          }
        }

        if (buffers.length > 0) {
          setInputBuffer(buffers[0]); // Reference buffer
          setInputBufferLabel(`${buffers.length} Sources: ${trackLabels.join(', ')}`);
        }
      } else if (sourceType === 'pianoroll') {
        const prTrack = project.tracks.find((t) => t.id === pianoRollTrackId) || activeTrack;
        if (!prTrack) throw new Error('No track selected');

        const notesToRender =
          useSelectedNotesOnly && prTrack.notes.some((n) => n.selected)
            ? prTrack.notes.filter((n) => n.selected)
            : prTrack.notes;

        if (notesToRender.length === 0) {
          throw new Error(`Track "${prTrack.name}" has no notes to render.`);
        }

        const rendered = await synth.renderNotesToAudioBuffer(prTrack, notesToRender, bpm);
        setInputBuffer(rendered.buffer);
        setInputBufferLabel(
          `🎹 ${prTrack.name} • ${notesToRender.length} Notes (${rendered.durationBeats.toFixed(1)} Beats)`
        );
      } else if (sourceType === 'timeline') {
        if (timelineTrackId === 'all_tracks') {
          // Render mixdown of all tracks in range
          const rendered = await synth.renderTimelineRangeToAudioBuffer(
            project.tracks,
            startBeat,
            endBeat,
            bpm
          );
          setInputBuffer(rendered);
          setInputBufferLabel(
            `⏱️ Timeline Mixdown • Beats ${startBeat} - ${endBeat} (${(endBeat - startBeat).toFixed(1)} Beats)`
          );
        } else {
          const track = project.tracks.find((t) => t.id === timelineTrackId) || activeTrack;
          if (!track) throw new Error('Track not found');

          if (track.audioStem?.buffer) {
            const beatSec = 60 / bpm;
            const startSec = startBeat * beatSec;
            const endSec = endBeat * beatSec;
            const sliced = synth.sliceAudioBuffer(track.audioStem.buffer, startSec, endSec);
            setInputBuffer(sliced);
            setInputBufferLabel(
              `⏱️ ${track.name} (Audio Stem) • Beats ${startBeat} - ${endBeat}`
            );
          } else if (track.notes.length > 0) {
            const rangeNotes = track.notes.filter(
              (n) => n.time + n.duration > startBeat && n.time < endBeat
            );
            const notes = rangeNotes.length > 0 ? rangeNotes : track.notes;
            const rendered = await synth.renderNotesToAudioBuffer(track, notes, bpm);
            setInputBuffer(rendered.buffer);
            setInputBufferLabel(
              `⏱️ ${track.name} (MIDI Notes) • ${notes.length} notes in range`
            );
          } else {
            throw new Error(`Track "${track.name}" has no audio stem or notes.`);
          }
        }
      } else if (sourceType === 'upload') {
        if (uploadedFiles.length > 0 && uploadedFiles[selectedUploadIdx]) {
          const uf = uploadedFiles[selectedUploadIdx];
          setInputBuffer(uf.buffer);
          setInputBufferLabel(`📁 ${uf.file.name} (${uf.buffer.duration.toFixed(2)}s)`);
        } else {
          setInputBuffer(null);
          setInputBufferLabel('No audio file selected yet');
        }
      }
    } catch (err: any) {
      console.warn('Failed to load input source:', err);
      setToastMessage(`Source Error: ${err.message}`);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Automatically load input when relevant parameters change
  useEffect(() => {
    loadInputFromSource();
  }, [
    sourceType,
    pianoRollTrackId,
    useSelectedNotesOnly,
    timelineTrackId,
    startBeat,
    endBeat,
    selectedUploadIdx,
    uploadedFiles.length,
    mashSourceTrackIds.length,
    mode,
  ]);

  // Execute the chosen DSP effect
  const handleProcessDSP = async () => {
    stopPreview();
    setIsProcessing(true);
    try {
      const bpm = project.bpm || 120;
      let processed: AudioBuffer | null = null;

      if (mode === 'distort') {
        if (!inputBuffer) {
          throw new Error('No input audio buffer loaded. Select or upload audio first.');
        }
        processed = applyDistortion(inputBuffer, distortAmount, distortMode, distortGain);
      } else if (mode === 'masterworks') {
        if (!inputBuffer) {
          throw new Error('No input audio buffer loaded. Select or upload audio first.');
        }
        processed = processGlitchStutter(
          inputBuffer,
          bpm,
          glitchMultiplier,
          glitchDivision,
          glitchReverseChance,
          glitchShuffleChance
        );
      } else if (mode === 'musicmash') {
        // Gather all buffers
        const buffers: AudioBuffer[] = [];
        for (const trackId of mashSourceTrackIds) {
          const t = project.tracks.find((trk) => trk.id === trackId);
          if (t?.audioStem?.buffer) {
            buffers.push(t.audioStem.buffer);
          } else if (t && t.notes.length > 0) {
            const r = await synth.renderNotesToAudioBuffer(t, t.notes, bpm);
            buffers.push(r.buffer);
          }
        }
        if (includeUploadsInMash) {
          for (const uf of uploadedFiles) {
            buffers.push(uf.buffer);
          }
        }
        if (buffers.length === 0 && inputBuffer) {
          buffers.push(inputBuffer, inputBuffer);
        }

        if (buffers.length === 0) {
          throw new Error('Select at least one track or upload an audio file to mash.');
        }

        processed = await mashAudio(buffers, mashSliceBeats, bpm, mashPattern);
      }

      if (processed) {
        setOutputBuffer(processed);
        const blob = audioBufferToWavBlob(processed);
        setOutputBlob(blob);
        if (outputUrl) URL.revokeObjectURL(outputUrl);
        const url = URL.createObjectURL(blob);
        setOutputUrl(url);

        setToastMessage(`✓ ${mode.toUpperCase()} rendered successfully (${processed.duration.toFixed(2)}s)!`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err: any) {
      console.error('DSP Processing Error:', err);
      setToastMessage(`Error: ${err.message}`);
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Draw waveform on output canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !outputBuffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const data = outputBuffer.getChannelData(0);
    const step = Math.ceil(data.length / w);
    const amp = h / 2;

    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    if (mode === 'distort') {
      gradient.addColorStop(0, '#f97316');
      gradient.addColorStop(1, '#ef4444');
    } else if (mode === 'masterworks') {
      gradient.addColorStop(0, '#a855f7');
      gradient.addColorStop(1, '#ec4899');
    } else {
      gradient.addColorStop(0, '#06b6d4');
      gradient.addColorStop(1, '#10b981');
    }

    ctx.fillStyle = gradient;
    for (let i = 0; i < w; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(2, (max - min) * amp));
    }
  }, [outputBuffer, mode]);

  // Audio preview play/stop
  const handleTogglePreview = () => {
    if (isPlaying) {
      stopPreview();
      return;
    }

    const bufferToPlay = outputBuffer || inputBuffer;
    if (!bufferToPlay) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtxClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const srcNode = ctx.createBufferSource();
      srcNode.buffer = bufferToPlay;
      srcNode.connect(ctx.destination);
      srcNode.onended = () => setIsPlaying(false);
      srcNode.start(0);

      activeSourceNodeRef.current = srcNode;
      setIsPlaying(true);
    } catch (e) {
      console.warn('Audio preview playback error:', e);
      setIsPlaying(false);
    }
  };

  // Upload file handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newUploads: { file: File; buffer: AudioBuffer }[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        try {
          const buffer = await decodeAudioFile(file);
          newUploads.push({ file, buffer });
        } catch (err: any) {
          console.warn(`Could not decode ${file.name}:`, err);
        }
      }
      if (newUploads.length > 0) {
        setUploadedFiles((prev) => [...prev, ...newUploads]);
        setSourceType('upload');
        setSelectedUploadIdx(uploadedFiles.length); // point to first new
      }
    }
  };

  // Output 1: Inject as new track into DAW
  const handleInjectAsNewTrack = async () => {
    if (!outputBuffer || !outputUrl) return;

    const bpm = project.bpm || 120;
    const durationBeats = (outputBuffer.duration * bpm) / 60;
    const trackId = `track-${mode}-${Date.now()}`;

    let trackColor = '#f97316';
    let trackName = `⚡ Distorted: ${inputBufferLabel.slice(0, 16)}`;
    let instrument = 'synth_lead';

    if (mode === 'masterworks') {
      trackColor = '#a855f7';
      trackName = `🔀 Glitch: ${inputBufferLabel.slice(0, 16)}`;
      instrument = 'chiptune';
    } else if (mode === 'musicmash') {
      trackColor = '#06b6d4';
      trackName = `🧬 Mashup Remix`;
      instrument = 'ambient_pad';
    }

    const insertAt = sourceType === 'timeline' ? startBeat : 0;

    const newTrack: Track = {

      id: trackId,
      name: trackName,
      instrument,
      color: trackColor,
      volume: 0.88,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      notes: [],
      effects: {
        ...DEFAULT_TRACK_EFFECTS,
        distortion: mode === 'distort' ? 0.35 : 0,
        delaySend: mode === 'masterworks' ? 0.25 : 0,
        reverbSend: mode === 'musicmash' ? 0.2 : 0,
      },
      audioStem: {
        id: `stem-${Date.now()}`,
        name: trackName,
        url: outputUrl,
        duration: durationBeats,
        buffer: outputBuffer,
      },
    };

    // Persist stem buffer
    const wavBlob = await audioBufferToWavBlob(outputBuffer);
    const arrayBuffer = await wavBlob.arrayBuffer();
    await saveAudioData(newTrack.audioStem!.id, arrayBuffer);

    onInjectTrack(newTrack, insertAt);
    setToastMessage(`✓ Injected "${trackName}" into DAW Timeline at Beat ${insertAt}!`);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Output 2: Replace current track's audio stem
  const handleReplaceCurrentStem = async () => {
    if (!outputBuffer || !outputUrl || !onReplaceTrackStem) return;
    const targetTrackId =
      sourceType === 'timeline' && timelineTrackId !== 'all_tracks'
        ? timelineTrackId
        : activeTrack.id;

    const bpm = project.bpm || 120;
    const durationBeats = (outputBuffer.duration * bpm) / 60;

    const newStem: AudioStem = {
      id: `stem-${Date.now()}`,
      name: `${mode.toUpperCase()} Stem`,
      url: outputUrl,
      duration: durationBeats,
      buffer: outputBuffer,
    };

    // Persist stem buffer
    const wavBlob = await audioBufferToWavBlob(outputBuffer);
    const arrayBuffer = await wavBlob.arrayBuffer();
    await saveAudioData(newStem.id, arrayBuffer);

    onReplaceTrackStem(targetTrackId, newStem);
    setToastMessage(`✓ Replaced stem on track!`);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Output 3: Download WAV file
  const handleDownloadWav = () => {
    if (!outputBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(outputBlob);
    a.download = `${mode}_${Date.now()}.wav`;
    a.click();
  };

  const getHeaderIcon = () => {
    if (mode === 'distort') return <Zap className="w-5 h-5 text-amber-400 animate-pulse" />;
    if (mode === 'masterworks') return <Shuffle className="w-5 h-5 text-purple-400 animate-spin" />;
    return <Sparkles className="w-5 h-5 text-cyan-400" />;
  };

  const getTitle = () => {
    if (mode === 'distort') return '⚡ DISTORT: Dynamic Waveshaper & Bitcrush DSP';
    if (mode === 'masterworks') return '🔀 MASTERWORKS: Beat-Synced Glitch Stutter & Shuffle';
    return '🧬 MUSICMASH: Multi-Stem Cutup & Ensemble Remix';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-700/70 shadow-inner">
              {getHeaderIcon()}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>{getTitle()}</span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Process selections from DAW Timeline or Piano Roll, or upload audio samples
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="px-6 py-2 bg-emerald-950/80 border-b border-emerald-800/60 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: INPUT SOURCE SELECTION */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>1. Select Input Source</span>
              </label>
              <div className="text-[11px] text-cyan-400 font-mono bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50 truncate max-w-md">
                Active: {inputBufferLabel || 'Waiting for source...'}
              </div>
            </div>

            {/* Source Type Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setSourceType('pianoroll')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  sourceType === 'pianoroll'
                    ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Piano className="w-4 h-4" />
                <span>Piano Roll Notes</span>
                {hasSelectedNotes && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSourceType('timeline')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  sourceType === 'timeline'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>DAW Timeline Region</span>
                {timelineSelection && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSourceType('upload')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  sourceType === 'upload'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Audio Upload File</span>
                {uploadedFiles.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-[10px] text-emerald-300 font-mono">
                    {uploadedFiles.length}
                  </span>
                )}
              </button>
            </div>

            {/* Source Details Panel */}
            <div className="mt-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
              {sourceType === 'pianoroll' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Target Track:</span>
                      <select
                        value={pianoRollTrackId}
                        onChange={(e) => setPianoRollTrackId(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 outline-none"
                      >
                        {project.tracks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.notes.length} notes)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Note selection mode */}
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={useSelectedNotesOnly}
                          onChange={(e) => setUseSelectedNotesOnly(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                        />
                        <span>Only Use Selected Notes ({project.tracks.find(t => t.id === pianoRollTrackId)?.notes.filter(n => n.selected).length || 0})</span>
                      </label>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
                    <span>
                      Synthesizes MIDI notes via the track's instrument SoundFont/synthesizer into high-res audio buffer for DSP transformation.
                    </span>
                    <button
                      type="button"
                      onClick={loadInputFromSource}
                      className="px-2.5 py-1 rounded bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800/60 flex items-center gap-1 text-[11px]"
                    >
                      <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                      <span>Re-Render</span>
                    </button>
                  </div>
                </div>
              )}

              {sourceType === 'timeline' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <span className="text-slate-400 block mb-1">Track Selection:</span>
                      <select
                        value={timelineTrackId}
                        onChange={(e) => setTimelineTrackId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none"
                      >
                        <option value="all_tracks">⚡ All Tracks Mixdown</option>
                        {project.tracks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.audioStem ? '(Stem)' : `(${t.notes.length} notes)`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">Start Beat:</span>
                      <input
                        type="number"
                        min="0"
                        max={totalBeats - 1}
                        step="0.5"
                        value={startBeat}
                        onChange={(e) => setStartBeat(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none font-mono"
                      />
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">End Beat:</span>
                      <input
                        type="number"
                        min={startBeat + 0.25}
                        max={totalBeats}
                        step="0.5"
                        value={endBeat}
                        onChange={(e) => setEndBeat(Math.max(startBeat + 0.25, parseFloat(e.target.value) || totalBeats))}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Preset quick range buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[10px] text-slate-500 uppercase font-mono">Range Presets:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setStartBeat(0);
                        setEndBeat(Math.min(16, totalBeats));
                      }}
                      className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-700"
                    >
                      Bars 1-4
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStartBeat(16);
                        setEndBeat(Math.min(32, totalBeats));
                      }}
                      className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-700"
                    >
                      Bars 5-8
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStartBeat(0);
                        setEndBeat(totalBeats);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-700"
                    >
                      All Song Bars ({project.totalBars})
                    </button>
                    {timelineSelection && (
                      <button
                        type="button"
                        onClick={() => {
                          setStartBeat(timelineSelection.startBeat);
                          setEndBeat(timelineSelection.endBeat);
                        }}
                        className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[11px]"
                      >
                        DAW Selection ({timelineSelection.startBeat} - {timelineSelection.endBeat})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {sourceType === 'upload' && (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-emerald-500/80 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-900/50 hover:bg-slate-900/90 transition-all text-center"
                  >
                    <FileAudio className="w-8 h-8 text-emerald-400 mb-1.5" />
                    <span className="font-semibold text-slate-200">
                      Click to Browse or Drop Audio Files
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      WAV, MP3, FLAC, OGG, AIFF, M4A
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="audio/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-slate-400 font-semibold uppercase">Loaded Samples:</span>
                      <div className="flex flex-wrap gap-2">
                        {uploadedFiles.map((uf, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedUploadIdx(idx)}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all ${
                              selectedUploadIdx === idx
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                            }`}
                          >
                            <FileAudio className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[140px]">{uf.file.name}</span>
                            <span className="text-[10px] text-slate-500">{uf.buffer.duration.toFixed(1)}s</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Special Multi-Source Picker for MusicMash */}
            {mode === 'musicmash' && (
              <div className="mt-3 p-3.5 bg-cyan-950/20 border border-cyan-800/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold">
                  <span>🧬 MusicMash Ensemble Tracks Pool:</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {mashSourceTrackIds.length} Tracks Selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.tracks.map((t) => {
                    const isChecked = mashSourceTrackIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setMashSourceTrackIds((prev) =>
                            isChecked ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-all ${
                          isChecked
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {isChecked ? '✓ ' : '+ '}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: DSP CONTROLS */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span>2. Fine-Tune DSP Parameters</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                BPM: {project.bpm || 120}
              </span>
            </div>

            {/* Distort Controls */}
            {mode === 'distort' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Drive Intensity:</span>
                    <span className="text-amber-400">{Math.round(distortAmount * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={distortAmount}
                    onChange={(e) => setDistortAmount(parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-amber-500 cursor-pointer"
                  />
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Distortion Flavor:</span>
                  <select
                    value={distortMode}
                    onChange={(e) => setDistortMode(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 outline-none"
                  >
                    <option value="dynamic">Dynamic Waveshaper</option>
                    <option value="tube">Warm Tube Saturation</option>
                    <option value="fuzz">Hard Clipping Fuzz</option>
                    <option value="bitcrush">Bitcrush Decimator</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Output Level Trim:</span>
                    <span className="text-slate-200">{distortGain.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="1.5"
                    step="0.05"
                    value={distortGain}
                    onChange={(e) => setDistortGain(parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-sky-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* MasterWorks Glitch Controls */}
            {mode === 'masterworks' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block mb-1">Stutter Division:</span>
                  <select
                    value={glitchDivision}
                    onChange={(e) => setGlitchDivision(parseFloat(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none"
                  >
                    <option value="1">1/4 Note (Beat)</option>
                    <option value="0.5">1/8 Note</option>
                    <option value="0.25">1/16 Note</option>
                    <option value="0.125">1/32 Glitch Micro</option>
                  </select>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Length Multiplier:</span>
                  <select
                    value={glitchMultiplier}
                    onChange={(e) => setGlitchMultiplier(parseInt(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none"
                  >
                    <option value="1">1x Loop Length</option>
                    <option value="2">2x Extended Loop</option>
                    <option value="4">4x Marathon Stutter</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Shuffle Probability:</span>
                    <span className="text-purple-400">{Math.round(glitchShuffleChance * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.8"
                    step="0.05"
                    value={glitchShuffleChance}
                    onChange={(e) => setGlitchShuffleChance(parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-purple-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Reverse Micro-Slices:</span>
                    <span className="text-pink-400">{Math.round(glitchReverseChance * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.5"
                    step="0.05"
                    value={glitchReverseChance}
                    onChange={(e) => setGlitchReverseChance(parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-pink-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* MusicMash Controls */}
            {mode === 'musicmash' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block mb-1">Slice Duration:</span>
                  <select
                    value={mashSliceBeats}
                    onChange={(e) => setMashSliceBeats(parseFloat(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 outline-none"
                  >
                    <option value="0.5">1/2 Beat (Eighth Note Chopped)</option>
                    <option value="1">1 Beat (Quarter Note)</option>
                    <option value="2">2 Beats (Half Bar)</option>
                    <option value="4">4 Beats (1 Full Bar)</option>
                  </select>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Interleave Pattern:</span>
                  <select
                    value={mashPattern}
                    onChange={(e) => setMashPattern(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 outline-none"
                  >
                    <option value="random">Random Cutup Shuffle</option>
                    <option value="pingpong">Alternating Ping-Pong</option>
                    <option value="chaos">Chaos Harmonic Weave</option>
                  </select>
                </div>
              </div>
            )}

            {/* Run Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleProcessDSP}
                disabled={isProcessing || !inputBuffer}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
                  isProcessing || !inputBuffer
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : mode === 'distort'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 hover:brightness-110 shadow-amber-500/20'
                    : mode === 'masterworks'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:brightness-110 shadow-purple-500/20'
                    : 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:brightness-110 shadow-cyan-500/20'
                }`}
              >
                {getHeaderIcon()}
                <span>{isProcessing ? 'Processing DSP...' : `⚡ Render ${mode.toUpperCase()} Audio`}</span>
              </button>
            </div>
          </div>

          {/* STEP 3: AUDITION WAVEFORM & OUTPUT HANDLING */}
          {outputBuffer && (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>3. Audition & Output to DAW</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {outputBuffer.duration.toFixed(2)}s • {((outputBuffer.duration * (project.bpm || 120)) / 60).toFixed(1)} Beats
                  </span>
                  <button
                    type="button"
                    onClick={handleTogglePreview}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                  >
                    {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlaying ? 'Stop' : 'Play Preview'}</span>
                  </button>
                </div>
              </div>

              {/* Waveform Canvas */}
              <div className="w-full h-24 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative">
                <canvas ref={canvasRef} width={800} height={96} className="w-full h-full" />
              </div>

              {/* Output Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadWav}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Download WAV</span>
                </button>

                <div className="flex items-center gap-2">
                  {onReplaceTrackStem && sourceType === 'timeline' && timelineTrackId !== 'all_tracks' && (
                    <button
                      type="button"
                      onClick={handleReplaceCurrentStem}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-800/60 text-xs font-semibold"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace Track Stem</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleInjectAsNewTrack}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20"
                  >
                    <Plus className="w-4 h-4" />
                    <span>➕ Inject as New Track in DAW</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
