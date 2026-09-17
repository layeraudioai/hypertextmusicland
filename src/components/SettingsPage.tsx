import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Zap,
  Activity,
  Sliders,
  Cpu,
  Monitor,
  Volume2,
  Tv,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Download,
  Upload,
  Gauge,
  Layers,
  HardDrive,
  BarChart3,
  ShieldCheck,
  Radio,
  ArrowRight,
  Terminal,
  Square,
  Play,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  PerformanceGenome,
  HardwareSpecs,
  BenchmarkScores,
  detectHardwareSpecs,
  getBaselineDefaultGenome,
  loadPerformanceGenome,
  savePerformanceGenome,
  applyGenomeToEngine,
  runComprehensiveBenchmark,
  fireAwayOptimization,
  syncGenomeWithServer,
  fetchGlobalBestGenome,
} from '../utils/performanceOptimizer';
import { synth } from '../audio/synthEngine';
import { visionFlow } from '../video/visionFlowRenderer';

interface SettingsPageProps {
  onBackToDaw?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBackToDaw }) => {
  const [genome, setGenome] = useState<PerformanceGenome>(loadPerformanceGenome);
  const [hardware, setHardware] = useState<HardwareSpecs>(detectHardwareSpecs);
  const [globalBest, setGlobalBest] = useState<PerformanceGenome | null>(null);

  // Live Telemetry
  const [liveFps, setLiveFps] = useState<number>(60);
  const [liveFrameTime, setLiveFrameTime] = useState<number>(16.6);
  const [droppedFrames, setDroppedFrames] = useState<number>(0);
  const [audioTelemetry, setAudioTelemetry] = useState<any>(synth.getAudioTelemetry());

  // Fire Away (Auto-Optimize) Execution State
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [fireAwayDuration, setFireAwayDuration] = useState<number>(25); // seconds
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [currentScore, setCurrentScore] = useState<number>(genome.fitness || 7500);
  const [bestScore, setBestScore] = useState<number>(genome.fitness || 7500);
  const [optimizationLogs, setOptimizationLogs] = useState<Array<{ msg: string; type: 'info' | 'success' | 'warning'; time: string }>>([
    { msg: 'LayAI Auto-Optimization ready. Click "Fire Away" to run genetic benchmark tuning.', type: 'info', time: new Date().toLocaleTimeString() },
  ]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Standalone Benchmarking State
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [benchmarkScores, setBenchmarkScores] = useState<BenchmarkScores>({
    total: genome.fitness || 7500,
    mix: genome.fitnessMix || 7600,
    render: genome.fitnessRender || 7400,
    visual: genome.fitnessVisual || 7500,
    analysis: genome.fitnessAnalysis || 7500,
  });

  // Success notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Poll live telemetry
  useEffect(() => {
    const timer = setInterval(() => {
      const vMetrics = visionFlow.getMetrics();
      setLiveFps(vMetrics.fps || 60);
      setLiveFrameTime(vMetrics.frameTimeMs || 16.6);
      setDroppedFrames(vMetrics.droppedFrames || 0);
      setAudioTelemetry(synth.getAudioTelemetry());
    }, 500);

    return () => clearInterval(timer);
  }, []);

  // Fetch cloud global best on mount
  useEffect(() => {
    fetchGlobalBestGenome().then((best) => {
      if (best) setGlobalBest(best);
    });
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [optimizationLogs]);

  // Update a specific genome gene and apply immediately
  const updateGene = <K extends keyof PerformanceGenome>(key: K, value: PerformanceGenome[K]) => {
    setGenome((prev) => {
      const next = { ...prev, [key]: value, timestamp: Date.now() };
      savePerformanceGenome(next);
      applyGenomeToEngine(next);
      return next;
    });
    showToast(`Updated ${String(key)}: ${value}`);
  };

  // Apply Fidelity Preset
  const applyPreset = (preset: 'low' | 'medium' | 'high' | 'ultra') => {
    let next: Partial<PerformanceGenome> = {};
    if (preset === 'low') {
      next = {
        audioQuality: 'low',
        midiSampleRate: 32000,
        polyphonyLimit: 24,
        reverbQuality: 'draft',
        visualResolutionScale: 0.75,
        visualFpsTarget: 30,
        particleDensity: 'low',
        bloomQuality: 'off',
        concurrency: 2,
        chunkSize: 2048,
        fftSize: 512,
      };
    } else if (preset === 'medium') {
      next = {
        audioQuality: 'medium',
        midiSampleRate: 44100,
        polyphonyLimit: 48,
        reverbQuality: 'studio',
        visualResolutionScale: 1.0,
        visualFpsTarget: 60,
        particleDensity: 'medium',
        bloomQuality: 'low',
        concurrency: 4,
        chunkSize: 4096,
        fftSize: 1024,
      };
    } else if (preset === 'high') {
      next = {
        audioQuality: 'high',
        midiSampleRate: 48000,
        polyphonyLimit: 64,
        reverbQuality: 'studio',
        visualResolutionScale: 1.0,
        visualFpsTarget: 60,
        particleDensity: 'high',
        bloomQuality: 'high',
        concurrency: Math.min(6, hardware.cpuCores),
        chunkSize: 4096,
        fftSize: 1024,
      };
    } else if (preset === 'ultra') {
      next = {
        audioQuality: 'ultra',
        midiSampleRate: 96000,
        polyphonyLimit: 128,
        reverbQuality: 'lush',
        visualResolutionScale: 1.5,
        visualFpsTarget: 120,
        particleDensity: 'ultra',
        bloomQuality: 'high',
        concurrency: Math.min(8, hardware.cpuCores),
        chunkSize: 8192,
        fftSize: 2048,
      };
    }

    setGenome((prev) => {
      const updated = { ...prev, ...next, timestamp: Date.now() };
      savePerformanceGenome(updated);
      applyGenomeToEngine(updated);
      return updated;
    });
    showToast(`Applied ${preset.toUpperCase()} performance & fidelity preset!`);
  };

  // Run Standalone Benchmark
  const handleRunBenchmark = async () => {
    if (isBenchmarking || isOptimizing) return;
    setIsBenchmarking(true);
    try {
      const scores = await runComprehensiveBenchmark(genome);
      setBenchmarkScores(scores);
      setGenome((prev) => {
        const next = {
          ...prev,
          fitness: scores.total,
          fitnessMix: scores.mix,
          fitnessRender: scores.render,
          fitnessVisual: scores.visual,
          fitnessAnalysis: scores.analysis,
        };
        savePerformanceGenome(next);
        return next;
      });
      showToast(`Benchmark complete! Overall Fitness: ${scores.total} points`);
    } catch (e: any) {
      showToast(`Benchmark error: ${e.message}`);
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Run LayAI "Fire Away (Auto-Optimize)" Engine
  const handleFireAway = async () => {
    if (isOptimizing) return;
    setIsOptimizing(true);
    setProgressPercent(0);
    setRemainingSeconds(fireAwayDuration);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const addLog = (msg: string, type: 'info' | 'success' | 'warning' = 'info') => {
      setOptimizationLogs((prev) => [...prev.slice(-30), { msg, type, time: new Date().toLocaleTimeString() }]);
    };

    addLog(`🔥 Firing Away: Initializing ${fireAwayDuration}s genetic optimization suite...`, 'info');

    try {
      const generator = fireAwayOptimization({
        durationSeconds: fireAwayDuration,
        signal: abortController.signal,
      });

      for await (const progress of generator) {
        setProgressPercent(progress.progressPercent);
        setRemainingSeconds(progress.remainingSeconds);
        setCurrentScore(progress.currentScore);
        setBestScore(progress.bestScore);
        setGenome(progress.activeGenome);

        if (progress.logMessage) {
          addLog(progress.logMessage, progress.logType);
        }
      }

      showToast(`🔥 Auto-Optimization Finished! New Fitness: ${bestScore}`);
      addLog(`Global Best Configuration Persisted to localStorage and Server.`, 'success');

      // Refresh global best comparison
      const updatedBest = await fetchGlobalBestGenome();
      if (updatedBest) setGlobalBest(updatedBest);
    } catch (err: any) {
      addLog(`Optimization aborted: ${err.message}`, 'warning');
    } finally {
      setIsOptimizing(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopFireAway = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      showToast('Stopping auto-optimization...');
    }
  };

  // Restore Hardware Factory Baseline
  const handleResetToBaseline = () => {
    const baseline = getBaselineDefaultGenome();
    setGenome(baseline);
    savePerformanceGenome(baseline);
    applyGenomeToEngine(baseline);
    showToast('Restored hardware baseline defaults');
  };

  // Export Genome JSON
  const handleExportConfig = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(genome, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `aura_performance_genome_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Exported performance configuration JSON');
  };

  // Import Genome JSON
  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed.concurrency === 'number') {
          const merged = { ...genome, ...parsed, timestamp: Date.now() };
          setGenome(merged);
          savePerformanceGenome(merged);
          applyGenomeToEngine(merged);
          showToast('Imported performance configuration successfully!');
        }
      } catch (err) {
        showToast('Invalid JSON file format');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div id="settings-page" className="flex-1 flex flex-col overflow-y-auto bg-slate-950 text-slate-100 select-none pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium text-xs shadow-xl shadow-cyan-600/30 border border-cyan-400/40 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Sparkles className="w-4 h-4 text-cyan-200 animate-spin" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Banner */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 sticky top-0 z-20">
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Flame className="w-5 h-5 text-slate-950 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  <span>Engine Settings & Optimization</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    LayAI GA v0.4
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400">
                Benchmarking metrics, genetic auto-optimization ("Fire Away"), dynamic audio DSP & visual resolution scaling.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onBackToDaw && (
              <button
                onClick={onBackToDaw}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              >
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                <span>Return to DAW</span>
              </button>
            )}

            <button
              onClick={handleRunBenchmark}
              disabled={isBenchmarking || isOptimizing}
              className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              title="Run quick 4-stage hardware benchmark"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isBenchmarking ? 'animate-spin' : ''}`} />
              <span>{isBenchmarking ? 'Benchmarking...' : 'Test Hardware'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex flex-col gap-6">
        {/* ========================================================================= */}
        {/* SECTION 1: LAYAI "FIRE AWAY (AUTO-OPTIMIZE)" COMMAND STATION             */}
        {/* ========================================================================= */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-amber-500/30 p-6 shadow-2xl relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
                <Flame className="w-7 h-7 text-slate-950 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black text-white tracking-tight">
                    LayAI "Fire Away" Auto-Optimization Engine
                  </h2>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                    Genetic Algorithm Mutation
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  Directly implements the genetic optimization loop from <strong className="text-amber-300">layai.ca</strong>. Mutates audio DSP parameters, concurrency limits, buffer chunks, and visual resolution to discover the optimal fitness profile for your machine.
                </p>
              </div>
            </div>

            {/* Fire Away Launch Controls */}
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              {/* Duration selector */}
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <span className="px-2 text-slate-400 font-mono text-[11px]">Duration:</span>
                {[10, 25, 45].map((sec) => (
                  <button
                    key={sec}
                    disabled={isOptimizing}
                    onClick={() => setFireAwayDuration(sec)}
                    className={`px-2.5 py-1 rounded-lg font-mono text-xs transition-all ${
                      fireAwayDuration === sec
                        ? 'bg-amber-500 text-slate-950 font-bold shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>

              {/* The "Fire Away" Primary Button */}
              {!isOptimizing ? (
                <button
                  id="btn-fire-away"
                  onClick={handleFireAway}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Flame className="w-5 h-5 fill-current" />
                  <span>Fire Away (Optimize)</span>
                </button>
              ) : (
                <button
                  onClick={handleStopFireAway}
                  className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop ({remainingSeconds}s left)</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar & Realtime Mutation Status */}
          {isOptimizing && (
            <div className="mb-6 p-4 rounded-xl bg-slate-950/80 border border-amber-500/40 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-amber-400 font-bold flex items-center gap-1.5">
                  <Flame className="w-4 h-4 animate-spin text-orange-400" />
                  Optimizing Genetic Genome... ({remainingSeconds}s remaining)
                </span>
                <span className="text-slate-300 font-bold">{progressPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-cyan-400 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 pt-1">
                <span>Testing Concurrency: <strong className="text-cyan-300">{genome.concurrency}</strong></span>
                <span>Sample Rate: <strong className="text-purple-300">{genome.midiSampleRate}Hz</strong></span>
                <span>Canvas Res: <strong className="text-emerald-300">{genome.visualResolutionScale}x</strong></span>
                <span>Polyphony: <strong className="text-amber-300">{genome.polyphonyLimit}</strong></span>
                <span>Target FPS: <strong className="text-sky-300">{genome.visualFpsTarget}</strong></span>
              </div>
            </div>
          )}

          {/* Live Score Meters & LayAI Event Terminal Log */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Current vs Best Score */}
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-amber-400" />
                <span>Fitness Evaluation</span>
              </span>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800/80">
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-mono">Current Fitness</div>
                  <div className="text-2xl font-black text-amber-400 font-mono">{currentScore.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400 uppercase font-mono">Best Recorded</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">{bestScore.toLocaleString()}</div>
                </div>
              </div>

              {globalBest && (
                <div className="text-[11px] text-slate-400 flex items-center justify-between px-1">
                  <span>Community Best:</span>
                  <span className="font-mono text-cyan-300 font-bold">{globalBest.fitness.toLocaleString()} pts</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="p-2 rounded bg-slate-900/80 border border-slate-800/50">
                  <div className="text-[10px] text-slate-400">Audio Mix</div>
                  <div className="font-mono font-bold text-slate-200">{genome.fitnessMix || 7600} pts</div>
                </div>
                <div className="p-2 rounded bg-slate-900/80 border border-slate-800/50">
                  <div className="text-[10px] text-slate-400">DSP Synth</div>
                  <div className="font-mono font-bold text-slate-200">{genome.fitnessRender || 7400} pts</div>
                </div>
                <div className="p-2 rounded bg-slate-900/80 border border-slate-800/50">
                  <div className="text-[10px] text-slate-400">Visual GPU</div>
                  <div className="font-mono font-bold text-slate-200">{genome.fitnessVisual || 7500} pts</div>
                </div>
                <div className="p-2 rounded bg-slate-900/80 border border-slate-800/50">
                  <div className="text-[10px] text-slate-400">FFT Analysis</div>
                  <div className="font-mono font-bold text-slate-200">{genome.fitnessAnalysis || 7500} pts</div>
                </div>
              </div>
            </div>

            {/* Terminal Event Log (LayAI faithful log console) */}
            <div className="lg:col-span-2 flex flex-col p-4 rounded-xl bg-slate-950/90 border border-slate-800 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px] font-bold">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>LayAI Optimization Telemetry Log</span>
                </span>
                <span className="text-[10px] text-slate-500">{optimizationLogs.length} events</span>
              </div>

              <div
                ref={logContainerRef}
                className="flex-1 overflow-y-auto max-h-44 flex flex-col gap-1 pr-1 scrollbar-thin scrollbar-thumb-slate-800"
              >
                {optimizationLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`text-[11px] leading-relaxed flex items-start gap-2 ${
                      log.type === 'success'
                        ? 'text-emerald-400'
                        : log.type === 'warning'
                        ? 'text-amber-400'
                        : 'text-slate-300'
                    }`}
                  >
                    <span className="text-slate-600 text-[10px] shrink-0">{log.time}</span>
                    <span>{log.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: LIVE TELEMETRY & HARDWARE GAUGES                             */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Gauge 1: Live FPS */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
              <span className="flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-sky-400" />
                <span>Render Framerate</span>
              </span>
              <span className="text-emerald-400 font-bold">{liveFrameTime} ms/f</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white font-mono">{liveFps}</span>
              <span className="text-xs text-slate-400 font-mono">FPS</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
              <span>Dropped Frames:</span>
              <span className={`font-mono font-bold ${droppedFrames > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {droppedFrames}
              </span>
            </div>
          </div>

          {/* Gauge 2: Audio Latency & Rate */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-purple-400" />
                <span>Audio Engine</span>
              </span>
              <span className="text-cyan-400 font-bold">{audioTelemetry.sampleRate} Hz</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white font-mono">{audioTelemetry.baseLatency}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
              <span>Voices / State:</span>
              <span className="font-mono text-slate-300">
                {audioTelemetry.activeVoices} act / {audioTelemetry.state}
              </span>
            </div>
          </div>

          {/* Gauge 3: Hardware Architecture */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-amber-400" />
                <span>CPU & Memory</span>
              </span>
              <span className="text-amber-400 font-mono text-[10px] uppercase font-bold">{hardware.estimatedTier} TIER</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white font-mono">{hardware.cpuCores}</span>
              <span className="text-xs text-slate-400 font-mono">Cores • {hardware.deviceMemoryGb}GB</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-2 truncate" title={hardware.gpuRenderer}>
              GPU: <span className="font-mono text-slate-300">{hardware.gpuRenderer.slice(0, 22)}...</span>
            </div>
          </div>

          {/* Gauge 4: Total Benchmark Fitness */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-2">
              <span className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Benchmark Score</span>
              </span>
              <span className="text-emerald-400 font-bold font-mono">{genome.fitness} pts</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400 font-mono">{benchmarkScores.total}</span>
              <span className="text-xs text-slate-400 font-mono">pts</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
              <span>Concurrency / Chunk:</span>
              <span className="font-mono text-slate-300">
                {genome.concurrency}T • {genome.chunkSize}b
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: FIDELITY PRESETS 1-CLICK SELECTOR                             */}
        {/* ========================================================================= */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Global Fidelity & Performance Presets</span>
              </h3>
              <p className="text-xs text-slate-400">
                Instantly re-orient audio synthesis resolution and visual particle density.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: 'low', label: 'Battery / Lo-Fi', desc: '32kHz, 24 Voices, 30 FPS, 0.75x' },
                { id: 'medium', label: 'Balanced Default', desc: '44.1kHz, 48 Voices, 60 FPS, 1.0x' },
                { id: 'high', label: 'Pro Studio High', desc: '48kHz, 64 Voices, 60 FPS, 1.0x' },
                { id: 'ultra', label: 'Ultra Audiophile', desc: '96kHz, 128 Voices, 120 FPS, 1.5x' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id as any)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-start cursor-pointer border ${
                    genome.audioQuality === p.id
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white border-sky-400 shadow-md shadow-sky-600/20'
                      : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 border-slate-800'
                  }`}
                >
                  <span>{p.label}</span>
                  <span className="text-[10px] text-slate-400 font-normal font-mono">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 4: DYNAMIC AUDIO QUALITY & FIDELITY SETTINGS                     */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col gap-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Dynamic Audio Quality & Synthesis Fidelity</h3>
                <p className="text-xs text-slate-400">Configure Web Audio DSP sample rates, polyphony limits, and algorithmic reverb tails.</p>
              </div>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/40">
              Web Audio 2.0 API
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Audio Sample Rate */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Synthesis Sample Rate</span>
                <span className="font-mono text-purple-400 font-bold">{genome.midiSampleRate} Hz</span>
              </label>
              <select
                value={genome.midiSampleRate}
                onChange={(e) => updateGene('midiSampleRate', parseInt(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs font-mono outline-none focus:border-purple-500"
              >
                <option value={22050}>22,050 Hz (Retro Lo-Fi / Lowest CPU)</option>
                <option value={32000}>32,000 Hz (Draft Performance)</option>
                <option value={44100}>44,100 Hz (CD Standard Studio)</option>
                <option value={48000}>48,000 Hz (Pro Broadcast 24-bit)</option>
                <option value={96000}>96,000 Hz (Ultra High-Res Audiophile)</option>
              </select>
              <span className="text-[11px] text-slate-400">Controls synthesis sample rate for SoundFont voice generation & WAV exports.</span>
            </div>

            {/* Polyphony Voice Limit */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Max Polyphony Voice Cap</span>
                <span className="font-mono text-cyan-400 font-bold">{genome.polyphonyLimit} Voices</span>
              </label>
              <input
                type="range"
                min="16"
                max="128"
                step="8"
                value={genome.polyphonyLimit}
                onChange={(e) => updateGene('polyphonyLimit', parseInt(e.target.value))}
                className="accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-[11px] text-slate-400">Intelligent voice-stealing cap prevents CPU overload on dense chord passages.</span>
            </div>

            {/* Algorithmic Reverb Impulse Quality */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Convolution Reverb Fidelity</span>
                <span className="font-mono text-amber-400 font-bold uppercase">{genome.reverbQuality}</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
                {(['draft', 'studio', 'lush'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => updateGene('reverbQuality', q)}
                    className={`py-1.5 rounded-lg border transition-all ${
                      genome.reverbQuality === q
                        ? 'bg-purple-600 text-white border-purple-400 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {q.toUpperCase()}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400">Adjusts impulse response duration: Draft (1.0s), Studio (2.2s), Lush Hall (3.8s).</span>
            </div>

            {/* Resampling Mode */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>SoundFont Pitch Resampling</span>
                <span className="font-mono text-emerald-400 font-bold capitalize">{genome.resamplingMode}</span>
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <button
                  onClick={() => updateGene('resamplingMode', 'linear')}
                  className={`py-1.5 rounded-lg border transition-all ${
                    genome.resamplingMode === 'linear'
                      ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Linear (Fast)
                </button>
                <button
                  onClick={() => updateGene('resamplingMode', 'hermite')}
                  className={`py-1.5 rounded-lg border transition-all ${
                    genome.resamplingMode === 'hermite'
                      ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Hermite (Smooth)
                </button>
              </div>
              <span className="text-[11px] text-slate-400">Hermite cubic polynomial eliminates aliasing harmonics on repitched samples.</span>
            </div>

            {/* Mixing Concurrency & Buffer Chunk */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Mixing Buffer Chunk Size</span>
                <span className="font-mono text-sky-400 font-bold">{genome.chunkSize} frames</span>
              </label>
              <select
                value={genome.chunkSize}
                onChange={(e) => updateGene('chunkSize', parseInt(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs font-mono outline-none"
              >
                <option value={1024}>1024 frames (Ultra Low Latency - 23ms)</option>
                <option value={2048}>2048 frames (Balanced Interactive - 46ms)</option>
                <option value={4096}>4096 frames (Studio Standard - 92ms)</option>
                <option value={8192}>8192 frames (Glitch-Resistant Render)</option>
              </select>
              <span className="text-[11px] text-slate-400">Buffer size for stem processing and offline multi-track bounce.</span>
            </div>

            {/* Multi-thread Concurrency */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Worker Concurrency Limit</span>
                <span className="font-mono text-amber-400 font-bold">{genome.concurrency} Threads</span>
              </label>
              <input
                type="range"
                min="1"
                max={Math.max(8, hardware.cpuCores)}
                step="1"
                value={genome.concurrency}
                onChange={(e) => updateGene('concurrency', parseInt(e.target.value))}
                className="accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-[11px] text-slate-400">Hardware detected {hardware.cpuCores} logical CPU cores.</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 5: DYNAMIC VISUAL QUALITY & RESOLUTION SETTINGS                  */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col gap-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                <Tv className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Dynamic Visual Quality & Canvas Resolution</h3>
                <p className="text-xs text-slate-400">Fine-tune VisionFlow video synthesizer resolution, target FPS, and particle density.</p>
              </div>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800/40">
              Hardware Canvas 2D / WebGL
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Visual Resolution Scale */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Canvas Resolution Scale</span>
                <span className="font-mono text-cyan-400 font-bold">{genome.visualResolutionScale}x</span>
              </label>
              <div className="grid grid-cols-5 gap-1 text-xs font-mono">
                {[0.5, 0.75, 1.0, 1.25, 1.5].map((scale) => (
                  <button
                    key={scale}
                    onClick={() => updateGene('visualResolutionScale', scale)}
                    className={`py-1.5 rounded-lg border transition-all ${
                      genome.visualResolutionScale === scale
                        ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {scale}x
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400">
                {genome.visualResolutionScale < 1 ? 'Downscales internal buffer for smooth FPS.' : 'Renders in native HD / Super-sample.'}
              </span>
            </div>

            {/* Target FPS (VSync target) */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Target Framerate (VSync)</span>
                <span className="font-mono text-sky-400 font-bold">{genome.visualFpsTarget} FPS</span>
              </label>
              <div className="grid grid-cols-5 gap-1 text-xs font-mono">
                {[30, 45, 60, 90, 120].map((fps) => (
                  <button
                    key={fps}
                    onClick={() => updateGene('visualFpsTarget', fps)}
                    className={`py-1.5 rounded-lg border transition-all ${
                      genome.visualFpsTarget === fps
                        ? 'bg-sky-600 text-white border-sky-400 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {fps}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400">Regulates render loop throttle to preserve GPU cycles and battery.</span>
            </div>

            {/* Particle Density */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Particle Vortex Density</span>
                <span className="font-mono text-purple-400 font-bold uppercase">{genome.particleDensity}</span>
              </label>
              <div className="grid grid-cols-4 gap-1 text-xs font-mono">
                {(['low', 'medium', 'high', 'ultra'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => updateGene('particleDensity', d)}
                    className={`py-1.5 rounded-lg border transition-all ${
                      genome.particleDensity === d
                        ? 'bg-purple-600 text-white border-purple-400 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400">Scales particle emissions: Low (50%), Med (85%), High (100%), Ultra (175%).</span>
            </div>

            {/* FFT Analyser Size */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Audio Visualizer FFT Resolution</span>
                <span className="font-mono text-emerald-400 font-bold">{genome.fftSize} Bins</span>
              </label>
              <select
                value={genome.fftSize}
                onChange={(e) => updateGene('fftSize', parseInt(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs font-mono outline-none"
              >
                <option value={256}>256 Bins (Low Latency Spectrum)</option>
                <option value={512}>512 Bins (Balanced Reactive)</option>
                <option value={1024}>1024 Bins (High-Resolution Waterfall)</option>
                <option value={2048}>2048 Bins (Fine Spectral Detail)</option>
              </select>
              <span className="text-[11px] text-slate-400">Affects spectrogram detail and frequency band audio-reactivity calculations.</span>
            </div>

            {/* Bloom Post-Processing Quality */}
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Post-Processing Glow & Bloom</span>
                <span className="font-mono text-amber-400 font-bold uppercase">{genome.bloomQuality}</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-mono">
                {(['off', 'low', 'high'] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => updateGene('bloomQuality', b)}
                    className={`py-1.5 rounded-lg border transition-all ${
                      genome.bloomQuality === b
                        ? 'bg-amber-600 text-slate-950 border-amber-400 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {b.toUpperCase()}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400">Controls Gaussian glow blur passes for neon outlines and particles.</span>
            </div>

            {/* Dynamic Adaptive Throttling Toggle */}
            <div className="flex flex-col justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div>
                <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span>Dynamic Adaptive Auto-Throttle</span>
                  <input
                    type="checkbox"
                    checked={genome.adaptiveQuality}
                    onChange={(e) => updateGene('adaptiveQuality', e.target.checked)}
                    className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                  />
                </label>
                <p className="text-[11px] text-slate-400 mt-2">
                  When enabled, if framerate drops below 45 FPS or audio buffer underruns are detected, resolution and particle count automatically step down to guarantee glitch-free playback.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono mt-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Active Dynamic Frame Guard</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 6: PROFILE MANAGEMENT, LOCAL STORAGE & CLOUD SYNC               */}
        {/* ========================================================================= */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-400" />
                <span>Profile Management & LayAI Cloud Synchronization</span>
              </h3>
              <p className="text-xs text-slate-400">
                Export, import, or sync your calibrated performance configuration with the server database.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportConfig}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Profile JSON</span>
              </button>

              <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700">
                <Upload className="w-3.5 h-3.5" />
                <span>Import Profile</span>
                <input type="file" accept=".json" onChange={handleImportConfig} className="hidden" />
              </label>

              <button
                onClick={handleResetToBaseline}
                className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950 text-rose-300 border border-rose-800/40 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Restore detected hardware baseline configuration"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                <span>Factory Baseline</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono text-slate-400">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <span>Local Storage Status:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Persisted (layai_perf_genome)</span>
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <span>Server Synchronization:</span>
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Connected (/api/optimization)</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
