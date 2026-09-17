import React from 'react';
import { Play, Pause, Square, Repeat, Disc, Bell, Clock, Cpu } from 'lucide-react';
import { ProjectState } from '../types/daw';

interface TransportBarProps {
  project: ProjectState;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  isPlaying: boolean;
  isLooping: boolean;
  isRecording: boolean;
  currentBeat: number;
  metronomeOn: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onToggleRecord: () => void;
  onToggleMetronome: () => void;
  onSeek: (beat: number) => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  project,
  onUpdateProject,
  isPlaying,
  isLooping,
  isRecording,
  currentBeat,
  metronomeOn,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onToggleRecord,
  onToggleMetronome,
  onSeek,
}) => {
  const currentBar = Math.floor(currentBeat / 4) + 1;
  const currentBeatInBar = Math.floor(currentBeat % 4) + 1;
  const currentSixteenth = Math.floor((currentBeat % 1) * 4) + 1;

  const totalBeats = project.totalBars * 4;
  const progressPercent = Math.min(100, Math.max(0, (currentBeat / totalBeats) * 100));

  return (
    <div id="aura-transport-bar" className="bg-slate-950 border-b border-slate-800 text-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-4 select-none">
      {/* Primary Transport Controls */}
      <div className="flex items-center gap-2">
        <button
          id="btn-transport-stop"
          onClick={onStop}
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors shadow-sm"
          title="Stop & Return to Start"
        >
          <Square className="w-4 h-4 fill-current" />
        </button>

        <button
          id="btn-transport-play"
          onClick={onTogglePlay}
          className={`px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all shadow-md ${
            isPlaying
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 animate-pulse'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
          }`}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
        </button>

        <button
          id="btn-transport-record"
          onClick={onToggleRecord}
          className={`p-2 rounded-lg border transition-all ${
            isRecording
              ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-sm shadow-rose-500/30'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-400'
          }`}
          title="Record Live MIDI / Keyboard Input"
        >
          <Disc className={`w-4 h-4 ${isRecording ? 'animate-spin' : ''}`} />
        </button>

        <button
          id="btn-transport-loop"
          onClick={onToggleLoop}
          className={`p-2 rounded-lg border transition-all ${
            isLooping
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-sm shadow-cyan-500/30'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-cyan-400'
          }`}
          title="Toggle Song Loop"
        >
          <Repeat className="w-4 h-4" />
        </button>

        <button
          id="btn-transport-metronome"
          onClick={onToggleMetronome}
          className={`p-2 rounded-lg border transition-all ${
            metronomeOn
              ? 'bg-sky-500/20 border-sky-500 text-sky-400'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-sky-400'
          }`}
          title="Metronome Click"
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>

      {/* Timecode & Bar Display */}
      <div className="flex items-center gap-3">
        {/* Digital LED Display */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 px-3.5 py-1.5 rounded-lg border border-slate-800 font-mono text-cyan-400 text-sm shadow-inner tracking-wider">
          <Clock className="w-3.5 h-3.5 text-cyan-500" />
          <span>
            {String(currentBar).padStart(2, '0')} : {String(currentBeatInBar).padStart(2, '0')} :{' '}
            {String(currentSixteenth).padStart(2, '0')}
          </span>
        </div>

        {/* Global Progress Scrubber Bar */}
        <div
          className="w-32 h-3 bg-slate-900 rounded-full border border-slate-800 overflow-hidden cursor-pointer relative"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            onSeek(clickPos * totalBeats);
          }}
          title="Click to seek timeline"
        >
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-sky-400 rounded-full transition-all duration-75"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* BPM, Key & Arrangement Controls */}
      <div className="flex items-center gap-4">
        {/* BPM Counter */}
        <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">BPM</span>
          <button
            onClick={() =>
              onUpdateProject((prev) => ({ ...prev, bpm: Math.max(40, prev.bpm - 1) }))
            }
            className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold"
          >
            -
          </button>
          <input
            type="number"
            min="40"
            max="240"
            value={project.bpm}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 120;
              onUpdateProject((prev) => ({ ...prev, bpm: Math.min(240, Math.max(40, val)) }));
            }}
            className="w-12 bg-transparent text-center text-xs font-mono font-bold text-sky-400 outline-none"
          />
          <button
            onClick={() =>
              onUpdateProject((prev) => ({ ...prev, bpm: Math.min(240, prev.bpm + 1) }))
            }
            className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold"
          >
            +
          </button>
        </div>

        {/* Total Bars */}
        <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">BARS</span>
          <input
            type="number"
            min="1"
            max="2048"
            value={project.totalBars}
            onChange={(e) => {
              const bars = Math.max(1, Math.min(2048, parseInt(e.target.value) || 1));
              onUpdateProject((prev) => ({ ...prev, totalBars: bars }));
            }}
            className="w-16 bg-transparent text-slate-200 outline-none font-mono font-bold text-xs"
          />
        </div>

        {/* 66GHz Latency & DSP indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px] font-mono text-slate-400">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>66GHz DSP: 44.1kHz • ~2ms</span>
        </div>
      </div>
    </div>
  );
};
