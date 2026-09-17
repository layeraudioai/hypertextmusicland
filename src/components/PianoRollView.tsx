import React, { useState, useRef } from 'react';
import {
  Pencil,
  Eraser,
  MousePointer,
  Sparkles,
  Dices,
  Trash2,
  ZoomIn,
  ZoomOut,
  Music,
} from 'lucide-react';
import { ProjectState, Note, Track } from '../types/daw';
import { ROOT_NOTES, MUSICAL_SCALES, getNoteName, getPitchColor } from '../audio/constants';
import { synth } from '../audio/synthEngine';
import { MidiMuseEngine } from '../audio/midiMuse';
import { SonicRNGEngine } from '../audio/sonicRng';
import { SeededRNG } from '../audio/seededRng';

interface PianoRollViewProps {
  project: ProjectState;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  currentBeat: number;
  onSeek: (beat: number) => void;
}

export const PianoRollView: React.FC<PianoRollViewProps> = ({
  project,
  onUpdateProject,
  currentBeat,
  onSeek,
}) => {
  const [tool, setTool] = useState<'draw' | 'erase' | 'select'>('draw');
  const [snapValue, setSnapValue] = useState<number>(0.25); // 0.25 beat = 16th note
  const [selectedScale, setSelectedScale] = useState<string>('Natural Minor');
  const [selectedRoot, setSelectedRoot] = useState<string>('D');

  // Pitch range: MIDI 36 (C2) to 84 (C6) = 48 notes
  const minPitch = 36;
  const maxPitch = 84;
  const totalPitches = maxPitch - minPitch + 1;

  const totalBeats = project.totalBars * 4;
  const pixelsPerBeat = 64; // width per beat in piano roll
  const noteRowHeight = 20; // height per note pitch

  const activeTrack =
    project.tracks.find((t) => t.id === project.selectedTrackId) || project.tracks[0];

  const gridRef = useRef<HTMLDivElement>(null);

  // Play audio preview when clicking a piano key
  const handleKeyClick = (pitch: number) => {
    if (activeTrack) {
      synth.triggerLiveNoteOn(activeTrack, pitch, 0.85);
      setTimeout(() => synth.triggerLiveNoteOff(activeTrack, pitch), 300);
    }
  };

  // Add / Delete notes on grid click
  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!gridRef.current || !activeTrack) return;
    const rect = gridRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + gridRef.current.scrollLeft;
    const clickY = e.clientY - rect.top + gridRef.current.scrollTop;

    // Calculate clicked pitch & beat
    const pitchIndex = Math.floor(clickY / noteRowHeight);
    const pitch = maxPitch - pitchIndex;
    const rawBeat = clickX / pixelsPerBeat;
    const snappedBeat = Math.floor(rawBeat / snapValue) * snapValue;

    if (pitch < minPitch || pitch > maxPitch || snappedBeat >= totalBeats) return;

    if (tool === 'draw') {
      // Add note
      const newNote: Note = {
        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        pitch,
        time: Number(snappedBeat.toFixed(3)),
        duration: snapValue * 2, // default length
        velocity: 0.85,
      };

      // Preview sound immediately
      synth.triggerLiveNoteOn(activeTrack, pitch, 0.85);
      setTimeout(() => synth.triggerLiveNoteOff(activeTrack, pitch), 200);

      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === activeTrack.id ? { ...t, notes: [...t.notes, newNote] } : t
        ),
      }));
    }
  };

  const handleNoteClick = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (!activeTrack) return;

    if (tool === 'erase') {
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === activeTrack.id
            ? { ...t, notes: t.notes.filter((n) => n.id !== noteId) }
            : t
        ),
      }));
    }
  };

  // MidiMuse: Scale Quantize all notes on track
  const handleQuantizeTrack = () => {
    if (!activeTrack) return;
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.id !== activeTrack.id) return t;
        const quantizedNotes = t.notes.map((n) => ({
          ...n,
          pitch: MidiMuseEngine.quantizeToScale(n.pitch, selectedScale, selectedRoot),
        }));
        return { ...t, notes: quantizedNotes };
      }),
    }));
  };

  // MidiMuse: Algorithmic Motif Generator
  const handleGenerateMuseMotif = (style: 'melody' | 'arpeggio' | 'bass' | 'chords') => {
    if (!activeTrack) return;
    const notes = MidiMuseEngine.generateMuseSequence(
      project.totalBars,
      selectedScale,
      selectedRoot,
      activeTrack.instrument === 'analog_bass' ? 2 : 4,
      0.8,
      style
    );

    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === activeTrack.id ? { ...t, notes } : t
      ),
    }));
  };

  // SonicRNG: Glitch fill injection
  const handleSonicRngGlitch = () => {
    if (!activeTrack) return;
    const rng = new SeededRNG(Date.now());
    const glitchNotes = SonicRNGEngine.rollGlitchFill(rng, activeTrack.notes, Math.floor(currentBeat), 1.0);
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === activeTrack.id ? { ...t, notes: [...t.notes, ...glitchNotes] } : t
      ),
    }));
  };

  const handleClearTrackNotes = () => {
    if (!activeTrack) return;
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === activeTrack.id ? { ...t, notes: [] } : t
      ),
    }));
  };

  return (
    <div id="piano-roll-container" className="flex-1 flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* Piano Roll Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs gap-3">
        {/* Active Track Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold">Track:</span>
          <select
            value={activeTrack?.id}
            onChange={(e) =>
              onUpdateProject((prev) => ({ ...prev, selectedTrackId: e.target.value }))
            }
            className="bg-slate-950 text-slate-200 border border-slate-700 rounded px-2 py-1 outline-none font-medium"
          >
            {project.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.notes.length} notes)
              </option>
            ))}
          </select>
        </div>

        {/* Edit Tools */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setTool('draw')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'draw' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Draw Note (Pencil)"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTool('erase')}
            className={`p-1.5 rounded transition-colors ${
              tool === 'erase' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Erase Note"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Snap Grid */}
        <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-slate-300">
          <span className="text-[10px] text-slate-400 uppercase">Snap:</span>
          <select
            value={snapValue}
            onChange={(e) => setSnapValue(parseFloat(e.target.value))}
            className="bg-transparent text-slate-200 outline-none text-xs"
          >
            <option value="1" className="bg-slate-900">1/4 Note (Beat)</option>
            <option value="0.5" className="bg-slate-900">1/8 Note</option>
            <option value="0.25" className="bg-slate-900">1/16 Note</option>
            <option value="0.125" className="bg-slate-900">1/32 Note</option>
          </select>
        </div>

        {/* MidiMuse Scale Quantizer Controls */}
        <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Scale:</span>
          <select
            value={selectedRoot}
            onChange={(e) => setSelectedRoot(e.target.value)}
            className="bg-transparent text-slate-200 outline-none text-xs font-mono"
          >
            {ROOT_NOTES.map((r) => (
              <option key={r} value={r} className="bg-slate-900">{r}</option>
            ))}
          </select>
          <select
            value={selectedScale}
            onChange={(e) => setSelectedScale(e.target.value)}
            className="bg-transparent text-slate-200 outline-none text-xs"
          >
            {Object.keys(MUSICAL_SCALES).map((s) => (
              <option key={s} value={s} className="bg-slate-900">{s}</option>
            ))}
          </select>
          <button
            onClick={handleQuantizeTrack}
            className="px-2 py-0.5 rounded bg-sky-950 hover:bg-sky-900 text-sky-400 border border-sky-800/60 text-[11px]"
            title="Lock all track notes strictly to chosen scale"
          >
            Quantize
          </button>
        </div>

        {/* Generative Algorithmic Helpers */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleGenerateMuseMotif('melody')}
            className="px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 text-xs flex items-center gap-1"
            title="MidiMuse: Algorithmic Melody Generation"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Muse Melody</span>
          </button>
          <button
            onClick={() => handleGenerateMuseMotif('arpeggio')}
            className="px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 text-xs"
            title="MidiMuse: Triadex Arpeggio"
          >
            Arp
          </button>
          <button
            onClick={handleSonicRngGlitch}
            className="px-2.5 py-1 rounded bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/60 text-xs flex items-center gap-1"
            title="Sonic RNG: Inject 32nd Note Glitch Stutter"
          >
            <Dices className="w-3 h-3 text-purple-400" />
            <span>Glitch</span>
          </button>
          <button
            onClick={handleClearTrackNotes}
            className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400"
            title="Clear All Notes"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Piano Roll Workspace */}
      <div className="flex-1 flex overflow-auto relative">
        {/* Left Vertical Keyboard */}
        <div className="w-20 flex-shrink-0 bg-slate-900 border-r border-slate-800 z-10 sticky left-0">
          {/* Top ruler placeholder */}
          <div className="h-8 border-b border-slate-800 bg-slate-950 px-2 flex items-center text-[10px] font-mono text-slate-500">
            KEY
          </div>
          {/* Keys list descending from maxPitch to minPitch */}
          {Array.from({ length: totalPitches }).map((_, idx) => {
            const pitch = maxPitch - idx;
            const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);
            const noteName = getNoteName(pitch);

            return (
              <div
                key={pitch}
                onClick={() => handleKeyClick(pitch)}
                className={`h-5 border-b border-slate-800/60 px-1.5 flex items-center justify-between text-[10px] font-mono cursor-pointer transition-colors ${
                  isBlack
                    ? 'bg-slate-950 hover:bg-slate-800 text-slate-400'
                    : 'bg-slate-850 hover:bg-slate-700 text-slate-200'
                }`}
                style={{ height: `${noteRowHeight}px` }}
                title={`Click to preview ${noteName}`}
              >
                <span>{noteName}</span>
                {pitch % 12 === 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                )}
              </div>
            );
          })}
        </div>

        {/* Grid Canvas */}
        <div
          ref={gridRef}
          onClick={handleGridClick}
          className="flex-1 flex flex-col relative cursor-crosshair"
          style={{ width: `${totalBeats * pixelsPerBeat}px` }}
        >
          {/* Top Bar/Beat Ruler */}
          <div className="h-8 border-b border-slate-800 bg-slate-950 flex sticky top-0 z-20">
            {Array.from({ length: project.totalBars }).map((_, bIdx) => (
              <div
                key={bIdx}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(bIdx * 4);
                }}
                className="h-full border-r border-slate-800 flex items-center px-2 text-[11px] font-mono text-slate-400 cursor-pointer hover:bg-slate-900"
                style={{ width: `${pixelsPerBeat * 4}px` }}
              >
                Bar {bIdx + 1}
              </div>
            ))}
          </div>

          {/* Scrubbing Playhead */}
          <div
            className="absolute top-8 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] z-30 pointer-events-none"
            style={{ left: `${currentBeat * pixelsPerBeat}px` }}
          />

          {/* Grid Rows for each pitch */}
          {Array.from({ length: totalPitches }).map((_, idx) => {
            const pitch = maxPitch - idx;
            const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);

            return (
              <div
                key={pitch}
                className={`w-full border-b border-slate-800/40 relative flex ${
                  isBlack ? 'bg-slate-950/90' : 'bg-slate-900/30'
                }`}
                style={{ height: `${noteRowHeight}px` }}
              >
                {/* Vertical bar grid dividers */}
                {Array.from({ length: project.totalBars * 4 }).map((_, beatIdx) => (
                  <div
                    key={beatIdx}
                    className={`h-full border-r ${
                      beatIdx % 4 === 3 ? 'border-slate-800' : 'border-slate-850/60'
                    }`}
                    style={{ width: `${pixelsPerBeat}px` }}
                  />
                ))}
              </div>
            );
          })}

          {/* Render Active Track Notes */}
          {activeTrack?.notes.map((note) => {
            if (note.pitch < minPitch || note.pitch > maxPitch) return null;
            const top = (maxPitch - note.pitch) * noteRowHeight;
            const left = note.time * pixelsPerBeat;
            const width = Math.max(12, note.duration * pixelsPerBeat);
            const color = getPitchColor(note.pitch);

            return (
              <div
                key={note.id}
                onClick={(e) => handleNoteClick(e, note.id)}
                className="absolute rounded-sm px-1.5 flex items-center justify-between text-[10px] font-mono font-bold shadow-md cursor-pointer hover:brightness-110 z-10"
                style={{
                  top: `${top + 32}px`, // offset by ruler height (32px)
                  left: `${left}px`,
                  width: `${width}px`,
                  height: `${noteRowHeight - 2}px`,
                  backgroundColor: color,
                  color: '#000000',
                  boxShadow: `0 0 8px ${color}88`,
                }}
                title={`${getNoteName(note.pitch)} • Click with Eraser to remove`}
              >
                <span className="truncate">{getNoteName(note.pitch)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
