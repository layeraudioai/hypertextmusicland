import React, { useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  Repeat,
  Sparkles,
  Dices,
  Video,
  Music,
  Piano,
  Sliders,
  Download,
  Upload,
  Radio,
  Volume2,
  HardDriveDownload,
  Film,
  RotateCcw,
  Trash2,
  FolderArchive,
  GitBranch,
  Settings,
  Flame,
} from 'lucide-react';
import { ProjectState } from '../types/daw';

interface HeaderProps {
  project: ProjectState;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  activeView: 'timeline' | 'pianoroll' | 'video' | 'mixer' | 'settings';
  setActiveView: (view: 'timeline' | 'pianoroll' | 'video' | 'mixer' | 'settings') => void;
  distort: () => void;
  masterWorks: () => void;
  musicMash: () => void;
  onOpenLayAi: () => void;
  onOpenSonicRng: () => void;
  onOpenAudioTransmuter: (tab?: 'audio-to-sf2' | 'audio-to-midi' | 'midi-sf2-to-audio' | 'midi-to-audio' | 'sf2-to-audio') => void;
  onOpenGitHubSync?: () => void;
  onExportWav: () => void;
  onExportMidi: () => void;
  onExportVideo: () => void;
  onExportFullZip: () => void;
  onClearProject: () => void;
  onClearWorkspace: () => void;
  onSaveProject: () => void;
  onLoadProject: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportMidi: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isBouncingWav: boolean;
  isVideoRecording: boolean;
  webMidiConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  onUpdateProject,
  activeView,
  setActiveView,
  distort,
  masterWorks,
  musicMash,
  onOpenLayAi,
  onOpenSonicRng,
  onOpenAudioTransmuter,
  onExportWav,
  onExportMidi,
  onExportVideo,
  onExportFullZip,
  onOpenGitHubSync,
  onClearProject,
  onClearWorkspace,
  onSaveProject,
  onLoadProject,
  onImportMidi,
  isBouncingWav,
  isVideoRecording,
  webMidiConnected,
}) => {
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const midiFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header id="aura-header" className="bg-slate-900/90 border-b border-slate-800 text-slate-100 px-4 py-2.5 backdrop-blur-md select-none sticky top-0 z-40">
      <div className="flex flex-wrap items-center justify-between gap-3 max-w-full">
        {/* Brand & Project Name */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-fuchsia-500 shadow-md shadow-cyan-500/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={project.title}
                onChange={(e) =>
                  onUpdateProject((prev) => ({ ...prev, title: e.target.value }))
                }
                className="font-bold text-sm bg-transparent hover:bg-slate-800/60 focus:bg-slate-800 px-1.5 py-0.5 rounded border border-transparent focus:border-slate-700 outline-none text-slate-100 transition-colors"
                title="Click to rename project"
              />
              <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/50">
                66GHz Hybrid
              </span>
              {webMidiConnected && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  MIDI IN
                </span>
              )}
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            id="distort"
            onClick={() => distort()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${activeView === 'distort'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>DISTORT</span>
          </button>
          <button
            id="masterWorks"
            onClick={() => masterWorks()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${activeView === 'masterWorks'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>MASTERWORKS</span>
          </button>
          <button
            id="musicMash"
            onClick={() => musicMash()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${activeView === 'musicMash'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>MUSICMASH</span>
          </button>
          <button
            id="view-tab-timeline"
            onClick={() => setActiveView('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${activeView === 'timeline'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>DAW Timeline</span>
          </button>
          <button
            id="view-tab-pianoroll"
            onClick={() => setActiveView('pianoroll')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${activeView === 'pianoroll'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Piano className="w-3.5 h-3.5" />
            <span>Piano Roll</span>
          </button>
          <button
            id="view-tab-video"
            onClick={() => setActiveView('video')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${activeView === 'video'
              ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>VisionFlow Video</span>
          </button>
          <button
            id="view-tab-mixer"
            onClick={() => setActiveView('mixer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${activeView === 'mixer'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Mixer</span>
          </button>
          <button
            id="view-tab-settings"
            onClick={() => setActiveView('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${activeView === 'settings'
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-bold shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
              }`}
            title="Settings & LayAI Fire Away Benchmarking Optimization"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Generative & Creative AI Modules */}
        <div className="flex items-center gap-2">
          <button
            id="btn-open-layai"
            onClick={onOpenLayAi}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/30 shadow-sm transition-all"
            title="LayAI & MidiMuse: Generative Arranger and Harmony AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>LayAI & Muse</span>
          </button>

          <button
            id="btn-open-sonicrng"
            onClick={onOpenSonicRng}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-purple-500/20 to-indigo-500/20 hover:from-purple-500/30 hover:to-indigo-500/30 text-purple-300 border border-purple-500/30 shadow-sm transition-all"
            title="Sonic RNG: Procedural Sound & Timbre Randomizer"
          >
            <Dices className="w-3.5 h-3.5 text-purple-400" />
            <span>Sonic RNG</span>
          </button>

          <button
            id="btn-open-transmuter"
            onClick={() => onOpenAudioTransmuter('audio-to-sf2')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-sky-500/20 to-blue-500/20 hover:from-sky-500/30 hover:to-blue-500/30 text-sky-300 border border-sky-500/30 shadow-sm transition-all"
            title="Audio & SF2 Transmuter: Upload Audio, Audio to SF2, Audio to MIDI, MIDI to Audio, SF2 to Audio"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Audio / SF2 / MIDI</span>
          </button>

          <button
            id="btn-quick-fire-away"
            onClick={() => setActiveView('settings')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 shadow-sm transition-all cursor-pointer"
            title="LayAI: Benchmarking Metrics, Fidelity Tuning & Fire Away Auto-Optimization"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>Fire Away</span>
          </button>
        </div>

        {/* Master Volume & Export Actions */}
        <div className="flex items-center gap-2.5">
          {/* Master Volume */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="range"
              min="0"
              max="1.2"
              step="0.05"
              value={project.masterVolume}
              onChange={(e) =>
                onUpdateProject((prev) => ({
                  ...prev,
                  masterVolume: parseFloat(e.target.value),
                }))
              }
              className="w-16 accent-sky-400 h-1.5 cursor-pointer"
              title={`Master Volume: ${Math.round(project.masterVolume * 100)}%`}
            />
          </div>

          {/* Hidden file inputs */}
          <input
            type="file"
            ref={projectFileInputRef}
            onChange={onLoadProject}
            accept=".json"
            className="hidden"
          />
          <input
            type="file"
            ref={midiFileInputRef}
            onChange={onImportMidi}
            accept=".mid,.midi"
            className="hidden"
          />

          {/* Clear Project & Clear Workspace Controls */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              id="btn-clear-project"
              onClick={onClearProject}
              title="Clear Project: Reset timeline tracks & notes to a blank canvas"
              className="px-2 py-1 text-xs text-slate-400 hover:text-amber-300 hover:bg-amber-950/30 rounded transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span>Clear Project</span>
            </button>
            <button
              id="btn-clear-workspace"
              onClick={onClearWorkspace}
              title="Clear Workspace: Reset project, wipe browser session cache, unload custom SoundFonts, and restore factory state"
              className="px-2 py-1 text-xs text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 rounded transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3 text-rose-400" />
              <span>Clear Workspace</span>
            </button>
          </div>

          {/* Export / Import Menu */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => projectFileInputRef.current?.click()}
              title="Import Project (.json)"
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onSaveProject}
              title="Save Project JSON"
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => midiFileInputRef.current?.click()}
              title="Import Standard MIDI (.mid)"
              className="px-2 py-1 text-xs text-cyan-400 hover:bg-cyan-950/40 rounded transition-colors flex items-center gap-1"
            >
              <span>+ MIDI</span>
            </button>
            <button
              onClick={onExportMidi}
              title="Export Standard MIDI (.mid)"
              className="px-2 py-1 text-xs text-sky-400 hover:bg-sky-950/40 rounded transition-colors"
            >
              .MID
            </button>
            <button
              onClick={onExportWav}
              disabled={isBouncingWav}
              title="AuraOffline: Fast High-Fidelity WAV Render"
              className="px-2.5 py-1 text-xs font-semibold rounded bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-sm flex items-center gap-1 disabled:opacity-50"
            >
              <HardDriveDownload className="w-3 h-3" />
              <span>{isBouncingWav ? 'Bouncing...' : 'WAV'}</span>
            </button>
            <button
              id="btn-export-full-zip"
              onClick={onExportFullZip}
              title="Full Saving: Stems + MIDI + SF2 SoundFonts + Masters in a single .ZIP package"
              className="px-3 py-1 text-xs font-bold rounded bg-gradient-to-r from-purple-600 via-indigo-600 to-sky-600 hover:from-purple-500 hover:to-sky-500 text-white shadow-md shadow-purple-600/25 flex items-center gap-1.5 transition-all cursor-pointer ml-0.5"
            >
              <FolderArchive className="w-3.5 h-3.5 text-purple-200" />
              <span>Full DAW ZIP</span>
            </button>
            {onOpenGitHubSync && (
              <button
                id="btn-github-sync"
                onClick={onOpenGitHubSync}
                title="Sync DAW project with GitHub repository: Commit, Push & Remote configuration"
                className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-900 hover:bg-slate-800 text-sky-400 hover:text-sky-300 border border-slate-700/80 flex items-center gap-1.5 transition-colors cursor-pointer ml-1"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>GitHub</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
