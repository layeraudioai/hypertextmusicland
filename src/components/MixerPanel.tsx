import React from 'react';
import { Sliders, Volume2, Activity } from 'lucide-react';
import { ProjectState } from '../types/daw';

interface MixerPanelProps {
  project: ProjectState;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  isPlaying: boolean;
}

export const MixerPanel: React.FC<MixerPanelProps> = ({
  project,
  onUpdateProject,
  isPlaying,
}) => {
  return (
    <div id="daw-mixer-container" className="flex-1 bg-slate-950 p-6 flex flex-col gap-4 overflow-x-auto select-none">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-sky-400" />
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            66GHz Master Console & Channel Strips
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400">
          DSP Engine: 32-bit Floating Point • Stereo Bus
        </span>
      </div>

      {/* Channel Strips Row */}
      <div className="flex-1 flex gap-3 overflow-x-auto items-stretch min-h-[360px]">
        {/* Track Channel Strips */}
        {project.tracks.map((track) => {
          const isSelected = track.id === project.selectedTrackId;

          return (
            <div
              key={track.id}
              onClick={() =>
                onUpdateProject((prev) => ({ ...prev, selectedTrackId: track.id }))
              }
              className={`w-36 flex-shrink-0 rounded-xl border flex flex-col justify-between p-3 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-slate-900/90 border-sky-500/50 shadow-lg shadow-sky-500/10'
                  : 'bg-slate-900/40 border-slate-800 hover:bg-slate-900/70'
              }`}
            >
              {/* Header: Track Name & Color */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: track.color }}
                />
                <span className="font-bold text-xs text-slate-200 truncate" title={track.name}>
                  {track.name}
                </span>
              </div>

              {/* Pan Knob */}
              <div className="flex flex-col items-center gap-1 my-2">
                <span className="text-[10px] text-slate-400 font-mono">
                  PAN: {track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.abs(Math.round(track.pan * 100))}` : `R${Math.round(track.pan * 100)}`}
                </span>
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
                  className="w-24 h-1 accent-cyan-400 cursor-pointer"
                />
              </div>

              {/* Fader & VU Meter */}
              <div className="flex-1 flex justify-center items-center gap-4 py-2">
                {/* Vertical Volume Slider */}
                <div className="h-44 flex items-center">
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
                    className="h-40 -rotate-90 w-40 accent-sky-400 cursor-pointer origin-center"
                    style={{ transformOrigin: 'center center' }}
                  />
                </div>

                {/* Animated VU Peak Meter */}
                <div className="w-3 h-40 bg-slate-950 rounded-full border border-slate-800 p-0.5 flex flex-col justify-end overflow-hidden">
                  <div
                    className="w-full rounded-full transition-all duration-75 bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500"
                    style={{
                      height: isPlaying && !track.muted ? `${Math.min(100, track.volume * 80 + Math.random() * 15)}%` : '0%',
                    }}
                  />
                </div>
              </div>

              {/* Decibel Label */}
              <div className="text-center font-mono text-[11px] text-slate-400 my-1">
                {(track.volume ?? 0.85) <= 0.0001 ? '-inf dB' : `${(20 * Math.log10(track.volume ?? 0.85)).toFixed(1)} dB`}
              </div>

              {/* Mute / Solo Buttons */}
              <div className="flex gap-1 pt-2 border-t border-slate-800">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateProject((prev) => ({
                      ...prev,
                      tracks: prev.tracks.map((t) =>
                        t.id === track.id ? { ...t, muted: !t.muted } : t
                      ),
                    }));
                  }}
                  className={`flex-1 py-1 rounded text-[11px] font-bold font-mono transition-colors ${
                    track.muted
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  MUTE
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateProject((prev) => {
                      const target = prev.tracks.find((t) => t.id === track.id);
                      const isSolo = target?.solo;
                      return {
                        ...prev,
                        tracks: prev.tracks.map((t) => ({
                          ...t,
                          solo: t.id === track.id ? !isSolo : false,
                        })),
                      };
                    });
                  }}
                  className={`flex-1 py-1 rounded text-[11px] font-bold font-mono transition-colors ${
                    track.solo
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  SOLO
                </button>
              </div>
            </div>
          );
        })}

        {/* Master Output Channel Strip */}
        <div className="w-40 flex-shrink-0 rounded-xl border border-sky-500/40 bg-slate-900/90 flex flex-col justify-between p-3 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Volume2 className="w-4 h-4 text-sky-400" />
            <span className="font-bold text-xs text-sky-300">MASTER STEREO</span>
          </div>

          <div className="text-center font-mono text-[10px] text-slate-400 my-2">
            LIMITER: ACTIVE
          </div>

          {/* Master Fader */}
          <div className="flex-1 flex justify-center items-center gap-4 py-2">
            <div className="h-44 flex items-center">
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
                className="h-40 -rotate-90 w-40 accent-sky-400 cursor-pointer origin-center"
              />
            </div>

            {/* Master Stereo Peak Bars */}
            <div className="flex gap-1">
              <div className="w-2.5 h-40 bg-slate-950 rounded-full border border-slate-800 p-0.5 flex flex-col justify-end overflow-hidden">
                <div
                  className="w-full rounded-full transition-all duration-75 bg-gradient-to-t from-sky-500 via-amber-400 to-rose-500"
                  style={{
                    height: isPlaying ? `${Math.min(100, project.masterVolume * 85 + Math.random() * 10)}%` : '0%',
                  }}
                />
              </div>
              <div className="w-2.5 h-40 bg-slate-950 rounded-full border border-slate-800 p-0.5 flex flex-col justify-end overflow-hidden">
                <div
                  className="w-full rounded-full transition-all duration-75 bg-gradient-to-t from-sky-500 via-amber-400 to-rose-500"
                  style={{
                    height: isPlaying ? `${Math.min(100, project.masterVolume * 83 + Math.random() * 10)}%` : '0%',
                  }}
                />
              </div>
            </div>
          </div>

          <div className="text-center font-mono text-xs font-bold text-sky-400 my-1">
            {(project.masterVolume ?? 0.9) <= 0.0001
              ? '-inf dB'
              : `${(20 * Math.log10(project.masterVolume ?? 0.9)).toFixed(1)} dB`}
          </div>

          <div className="p-1 rounded bg-slate-950 text-center font-mono text-[10px] text-slate-400 border border-slate-800">
            0.0 dB CLIP SAFE
          </div>
        </div>
      </div>
    </div>
  );
};
