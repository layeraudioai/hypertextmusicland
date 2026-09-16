import React, { useState, useEffect } from 'react';
import { Piano, Radio, ChevronLeft, ChevronRight } from 'lucide-react';
import { ProjectState, Track } from '../types/daw';
import { ROOT_NOTES, getNoteName, getPitchColor } from '../audio/constants';
import { synth } from '../audio/synthEngine';

interface VirtualKeyboardProps {
  project: ProjectState;
  activeTrack: Track;
  webMidiConnected: boolean;
  onRecordNote?: (pitch: number, velocity: number) => void;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  project,
  activeTrack,
  webMidiConnected,
  onRecordNote,
}) => {
  const [octaveOffset, setOctaveOffset] = useState(4); // Default C4
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());
  const [velocity, setVelocity] = useState(0.85);

  // Computer keyboard to semitone offset map
  const KEY_MAP: Record<string, number> = {
    a: 0, // C
    w: 1, // C#
    s: 2, // D
    e: 3, // D#
    d: 4, // E
    f: 5, // F
    t: 6, // F#
    g: 7, // G
    y: 8, // G#
    h: 9, // A
    u: 10, // A#
    j: 11, // B
    k: 12, // C (+1)
    o: 13, // C# (+1)
    l: 14, // D (+1)
    p: 15, // D# (+1)
    ';': 16, // E (+1)
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (KEY_MAP[key] !== undefined) {
        const pitch = (octaveOffset + 1) * 12 + KEY_MAP[key];
        if (!activeKeys.has(pitch)) {
          synth.triggerLiveNoteOn(activeTrack, pitch, velocity);
          setActiveKeys((prev) => new Set(prev).add(pitch));
          onRecordNote?.(pitch, velocity);
        }
      } else if (key === 'z') {
        setOctaveOffset((o) => Math.max(1, o - 1));
      } else if (key === 'x') {
        setOctaveOffset((o) => Math.min(7, o + 1));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (KEY_MAP[key] !== undefined) {
        const pitch = (octaveOffset + 1) * 12 + KEY_MAP[key];
        synth.triggerLiveNoteOff(activeTrack, pitch);
        setActiveKeys((prev) => {
          const next = new Set(prev);
          next.delete(pitch);
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [octaveOffset, activeTrack, velocity, activeKeys, onRecordNote]);

  // Render 2 full octaves (24 semitones)
  const basePitch = (octaveOffset + 1) * 12;
  const numPitches = 25; // 2 octaves + top C

  const handleMouseDownKey = (pitch: number) => {
    synth.triggerLiveNoteOn(activeTrack, pitch, velocity);
    setActiveKeys((prev) => new Set(prev).add(pitch));
    onRecordNote?.(pitch, velocity);
  };

  const handleMouseUpKey = (pitch: number) => {
    synth.triggerLiveNoteOff(activeTrack, pitch);
    setActiveKeys((prev) => {
      const next = new Set(prev);
      next.delete(pitch);
      return next;
    });
  };

  return (
    <div id="virtual-aura-keyboard" className="bg-slate-900 border-t border-slate-800 p-2 text-slate-200 select-none flex flex-col gap-1.5">
      {/* Top row: controls */}
      <div className="flex items-center justify-between text-xs px-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-300">
            <Piano className="w-4 h-4 text-sky-400" />
            <span>Aura Live Keys ({activeTrack?.name})</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
            <span className="text-slate-500">Octave:</span>
            <button
              onClick={() => setOctaveOffset((o) => Math.max(1, o - 1))}
              className="px-1 text-slate-400 hover:text-white"
              title="Key Z"
            >
              -
            </button>
            <span className="font-mono text-cyan-400 font-bold">C{octaveOffset}</span>
            <button
              onClick={() => setOctaveOffset((o) => Math.min(7, o + 1))}
              className="px-1 text-slate-400 hover:text-white"
              title="Key X"
            >
              +
            </button>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-[11px] text-slate-400 font-mono">
          <span>QWERTY: [A][W][S][E][D][F][T][G][H]...</span>
          <div className="flex items-center gap-1.5">
            <span>Vel:</span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={velocity}
              onChange={(e) => setVelocity(parseFloat(e.target.value))}
              className="w-16 h-1 accent-sky-400 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Piano Keys Strip */}
      <div className="h-24 bg-slate-950 rounded-xl border border-slate-800/80 p-1 flex relative overflow-hidden shadow-inner">
        {Array.from({ length: numPitches }).map((_, i) => {
          const pitch = basePitch + i;
          const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);
          const isPressed = activeKeys.has(pitch);
          const pitchColor = getPitchColor(pitch);

          if (isBlack) return null; // black keys are positioned absolutely

          return (
            <div
              key={pitch}
              onMouseDown={() => handleMouseDownKey(pitch)}
              onMouseUp={() => handleMouseUpKey(pitch)}
              onMouseLeave={() => isPressed && handleMouseUpKey(pitch)}
              className={`flex-1 h-full rounded-b-md border border-slate-300/40 relative cursor-pointer flex flex-col justify-end items-center pb-1 text-[9px] font-mono transition-all ${
                isPressed
                  ? 'bg-sky-400 text-slate-950 shadow-[0_0_12px_rgba(56,189,248,0.9)] translate-y-0.5'
                  : 'bg-white hover:bg-slate-100 text-slate-600'
              }`}
            >
              <span className="font-bold">{getNoteName(pitch)}</span>
            </div>
          );
        })}

        {/* Overlay Black Keys */}
        {Array.from({ length: numPitches }).map((_, i) => {
          const pitch = basePitch + i;
          const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);
          if (!isBlack) return null;

          const isPressed = activeKeys.has(pitch);
          // Calculate horizontal offset relative to total white keys
          const whiteKeysBefore = Array.from({ length: i }).filter(
            (_, idx) => ![1, 3, 6, 8, 10].includes((basePitch + idx) % 12)
          ).length;

          // 15 white keys in 2 octaves + 1
          const totalWhite = 15;
          const leftPercent = ((whiteKeysBefore - 0.32) / totalWhite) * 100;

          return (
            <div
              key={pitch}
              onMouseDown={() => handleMouseDownKey(pitch)}
              onMouseUp={() => handleMouseUpKey(pitch)}
              onMouseLeave={() => isPressed && handleMouseUpKey(pitch)}
              className={`absolute top-1 h-14 w-[3.8%] rounded-b-md border border-slate-900 cursor-pointer z-20 flex flex-col justify-end items-center pb-1 text-[8px] font-mono transition-all ${
                isPressed
                  ? 'bg-fuchsia-500 text-white shadow-[0_0_12px_rgba(217,70,239,0.9)] translate-y-0.5'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
              style={{ left: `${leftPercent}%` }}
            >
              <span className="font-semibold">{getNoteName(pitch)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
