import React, { useState } from 'react';
import { Sparkles, X, Wand2, Music, Check, Loader2, ArrowRight } from 'lucide-react';
import { ProjectState, Track, Note } from '../types/daw';
import { ROOT_NOTES, MUSICAL_SCALES, DEFAULT_TRACK_EFFECTS } from '../audio/constants';

interface LayAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onApplyGeneratedProject: (generatedData: any) => void;
}

export const LayAiModal: React.FC<LayAiModalProps> = ({
  isOpen,
  onClose,
  project,
  onApplyGeneratedProject,
}) => {
  const [prompt, setPrompt] = useState('Cyberpunk synthwave in D minor with heavy arpeggiated bass and neon lead');
  const [genre, setGenre] = useState('Synthwave');
  const [bpm, setBpm] = useState(124);
  const [key, setKey] = useState('D');
  const [scale, setScale] = useState('Natural Minor');
  const [bars, setBars] = useState(4);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const presets = [
    {
      title: 'Neon Cyberpunk',
      genre: 'Cyberpunk',
      bpm: 128,
      key: 'D',
      scale: 'Phrygian (Cyberpunk)',
      prompt: 'Dystopian dark synth with driving 808 bass, sharp saw leads, and industrial drums',
    },
    {
      title: 'Lo-Fi Nostalgia',
      genre: 'Lo-Fi Chill',
      bpm: 86,
      key: 'F',
      scale: 'Major',
      prompt: 'Dusty vinyl rhodes chords, gentle warm sub bass, and relaxed boom-bap rhythm',
    },
    {
      title: 'Outrun Synthwave',
      genre: 'Synthwave',
      bpm: 120,
      key: 'A',
      scale: 'Dorian (Synthwave)',
      prompt: '80s arcade racing synthwave with running bassline, shimmering pads, and gated snare',
    },
    {
      title: 'Ambient Deep Void',
      genre: 'Ambient',
      bpm: 95,
      key: 'C',
      scale: 'Natural Minor',
      prompt: 'Cinematic celestial space pad with meditative evolving harmonies and subtle pulse',
    },
    {
      title: 'Retro 8-Bit Chiptune',
      genre: 'Chiptune',
      bpm: 136,
      key: 'G',
      scale: 'Pentatonic Major',
      prompt: 'Fast paced vintage Gameboy arcade melody with rapid arpeggios and punchy square waves',
    },
  ];

  const handleGenerate = async () => {
    setIsLoading(true);
    setStatusMessage('Synthesizing arrangement via LayAI & Gemini...');
    setResult(null);

    try {
      const res = await fetch('/api/ai-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          genre,
          bpm,
          key: `${key} ${scale}`,
          lengthBars: bars,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setResult(json.data);
        setStatusMessage(
          json.fallback
            ? '✓ Generated via MidiMuse Algorithmic Rules (Offline Mode)'
            : '✓ Composed via Gemini Generative Studio'
        );
      } else {
        setStatusMessage('Generation failed, please try again.');
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage('Error contacting generator: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    onApplyGeneratedProject(result);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-md shadow-amber-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>LayAI & MidiMuse Copilot</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/40">
                  AI Arranger
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Natural language music director & algorithmic harmony architect
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
        <div className="p-6 overflow-y-auto flex flex-col gap-4 text-xs">
          {/* Quick Presets */}
          <div>
            <span className="text-slate-400 font-semibold block mb-1.5">Style Presets:</span>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.title}
                  onClick={() => {
                    setPrompt(p.prompt);
                    setGenre(p.genre);
                    setBpm(p.bpm);
                    setKey(p.key);
                    setScale(p.scale);
                  }}
                  className="px-2.5 py-1 rounded-md bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt input */}
          <div>
            <label className="text-slate-300 font-semibold block mb-1">
              Music Vision Prompt:
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe mood, instruments, rhythm, bassline..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500/60"
            />
          </div>

          {/* Musical Parameters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-slate-400 font-medium block mb-1">Key Root:</label>
              <select
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2 outline-none"
              >
                {ROOT_NOTES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 font-medium block mb-1">Musical Scale:</label>
              <select
                value={scale}
                onChange={(e) => setScale(e.target.value)}
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2 outline-none"
              >
                {Object.keys(MUSICAL_SCALES).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 font-medium block mb-1">Tempo (BPM):</label>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value) || 120)}
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2 outline-none"
              />
            </div>

            <div>
              <label className="text-slate-400 font-medium block mb-1">Length:</label>
              <select
                value={bars}
                onChange={(e) => setBars(parseInt(e.target.value))}
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-lg p-2 outline-none"
              >
                <option value="2">2 Bars</option>
                <option value="4">4 Bars</option>
                <option value="8">8 Bars</option>
              </select>
            </div>
          </div>

          {/* Status feedback */}
          {statusMessage && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 font-mono text-[11px]">
              {statusMessage}
            </div>
          )}

          {/* Generated Result Preview */}
          {result && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">{result.title}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-400">
                  {result.bpm} BPM • {result.key}
                </span>
              </div>
              <p className="text-slate-400 text-xs">{result.description}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {result.tracks?.map((t: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] flex justify-between items-center"
                  >
                    <span className="font-medium text-slate-300">{t.name}</span>
                    <span className="text-slate-500 font-mono">
                      {t.notes?.length || 0} notes
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 flex items-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Composing...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Generate Arrangement</span>
                </>
              )}
            </button>

            {result && (
              <button
                onClick={handleApply}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 shadow-md"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply to DAW</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
