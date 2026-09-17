import React, { useState, useRef, useEffect } from 'react';
import {
  Volume2,
  Sliders,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Disc,
  Piano,
  Music,
  Upload,
  FileAudio,
  Check,
} from 'lucide-react';
import { ProjectState, Track, InstrumentId, Note } from '../types/daw';
import { SOUNDFONT_PRESETS, getPitchColor, getNoteName } from '../audio/constants';
import { sampleManager, decodeAudioFile, computeAudioMetrics } from '../audio/audioProcessor';
import { synth } from '../audio/synthEngine';

const AudioStemBlock: React.FC<{
  track: Track;
  pixelsPerBeat: number;
  projectBpm: number;
  totalBars: number;
  onSyncBars: (bars: number) => void;
}> = ({ track, pixelsPerBeat, projectBpm, totalBars, onSyncBars }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stem = track.audioStem;
  if (!stem) return null;

  const durationSec = stem.buffer ? stem.buffer.duration : (stem.duration * 60) / projectBpm;
  const beats = stem.duration;
  const requiredBars = Math.max(1, Math.ceil(beats / 4));
  const widthPx = Math.max(80, beats * pixelsPerBeat);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stem.buffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const data = stem.buffer.getChannelData(0);
    const step = Math.ceil(data.length / w);
    const amp = h / 2;

    ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
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
  }, [stem.buffer, widthPx]);

  return (
    <div
      className="absolute bg-emerald-950/70 border border-emerald-500/70 rounded-md overflow-hidden flex flex-col justify-between shadow-lg backdrop-blur-sm z-10"
      style={{
        left: '0px',
        top: '6px',
        width: `${widthPx}px`,
        height: '76px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Waveform Canvas */}
      <canvas
        ref={canvasRef}
        width={Math.min(1800, Math.floor(widthPx))}
        height={76}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
      />

      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between px-2 py-1 bg-emerald-950/90 border-b border-emerald-800/50 text-[10px] font-mono text-emerald-200">
        <div className="flex items-center gap-1.5 truncate">
          <Disc className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-bold truncate">{stem.name}</span>
        </div>
        <span className="text-[9px] text-emerald-400 bg-emerald-900/80 px-1.5 py-0.2 rounded shrink-0">
          {durationSec.toFixed(2)}s • {beats.toFixed(1)} beats • {requiredBars} bars
        </span>
      </div>

      {/* Footer bar with sync action */}
      <div className="relative z-10 flex items-center justify-between px-2 py-1 text-[9px] font-mono text-emerald-300">
        <span className="text-emerald-400/80">Audio Stem Lane</span>
        {totalBars !== requiredBars && (
          <button
            onClick={() => onSyncBars(requiredBars)}
            className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition-colors text-[9px]"
            title={`Adjust project total bars to ${requiredBars} to match this audio stem`}
          >
            Fit Project ({requiredBars} Bars)
          </button>
        )}
      </div>
    </div>
  );
};

interface TimelineViewProps {
  project: ProjectState;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  currentBeat: number;
  onSeek: (beat: number) => void;
  onSelectTrackForPianoRoll: (trackId: string) => void;
  onOpenTransmuter?: (tab?: 'audio-to-sf2' | 'audio-to-midi' | 'midi-sf2-to-audio' | 'midi-to-audio' | 'sf2-to-audio') => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  project,
  onUpdateProject,
  currentBeat,
  onSeek,
  onSelectTrackForPianoRoll,
  onOpenTransmuter,
}) => {
  const [expandedFxTrackId, setExpandedFxTrackId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDragOverTimeline, setIsDragOverTimeline] = useState(false);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  const totalBeats = project.totalBars * 4;
  const pixelsPerBeat = 48; // Width per beat
  const timelineWidth = totalBeats * pixelsPerBeat;

  const processImportAudioFile = async (file: File) => {
    try {
      synth.init();
      const ctx = synth.getAudioContext();
      const buffer = await decodeAudioFile(file, ctx || undefined);
      const metrics = computeAudioMetrics(buffer, project.bpm, 4);

      const objectUrl = URL.createObjectURL(file);
      const stemId = `stem-${Date.now()}`;
      const newTrack: Track = {
        id: `track-stem-${Date.now()}`,
        name: `Stem: ${file.name.replace(/\.[^/.]+$/, '')}`,
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
          name: file.name,
          url: objectUrl,
          duration: metrics.beats,
          buffer: buffer,
        },
        effects: {
          cutoff: 12000,
          resonance: 1.5,
          distortion: 0,
          delaySend: 0,
          delayTime: 0.35,
          reverbSend: 0,
          attack: 0.01,
          decay: 0.3,
          sustain: 0.8,
          release: 0.3,
        },
      };

      onUpdateProject((prev) => ({
        ...prev,
        totalBars: Math.max(prev.totalBars, metrics.bars),
        tracks: [...prev.tracks, newTrack],
        selectedTrackId: newTrack.id,
      }));

      setToastMessage(
        `✓ Imported "${file.name}" (${metrics.durationSeconds.toFixed(2)}s, ${metrics.beats.toFixed(1)} beats). Project expanded to ${metrics.bars} bars!`
      );
      setTimeout(() => setToastMessage(null), 6000);
    } catch (err: any) {
      console.error(err);
      alert('Error importing audio file: ' + err.message);
    }
  };

  const handleAudioFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImportAudioFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleTimelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTimeline(true);
  };

  const handleTimelineDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTimeline(false);
  };

  const handleTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverTimeline(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aif|aiff)$/i.test(file.name)) {
        processImportAudioFile(file);
      }
    }
  };

  const handleToggleMute = (trackId: string) => {
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t
      ),
    }));
  };

  const handleToggleSolo = (trackId: string) => {
    onUpdateProject((prev) => {
      const target = prev.tracks.find((t) => t.id === trackId);
      const isCurrentlySolo = target?.solo;
      return {
        ...prev,
        tracks: prev.tracks.map((t) => ({
          ...t,
          solo: t.id === trackId ? !isCurrentlySolo : false,
        })),
      };
    });
  };

  const handleToggleArm = (trackId: string) => {
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId ? { ...t, armed: !t.armed } : { ...t, armed: false }
      ),
    }));
  };

  const handleDeleteTrack = (trackId: string) => {
    if (project.tracks.length <= 1) return;
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((t) => t.id !== trackId),
      selectedTrackId:
        prev.selectedTrackId === trackId
          ? prev.tracks.find((t) => t.id !== trackId)?.id || ''
          : prev.selectedTrackId,
    }));
  };

  const handleAddTrack = (instrument: InstrumentId) => {
    const preset = SOUNDFONT_PRESETS.find((p) => p.id === instrument);
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: preset?.name || 'New Track',
      instrument,
      color: preset?.defaultColor || '#38bdf8',
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      notes: [],
      effects: {
        cutoff: 8000,
        resonance: 2.0,
        distortion: 0.0,
        delaySend: 0.2,
        delayTime: 0.35,
        reverbSend: 0.3,
        attack: 0.01,
        decay: 0.3,
        sustain: 0.7,
        release: 0.4,
      },
    };

    onUpdateProject((prev) => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
      selectedTrackId: newTrack.id,
    }));
  };

  return (
    <div id="daw-timeline-container" className="flex-1 flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* Timeline Controls & Track Actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-300">Tracks ({project.tracks.length})</span>
          {/* Quick Add SoundFont Track Menu */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 uppercase">+ SF2 Track:</span>
            {SOUNDFONT_PRESETS.slice(0, 5).map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleAddTrack(preset.id)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors text-[11px]"
                title={`Add ${preset.name}`}
              >
                {preset.name.split(' ')[1] || preset.name}
              </button>
            ))}
            {onOpenTransmuter && (
              <button
                onClick={() => onOpenTransmuter('audio-to-sf2')}
                className="px-2 py-0.5 rounded bg-sky-950/60 hover:bg-sky-900/60 text-sky-300 hover:text-sky-200 border border-sky-800/60 transition-colors text-[11px] flex items-center gap-1 font-semibold ml-1"
                title="Audio Upload & SF2 / MIDI Conversion Studio"
              >
                <Upload className="w-3 h-3" />
                <span>Upload Sample / SF2</span>
              </button>
            )}
            <button
              onClick={() => audioFileInputRef.current?.click()}
              className="px-2 py-0.5 rounded bg-emerald-950/70 hover:bg-emerald-900/70 text-emerald-300 hover:text-emerald-200 border border-emerald-800/60 transition-colors text-[11px] flex items-center gap-1 font-semibold ml-1"
              title="Import audio file (WAV/MP3/OGG/FLAC) as audio stem track & auto-calculate bars"
            >
              <FileAudio className="w-3 h-3" />
              <span>+ Audio Stem</span>
            </button>
            <input
              type="file"
              ref={audioFileInputRef}
              accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aif,.aiff"
              onChange={handleAudioFileInputChange}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {toastMessage && (
            <div className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700/60 text-emerald-300 font-mono text-[11px] flex items-center gap-1.5 animate-fadeIn">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
          )}
          <div className="text-[11px] text-slate-400 font-mono">
            Length: {project.totalBars} Bars ({totalBeats} Beats)
          </div>
        </div>
      </div>

      {/* Main Track Workspace with Drag and Drop */}
      <div
        className="flex-1 flex overflow-auto relative"
        onDragOver={handleTimelineDragOver}
        onDragLeave={handleTimelineDragLeave}
        onDrop={handleTimelineDrop}
      >
        {isDragOverTimeline && (
          <div className="absolute inset-0 z-50 bg-emerald-950/80 border-2 border-dashed border-emerald-400 flex flex-col items-center justify-center pointer-events-none backdrop-blur-xs">
            <FileAudio className="w-12 h-12 text-emerald-400 animate-bounce mb-2" />
            <span className="text-sm font-bold text-emerald-200">
              Drop audio file to import as track & calculate bar count
            </span>
            <span className="text-xs text-emerald-400 font-mono">
              WAV, MP3, FLAC, OGG, AIFF
            </span>
          </div>
        )}
        {/* Left: Track Headers Column */}
        <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 z-10">
          {/* Header ruler placeholder */}
          <div className="h-8 border-b border-slate-800 bg-slate-950 px-3 flex items-center text-[11px] font-mono text-slate-500 uppercase">
            Track Channel Strip
          </div>

          {/* Track Headers */}
          {project.tracks.map((track) => {
            const isSelected = track.id === project.selectedTrackId;
            const isExpandedFx = expandedFxTrackId === track.id;

            return (
              <div
                key={track.id}
                className={`border-b border-slate-800 transition-colors ${
                  isSelected ? 'bg-slate-800/80' : 'bg-slate-900 hover:bg-slate-850'
                }`}
              >
                {/* Header Top Row */}
                <div
                  className="p-2.5 flex flex-col gap-2 cursor-pointer"
                  onClick={() =>
                    onUpdateProject((prev) => ({ ...prev, selectedTrackId: track.id }))
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* Color dot & Name */}
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: track.color }}
                      />
                      <input
                        type="text"
                        value={track.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          onUpdateProject((prev) => ({
                            ...prev,
                            tracks: prev.tracks.map((t) =>
                              t.id === track.id ? { ...t, name: val } : t
                            ),
                          }));
                        }}
                        className="bg-transparent font-medium text-xs text-slate-100 outline-none w-36 truncate focus:bg-slate-950/60 px-1 rounded"
                      />
                    </div>

                    {/* Mute / Solo / Arm buttons */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggleMute(track.id)}
                        className={`w-5 h-5 rounded text-[10px] font-bold font-mono transition-colors ${
                          track.muted
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title="Mute"
                      >
                        M
                      </button>
                      <button
                        onClick={() => handleToggleSolo(track.id)}
                        className={`w-5 h-5 rounded text-[10px] font-bold font-mono transition-colors ${
                          track.solo
                            ? 'bg-sky-400 text-slate-950'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title="Solo"
                      >
                        S
                      </button>
                      <button
                        onClick={() => handleToggleArm(track.id)}
                        className={`w-5 h-5 rounded text-[10px] font-bold font-mono transition-colors ${
                          track.armed
                            ? 'bg-rose-500 text-white animate-pulse'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title="Arm Recording"
                      >
                        R
                      </button>
                    </div>
                  </div>

                  {/* SoundFont Instrument Selector & Fader Controls */}
                  <div className="flex items-center justify-between gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={track.instrument}
                      onChange={(e) => {
                        const inst = e.target.value as InstrumentId;
                        const preset = SOUNDFONT_PRESETS.find((p) => p.id === inst);
                        onUpdateProject((prev) => ({
                          ...prev,
                          tracks: prev.tracks.map((t) =>
                            t.id === track.id
                              ? {
                                  ...t,
                                  instrument: inst,
                                  color: preset?.defaultColor || t.color,
                                }
                              : t
                          ),
                        }));
                      }}
                      className="bg-slate-950 text-slate-300 text-[11px] rounded border border-slate-700/80 px-1.5 py-0.5 outline-none max-w-[140px] truncate"
                    >
                      <optgroup label="SoundFonts">
                        {SOUNDFONT_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                      {sampleManager.getAllInstruments().length > 0 && (
                        <optgroup label="Custom Samples">
                          {sampleManager.getAllInstruments().map((ci) => (
                            <option key={ci.id} value={ci.id}>
                              {ci.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onSelectTrackForPianoRoll(track.id)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-sky-400"
                        title="Open in Piano Roll"
                      >
                        <Piano className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setExpandedFxTrackId(isExpandedFx ? null : track.id)
                        }
                        className={`p-1 rounded transition-colors ${
                          isExpandedFx
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title="Toggle Sound Design & Effects Rack"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrack(track.id)}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-400"
                        title="Delete Track"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Volume & Pan */}
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 flex-1">
                      <span>VOL</span>
                      <input
                        type="range"
                        min="0"
                        max="1.25"
                        step="0.05"
                        value={track.volume}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onUpdateProject((prev) => ({
                            ...prev,
                            tracks: prev.tracks.map((t) =>
                              t.id === track.id ? { ...t, volume: val } : t
                            ),
                          }));
                        }}
                        className="w-full h-1 accent-sky-400 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-1 w-20">
                      <span>PAN</span>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.1"
                        value={track.pan}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onUpdateProject((prev) => ({
                            ...prev,
                            tracks: prev.tracks.map((t) =>
                              t.id === track.id ? { ...t, pan: val } : t
                            ),
                          }));
                        }}
                        className="w-full h-1 accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* SoundFont Effects & ADSR Rack */}
                {isExpandedFx && (
                  <div className="p-3 bg-slate-950 border-t border-slate-800/80 flex flex-col gap-2 text-[11px] font-mono">
                    <div className="flex justify-between items-center text-slate-400 font-semibold border-b border-slate-800 pb-1">
                      <span>SF2 Filter & Modulation</span>
                      <span className="text-[10px] text-sky-400">{track.name}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-slate-300">
                      <div>
                        <div className="flex justify-between text-[10px]">
                          <span>Cutoff:</span>
                          <span>{Math.round(track.effects.cutoff)}Hz</span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="18000"
                          value={track.effects.cutoff}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateProject((prev) => ({
                              ...prev,
                              tracks: prev.tracks.map((t) =>
                                t.id === track.id
                                  ? { ...t, effects: { ...t.effects, cutoff: val } }
                                  : t
                              ),
                            }));
                          }}
                          className="w-full h-1 accent-sky-400 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px]">
                          <span>Resonance:</span>
                          <span>{track.effects.resonance.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="18"
                          step="0.5"
                          value={track.effects.resonance}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateProject((prev) => ({
                              ...prev,
                              tracks: prev.tracks.map((t) =>
                                t.id === track.id
                                  ? { ...t, effects: { ...t.effects, resonance: val } }
                                  : t
                              ),
                            }));
                          }}
                          className="w-full h-1 accent-purple-400 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px]">
                          <span>Delay Send:</span>
                          <span>{Math.round(track.effects.delaySend * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="0.8"
                          step="0.05"
                          value={track.effects.delaySend}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateProject((prev) => ({
                              ...prev,
                              tracks: prev.tracks.map((t) =>
                                t.id === track.id
                                  ? { ...t, effects: { ...t.effects, delaySend: val } }
                                  : t
                              ),
                            }));
                          }}
                          className="w-full h-1 accent-cyan-400 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px]">
                          <span>Reverb Send:</span>
                          <span>{Math.round(track.effects.reverbSend * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="0.9"
                          step="0.05"
                          value={track.effects.reverbSend}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateProject((prev) => ({
                              ...prev,
                              tracks: prev.tracks.map((t) =>
                                t.id === track.id
                                  ? { ...t, effects: { ...t.effects, reverbSend: val } }
                                  : t
                              ),
                            }));
                          }}
                          className="w-full h-1 accent-emerald-400 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: Timeline Lanes & Ruler */}
        <div className="flex-1 flex flex-col overflow-x-auto relative">
          {/* Top Bars Ruler */}
          <div
            className="h-8 border-b border-slate-800 bg-slate-950 flex sticky top-0 z-20 cursor-pointer"
            style={{ width: `${timelineWidth}px` }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const beat = Math.max(0, Math.min(totalBeats, clickX / pixelsPerBeat));
              onSeek(beat);
            }}
          >
            {Array.from({ length: project.totalBars }).map((_, barIdx) => (
              <div
                key={barIdx}
                className="h-full border-r border-slate-800 flex items-center px-2 text-[11px] font-mono text-slate-400 relative"
                style={{ width: `${pixelsPerBeat * 4}px` }}
              >
                <span>Bar {barIdx + 1}</span>
                {/* 4 quarter beat tick marks */}
                <div className="absolute inset-0 flex justify-between pointer-events-none">
                  <div className="w-px h-2 bg-slate-700 self-end" />
                  <div className="w-px h-1.5 bg-slate-800 self-end" />
                  <div className="w-px h-2 bg-slate-800 self-end" />
                  <div className="w-px h-1.5 bg-slate-800 self-end" />
                </div>
              </div>
            ))}
          </div>

          {/* Scrubbing Playhead Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] z-30 pointer-events-none"
            style={{ left: `${currentBeat * pixelsPerBeat}px` }}
          >
            <div className="w-2.5 h-2.5 -ml-1 bg-cyan-400 rotate-45" />
          </div>

          {/* Track Lanes */}
          {project.tracks.map((track) => {
            const isSelected = track.id === project.selectedTrackId;
            const isExpandedFx = expandedFxTrackId === track.id;

            return (
              <div
                key={track.id}
                className={`border-b border-slate-800/80 relative cursor-pointer ${
                  isSelected ? 'bg-slate-900/60' : 'bg-slate-950/40 hover:bg-slate-900/40'
                }`}
                style={{
                  width: `${timelineWidth}px`,
                  height: isExpandedFx ? '175px' : '95px',
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const beat = Math.max(0, Math.min(totalBeats, clickX / pixelsPerBeat));
                  onSeek(Number(beat.toFixed(2)));
                  onSelectTrackForPianoRoll(track.id);
                }}
              >
                {/* Bar Grid background lines */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {Array.from({ length: project.totalBars }).map((_, bIdx) => (
                    <div
                      key={bIdx}
                      className="h-full border-r border-slate-800/60 flex justify-between"
                      style={{ width: `${pixelsPerBeat * 4}px` }}
                    >
                      <div className="w-px h-full border-r border-slate-900" />
                      <div className="w-px h-full border-r border-slate-900" />
                      <div className="w-px h-full border-r border-slate-900" />
                    </div>
                  ))}
                </div>

                {/* Render MIDI Note Blocks in this Lane */}
                {track.notes.map((note) => {
                  const left = note.time * pixelsPerBeat;
                  const width = Math.max(8, note.duration * pixelsPerBeat);
                  // Approximate vertical distribution based on pitch (e.g. 24 to 96)
                  const normalizedY = Math.max(0.05, Math.min(0.85, 1 - (note.pitch - 30) / 60));
                  const top = normalizedY * (isExpandedFx ? 140 : 65);

                  const noteColor = getPitchColor(note.pitch);

                  return (
                    <div
                      key={note.id}
                      className="absolute rounded-sm px-1 flex items-center overflow-hidden text-[9px] font-mono font-bold shadow-sm transition-transform hover:scale-105"
                      style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: '18px',
                        backgroundColor: noteColor,
                        color: '#000000',
                        opacity: track.muted ? 0.35 : 0.9,
                        boxShadow: `0 0 6px ${noteColor}66`,
                      }}
                      title={`${getNoteName(note.pitch)} • Beat: ${note.time} • Dur: ${note.duration}`}
                    >
                      <span className="truncate">{getNoteName(note.pitch)}</span>
                    </div>
                  );
                })}

                {/* Render Audio Stem with real waveform and bar fit button */}
                {track.audioStem && (
                  <AudioStemBlock
                    track={track}
                    pixelsPerBeat={pixelsPerBeat}
                    projectBpm={project.bpm}
                    totalBars={project.totalBars}
                    onSyncBars={(bars) => {
                      onUpdateProject((prev) => ({ ...prev, totalBars: bars }));
                      setToastMessage(`✓ Project length updated to ${bars} bars to match "${track.audioStem?.name}"!`);
                      setTimeout(() => setToastMessage(null), 4000);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
