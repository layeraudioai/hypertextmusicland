import React, { useRef, useEffect, useState } from 'react';
import {
  Video,
  Film,
  Sparkles,
  Maximize2,
  Minimize2,
  CircleDot,
  Download,
  Sliders,
  Eye,
  EyeOff,
  Radio,
  Tv,
} from 'lucide-react';
import { ProjectState, VisualTheme, VisionFlowConfig } from '../types/daw';
import { visionFlow } from '../video/visionFlowRenderer';
import { synth } from '../audio/synthEngine';

interface VisionFlowStudioProps {
  project: ProjectState;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState) => void;
  currentBeat: number;
  isPlaying: boolean;
}

export const VisionFlowStudio: React.FC<VisionFlowStudioProps> = ({
  project,
  onUpdateProject,
  currentBeat,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const defaultConfig: VisionFlowConfig = {
    theme: 'neon-aura',
    bloom: 0.85,
    reactivity: 1.4,
    flowSpeed: 1.0,
    particleCount: 180,
    showPianoWaterfall: true,
    showWaveform: true,
    showSpectrogram: true,
    showTextOverlay: true,
    titleText: 'AURAVISION HYBRID • 124 BPM',
    aspectRatio: '16:9',
  };
  const config: VisionFlowConfig = { ...defaultConfig, ...(project.visionFlow || {}) };

  // Initialize renderer loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas dimensions
    const resizeCanvas = () => {
      if (containerRef.current && canvas) {
        const rect = containerRef.current.getBoundingClientRect();
        canvas.width = Math.floor(rect.width);
        canvas.height = Math.floor(rect.height);
      }
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (containerRef.current) observer.observe(containerRef.current);

    visionFlow.init(canvas, synth.getAnalyser());
    visionFlow.startRenderLoop(
      () => project.visionFlow,
      () => currentBeat,
      () => project.tracks,
      () => isPlaying
    );

    return () => {
      observer.disconnect();
      visionFlow.stopRenderLoop();
    };
  }, [project.tracks, currentBeat, isPlaying, project.visionFlow]);

  // Video recording timer
  useEffect(() => {
    let timer: any;
    if (isRecordingVideo) {
      timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } else {
      setRecordSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isRecordingVideo]);

  const handleToggleRecordVideo = async () => {
    if (!isRecordingVideo) {
      // Connect Web Audio to stream
      const audioCtx = synth.getAudioContext();
      let streamDest: MediaStreamAudioDestinationNode | null = null;
      if (audioCtx) {
        streamDest = audioCtx.createMediaStreamDestination();
        const analyser = synth.getAnalyser();
        if (analyser) analyser.connect(streamDest);
      }

      const started = visionFlow.startRecording(streamDest);
      if (started) {
        setIsRecordingVideo(true);
      }
    } else {
      try {
        const videoBlob = await visionFlow.stopRecording();
        setIsRecordingVideo(false);

        // Download WebM video file
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.title.replace(/\s+/g, '_')}_AuraVision.webm`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to stop video recording:', err);
        setIsRecordingVideo(false);
      }
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const themes: { id: VisualTheme; label: string; icon: string }[] = [
    { id: 'neon-aura', label: 'Neon Aura Waterfall', icon: '✨' },
    { id: 'cyber-grid', label: '3D Cyber Grid', icon: '🌐' },
    { id: 'particle-vortex', label: 'Particle Vortex', icon: '🌀' },
    { id: 'nebula-bloom', label: 'Nebula Bloom', icon: '🌌' },
    { id: 'retro-vhs', label: 'Retro VHS Glitch', icon: '📼' },
    { id: 'kaleidoscope', label: 'Kaleidoscope', icon: '🔮' },
  ];

  return (
    <div id="visionflow-studio-container" className="flex-1 flex flex-col lg:flex-row bg-slate-950 overflow-hidden select-none">
      {/* Visual Canvas Stage */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-[380px]"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Stage Floating Action Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
          {/* Record Video Button */}
          <button
            onClick={handleToggleRecordVideo}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-md transition-all ${
              isRecordingVideo
                ? 'bg-rose-600 text-white animate-pulse shadow-rose-600/50'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700'
            }`}
            title="Record Audio-Reactive Video to WebM file"
          >
            <CircleDot className={`w-4 h-4 ${isRecordingVideo ? 'text-white animate-ping' : 'text-rose-400'}`} />
            <span>{isRecordingVideo ? `REC [${recordSeconds}s]` : 'Record Video'}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={handleToggleFullscreen}
            className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 backdrop-blur-md shadow-lg"
            title="Fullscreen Stage Mode"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Live Audio Reaction Badge */}
        <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] font-mono text-cyan-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>VisionFlow Engine • 60 FPS Reactive</span>
        </div>
      </div>

      {/* Video Synthesizer Parameter Inspector */}
      <div className="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto max-h-[50vh] lg:max-h-full">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Tv className="w-4 h-4 text-fuchsia-400" />
            <span>Video Scene Style</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    visionFlow: { ...prev.visionFlow, theme: t.id },
                  }))
                }
                className={`p-2.5 rounded-lg border text-left text-xs font-medium flex items-center gap-2 transition-all ${
                  config.theme === t.id
                    ? 'bg-fuchsia-950/60 border-fuchsia-500 text-fuchsia-300 shadow-sm shadow-fuchsia-500/20'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{t.icon}</span>
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Reactive Overlays */}
        <div className="border-t border-slate-800 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Reactive Overlays
          </h3>
          <div className="flex flex-col gap-2 text-xs">
            <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 cursor-pointer">
              <span>Synthesia Piano Waterfall</span>
              <input
                type="checkbox"
                checked={config.showPianoWaterfall}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    visionFlow: { ...prev.visionFlow, showPianoWaterfall: e.target.checked },
                  }))
                }
                className="accent-sky-400"
              />
            </label>

            <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 cursor-pointer">
              <span>Oscilloscope Waveform</span>
              <input
                type="checkbox"
                checked={config.showWaveform}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    visionFlow: { ...prev.visionFlow, showWaveform: e.target.checked },
                  }))
                }
                className="accent-sky-400"
              />
            </label>

            <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 cursor-pointer">
              <span>Spectrogram Spectrum Bars</span>
              <input
                type="checkbox"
                checked={config.showSpectrogram}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    visionFlow: { ...prev.visionFlow, showSpectrogram: e.target.checked },
                  }))
                }
                className="accent-sky-400"
              />
            </label>

            <label className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 cursor-pointer">
              <span>Title Text Overlay</span>
              <input
                type="checkbox"
                checked={config.showTextOverlay}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    visionFlow: { ...prev.visionFlow, showTextOverlay: e.target.checked },
                  }))
                }
                className="accent-sky-400"
              />
            </label>

            {config.showTextOverlay && (
              <input
                type="text"
                value={config.titleText}
                onChange={(e) =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    visionFlow: { ...prev.visionFlow, titleText: e.target.value },
                  }))
                }
                placeholder="Overlay text..."
                className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded px-2 py-1 text-xs outline-none focus:border-fuchsia-500"
              />
            )}
          </div>
        </div>

        {/* Shader / Parameter Sliders */}
        <div className="border-t border-slate-800 pt-3 flex flex-col gap-3 text-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Shader Dynamics
          </h3>

          <div>
            <div className="flex justify-between text-slate-400 font-mono mb-1">
              <span>Bloom Glow:</span>
              <span>{Math.round(config.bloom * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={config.bloom}
              onChange={(e) =>
                onUpdateProject((prev) => ({
                  ...prev,
                  visionFlow: { ...prev.visionFlow, bloom: parseFloat(e.target.value) },
                }))
              }
              className="w-full h-1 accent-fuchsia-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-400 font-mono mb-1">
              <span>Audio Reactivity:</span>
              <span>{(config.reactivity ?? 1.4).toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={config.reactivity ?? 1.4}
              onChange={(e) =>
                onUpdateProject((prev) => ({
                  ...prev,
                  visionFlow: { ...prev.visionFlow, reactivity: parseFloat(e.target.value) },
                }))
              }
              className="w-full h-1 accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-400 font-mono mb-1">
              <span>Flow Speed:</span>
              <span>{(config.flowSpeed ?? 1.0).toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="2.5"
              step="0.1"
              value={config.flowSpeed ?? 1.0}
              onChange={(e) =>
                onUpdateProject((prev) => ({
                  ...prev,
                  visionFlow: { ...prev.visionFlow, flowSpeed: parseFloat(e.target.value) },
                }))
              }
              className="w-full h-1 accent-sky-400 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
