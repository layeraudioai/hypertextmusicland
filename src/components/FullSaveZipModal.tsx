import React, { useState } from 'react';
import {
  FolderArchive,
  Download,
  CheckCircle2,
  FileAudio,
  Music,
  Layers,
  FileCode,
  X,
  RefreshCw,
  Sparkles,
  Sliders,
  Check,
} from 'lucide-react';
import { ProjectState } from '../types/daw';
import { exportFullDawZip, ExportProgress } from '../audio/zipArchiver';
import { sampleManager } from '../audio/audioProcessor';
import { synth } from '../audio/synthEngine';

interface FullSaveZipModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
}

export const FullSaveZipModal: React.FC<FullSaveZipModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress>({ message: '', percent: 0 });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [zipSize, setZipSize] = useState<string | null>(null);

  if (!isOpen) return null;

  const safeTitle = (project.title || 'AuraVision_Project').replace(/[^a-zA-Z0-9_-]/g, '_');
  const zipFileName = `${safeTitle}_Full_DAW_Package.zip`;

  const totalNotes = project.tracks.reduce((sum, t) => sum + t.notes.length, 0);
  const customInstrumentsCount = sampleManager.getAllInstruments().length;
  const synthSamplesCount = synth.getAllCustomSamples().length;

  const handleStartExport = async () => {
    setIsExporting(true);
    setDownloadUrl(null);
    setZipSize(null);
    setProgress({ message: 'Initializing DAW archive packaging engine...', percent: 2 });

    try {
      synth.init();
      const zipBlob = await exportFullDawZip(project, (p) => {
        setProgress(p);
      });

      const sizeMb = (zipBlob.size / (1024 * 1024)).toFixed(2);
      setZipSize(`${sizeMb} MB`);

      const url = URL.createObjectURL(zipBlob);
      setDownloadUrl(url);

      // Trigger instant automatic download
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('ZIP export error:', err);
      alert('Failed to generate full DAW ZIP package: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div
        className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-slate-100 font-bold text-base">Full DAW Export Package</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-purple-950 text-purple-300 border border-purple-800/50">
                  .ZIP Master Archive
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                Full saving to DAW stems + MIDI + SF2 SoundFonts + Master mixdown
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Contents Breakdown */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4 text-xs">
          {/* Summary Box */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase font-mono text-slate-500">Project</span>
              <span className="font-bold text-slate-200 truncate">{project.title}</span>
              <span className="text-[10px] text-purple-400 font-mono">{project.bpm} BPM • {project.totalBars} Bars</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase font-mono text-slate-500">Audio Stems</span>
              <span className="font-bold text-slate-200">{project.tracks.length} Stems</span>
              <span className="text-[10px] text-sky-400 font-mono">32-bit Float WAVs</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase font-mono text-slate-500">MIDI Files</span>
              <span className="font-bold text-slate-200">{project.tracks.length + 1} Files</span>
              <span className="text-[10px] text-emerald-400 font-mono">{totalNotes} Total Notes</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase font-mono text-slate-500">SoundFonts</span>
              <span className="font-bold text-slate-200">{Math.max(1, customInstrumentsCount || synthSamplesCount)} SF2 Banks</span>
              <span className="text-[10px] text-amber-400 font-mono">RIFF SFBK Format</span>
            </div>
          </div>

          {/* Directory Tree Visualization */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 flex flex-col gap-2 font-mono text-[11px]">
            <span className="text-slate-400 font-sans font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <FolderArchive className="w-3.5 h-3.5 text-purple-400" />
              <span>Archive Directory Structure</span>
            </span>

            <div className="flex flex-col gap-1 text-slate-300 pl-2 border-l border-slate-800/80">
              <div className="flex items-center gap-2 text-purple-300 font-semibold">
                <span>📁 {zipFileName}</span>
              </div>
              <div className="pl-4 flex flex-col gap-1 text-slate-400">
                <div className="flex items-center gap-2 text-slate-200">
                  <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                  <span>project.json</span>
                  <span className="text-[10px] text-slate-500 font-sans">(Full DAW session recall)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-200">
                  <FileAudio className="w-3.5 h-3.5 text-sky-400" />
                  <span>masters/</span>
                  <span className="text-[10px] text-slate-500 font-sans">({safeTitle}_Master_Mix.wav)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-200">
                  <Sliders className="w-3.5 h-3.5 text-purple-400" />
                  <span>stems/</span>
                  <span className="text-[10px] text-slate-500 font-sans">
                    ({project.tracks.length} individual track stems in WAV)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-200">
                  <Music className="w-3.5 h-3.5 text-emerald-400" />
                  <span>midi/</span>
                  <span className="text-[10px] text-slate-500 font-sans">
                    (Full project multi-track + {project.tracks.length} track MIDIs)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-200">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>sf2/</span>
                  <span className="text-[10px] text-slate-500 font-sans">
                    (SoundFont 2.04 container binaries + instruments_manifest.json)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-200">
                  <FileCode className="w-3.5 h-3.5 text-slate-400" />
                  <span>README.txt</span>
                  <span className="text-[10px] text-slate-500 font-sans">(Complete session guide & track sheet)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress / Status Display */}
          {isExporting && (
            <div className="p-4 rounded-xl border border-purple-500/40 bg-purple-950/20 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-purple-300 font-semibold flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                  <span>{progress.message || 'Exporting DAW package...'}</span>
                </span>
                <span className="font-mono text-purple-300 font-bold">{progress.percent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-purple-900/50">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-sky-400 transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Success Download Card */}
          {downloadUrl && !isExporting && (
            <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-100 text-xs">
                    ZIP Archive Created Successfully!
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Automatic download started • File size: <span className="text-emerald-300 font-mono">{zipSize}</span>
                  </p>
                </div>
              </div>

              <a
                href={downloadUrl}
                download={zipFileName}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Re-Download ZIP</span>
              </a>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Compatible with FL Studio, Ableton Live, Logic Pro, Pro Tools, Reaper
          </span>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
            >
              Close
            </button>

            <button
              onClick={handleStartExport}
              disabled={isExporting}
              className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-purple-500 via-indigo-500 to-sky-500 hover:from-purple-400 hover:to-sky-400 text-slate-950 shadow-lg shadow-purple-500/25 flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Rendering & Packaging ZIP...</span>
                </>
              ) : (
                <>
                  <FolderArchive className="w-4 h-4" />
                  <span>Download Full DAW ZIP Package</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
