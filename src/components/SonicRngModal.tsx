import React, { useState } from 'react';
import { Dices, X, Wand2, Volume2, Sparkles, Sliders, Zap } from 'lucide-react';
import { ProjectState, Track } from '../types/daw';
import { SonicRNGEngine } from '../audio/sonicRng';
import { SeededRNG } from '../audio/seededRng';
import { MidiMuseEngine } from '../audio/midiMuse';
import { synth } from '../audio/synthEngine';

interface SonicRngModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState) => void;
}

export const SonicRngModal: React.FC<SonicRngModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
}) => {
  const [chaos, setChaos] = useState(0.6);
  const [status, setStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeTrack =
    project.tracks.find((t) => t.id === project.selectedTrackId) || project.tracks[0];

  const handleRollPatch = () => {
    if (!activeTrack) return;
    const newEffects = SonicRNGEngine.rollPatch(activeTrack.instrument, chaos);

    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === activeTrack.id ? { ...t, effects: newEffects } : t
      ),
    }));

    // Test preview sound
    synth.triggerLiveNoteOn(
      { ...activeTrack, effects: newEffects },
      activeTrack.instrument === 'analog_bass' ? 38 : 62,
      0.9
    );
    setTimeout(() => synth.triggerLiveNoteOff(activeTrack, 62), 400);

    setStatus(`✓ Rolled procedural timbre patch for "${activeTrack.name}"`);
  };

  const handleRollEuclideanDrums = () => {
    const drumTrack = project.tracks.find((t) => t.instrument === 'drums') || activeTrack;
    if (!drumTrack) return;

    const drumNotes = MidiMuseEngine.generateEuclideanDrums(project.totalBars);
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === drumTrack.id ? { ...t, notes: drumNotes } : t
      ),
    }));

    setStatus(`✓ Rolled Euclidean polyrhythmic drum pattern (${drumNotes.length} hits)`);
  };

  const handleRollGlitchFill = () => {
    if (!activeTrack) return;
    const glitchNotes = SonicRNGEngine.rollGlitchFill(activeTrack.notes, 0, 2.0);
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === activeTrack.id ? { ...t, notes: [...t.notes, ...glitchNotes] } : t
      ),
    }));

    setStatus(`✓ Injected 32nd-note glitch stutter fill into "${activeTrack.name}"`);
  };

  const handleRadicalChaosAll = () => {
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        effects: SonicRNGEngine.rollPatch(t.instrument, 1.0),
      })),
    }));
    setStatus('⚡ Radical Timbre Chaos applied across all project tracks!');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center shadow-md shadow-purple-500/20">
              <Dices className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Sonic RNG Sound Lab</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/40">
                  sonicrng.42web.io
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Procedural patch generation, Euclidean beats & glitch dice
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4 text-xs">
          {/* Target Track */}
          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-400 block text-[11px]">Selected Target Track:</span>
              <span className="font-bold text-slate-200 text-sm">{activeTrack?.name}</span>
            </div>
            <span
              className="w-4 h-4 rounded-full shadow-sm"
              style={{ backgroundColor: activeTrack?.color }}
            />
          </div>

          {/* Chaos Amount Slider */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
            <div className="flex justify-between items-center font-semibold">
              <span className="text-slate-300">Entropy / Chaos Factor:</span>
              <span className="text-purple-400 font-mono">{Math.round(chaos * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={chaos}
              onChange={(e) => setChaos(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-purple-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>Subtle Drift</span>
              <span>Balanced Mutation</span>
              <span>Radical Cosmic</span>
            </div>
          </div>

          {/* Action Dice Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={handleRollPatch}
              className="p-3 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/50 text-left flex flex-col gap-1 transition-all group"
            >
              <div className="flex items-center justify-between text-purple-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <Dices className="w-4 h-4 text-purple-400 group-hover:rotate-180 transition-transform duration-300" />
                  <span>Roll Timbre Patch</span>
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Randomize filter cutoff, resonance, saturation, and spatial reverb sends.
              </p>
            </button>

            <button
              onClick={handleRollEuclideanDrums}
              className="p-3 rounded-xl bg-sky-950/40 hover:bg-sky-900/50 border border-sky-800/50 text-left flex flex-col gap-1 transition-all group"
            >
              <div className="flex items-center justify-between text-sky-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span>Euclidean Beat Dice</span>
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Generate mathematically spaced syncopated polyrhythms for 808 percussion.
              </p>
            </button>

            <button
              onClick={handleRollGlitchFill}
              className="p-3 rounded-xl bg-pink-950/40 hover:bg-pink-900/50 border border-pink-800/50 text-left flex flex-col gap-1 transition-all group"
            >
              <div className="flex items-center justify-between text-pink-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-pink-400" />
                  <span>Roll 32nd Glitch</span>
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Inject laser-fast pitch arpeggios and stutter rolls into this track.
              </p>
            </button>

            <button
              onClick={handleRadicalChaosAll}
              className="p-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 text-left flex flex-col gap-1 transition-all group"
            >
              <div className="flex items-center justify-between text-rose-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4 text-rose-400" />
                  <span>Radical Master Roll</span>
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Mutate sound design across all channels simultaneously.
              </p>
            </button>
          </div>

          {/* Status feedback */}
          {status && (
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-purple-300 font-mono text-[11px]">
              {status}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
