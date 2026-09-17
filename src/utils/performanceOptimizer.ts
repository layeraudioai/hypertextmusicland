import { synth } from '../audio/synthEngine';
import { visionFlow } from '../video/visionFlowRenderer';

export interface PerformanceGenome {
  // Concurrency & Buffer Pipeline (LayAI Genome standard)
  concurrency: number; // 1 to 8 workers/threads
  chunkSize: number; // 1024, 2048, 4096, 8192

  // Audio Synthesis & Sampling
  midiSampleRate: number; // 22050, 32000, 44100, 48000, 96000
  midiDenseSampleRate: number; // 16000, 24000, 32000, 44100
  polyphonyLimit: number; // 16, 32, 64, 128
  reverbQuality: 'draft' | 'studio' | 'lush';
  resamplingMode: 'linear' | 'hermite';
  audioQuality: 'low' | 'medium' | 'high' | 'ultra';

  // Analysis & FFT
  fftSize: number; // 256, 512, 1024, 2048
  hopSize: number; // 128, 256, 512, 1024
  yieldInterval: number; // 50 to 300 ms

  // Visualizer Fidelity & Resolution
  visualResolutionScale: number; // 0.5, 0.75, 1.0, 1.5, 2.0
  visualFpsTarget: number; // 30, 45, 60, 90, 120, 144
  particleDensity: 'low' | 'medium' | 'high' | 'ultra';
  bloomQuality: 'off' | 'low' | 'high';
  adaptiveQuality: boolean; // Auto drop fidelity when framerate drops

  // Fitness Benchmarking Scores (LayAI context specific)
  fitness: number; // Aggregate performance score
  fitnessMix: number; // Multi-track buffer mixing score
  fitnessRender: number; // DSP audio synthesis throughput score
  fitnessVisual: number; // Canvas/WebGL frame fillrate score
  fitnessAnalysis: number; // FFT transform score

  timestamp: number;
  device: string;
}

export interface HardwareSpecs {
  cpuCores: number;
  deviceMemoryGb: number;
  gpuRenderer: string;
  gpuVendor: string;
  pixelRatio: number;
  screenResolution: string;
  audioSampleRate: number;
  estimatedTier: 'low' | 'mid' | 'high' | 'ultra';
}

export interface BenchmarkScores {
  total: number;
  mix: number;
  render: number;
  visual: number;
  analysis: number;
}

export interface FireAwayProgress {
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
  currentIteration: number;
  currentScore: number;
  bestScore: number;
  isNewBest: boolean;
  activeGenome: PerformanceGenome;
  logMessage: string;
  logType: 'info' | 'success' | 'warning';
}

const STORAGE_KEY = 'layai_perf_genome';
const BACKUP_STORAGE_KEY = 'aura_perf_genome';

// Detect Device Hardware Specifications
export function detectHardwareSpecs(): HardwareSpecs {
  const cpuCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const deviceMemoryGb = typeof navigator !== 'undefined' && (navigator as any).deviceMemory ? (navigator as any).deviceMemory : 4;
  const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const screenResolution = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '1920x1080';

  let gpuRenderer = 'Standard 2D/WebGL Canvas';
  let gpuVendor = 'Generic';

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || gpuRenderer;
        gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || gpuVendor;
      }
    }
  } catch (e) {
    // Ignore canvas/WebGL sandbox issues
  }

  const audioSampleRate = synth.getAudioContext()?.sampleRate || 44100;

  let estimatedTier: 'low' | 'mid' | 'high' | 'ultra' = 'mid';
  if (cpuCores >= 12 && deviceMemoryGb >= 8) {
    estimatedTier = 'ultra';
  } else if (cpuCores >= 8 && deviceMemoryGb >= 6) {
    estimatedTier = 'high';
  } else if (cpuCores >= 4 && deviceMemoryGb >= 4) {
    estimatedTier = 'mid';
  } else {
    estimatedTier = 'low';
  }

  return {
    cpuCores,
    deviceMemoryGb,
    gpuRenderer,
    gpuVendor,
    pixelRatio,
    screenResolution,
    audioSampleRate,
    estimatedTier,
  };
}

// Generate Baseline Default Genome based on Detected Hardware
export function getBaselineDefaultGenome(): PerformanceGenome {
  const specs = detectHardwareSpecs();

  let concurrency = 4;
  let midiSampleRate = 44100;
  let visualResolutionScale = 1.0;
  let visualFpsTarget = 60;
  let particleDensity: 'low' | 'medium' | 'high' | 'ultra' = 'high';
  let audioQuality: 'low' | 'medium' | 'high' | 'ultra' = 'high';
  let polyphonyLimit = 64;
  let reverbQuality: 'draft' | 'studio' | 'lush' = 'studio';

  if (specs.estimatedTier === 'ultra') {
    concurrency = Math.min(8, specs.cpuCores);
    midiSampleRate = 48000;
    visualResolutionScale = 1.25;
    visualFpsTarget = 120;
    particleDensity = 'ultra';
    audioQuality = 'ultra';
    polyphonyLimit = 96;
    reverbQuality = 'lush';
  } else if (specs.estimatedTier === 'high') {
    concurrency = Math.min(6, specs.cpuCores);
    midiSampleRate = 44100;
    visualResolutionScale = 1.0;
    visualFpsTarget = 60;
    particleDensity = 'high';
    audioQuality = 'high';
    polyphonyLimit = 64;
    reverbQuality = 'studio';
  } else if (specs.estimatedTier === 'mid') {
    concurrency = Math.min(4, specs.cpuCores);
    midiSampleRate = 44100;
    visualResolutionScale = 1.0;
    visualFpsTarget = 60;
    particleDensity = 'medium';
    audioQuality = 'medium';
    polyphonyLimit = 48;
    reverbQuality = 'studio';
  } else {
    concurrency = 2;
    midiSampleRate = 32000;
    visualResolutionScale = 0.75;
    visualFpsTarget = 30;
    particleDensity = 'low';
    audioQuality = 'low';
    polyphonyLimit = 24;
    reverbQuality = 'draft';
  }

  return {
    concurrency,
    chunkSize: 4096,
    midiSampleRate,
    midiDenseSampleRate: 32000,
    polyphonyLimit,
    reverbQuality,
    resamplingMode: specs.estimatedTier === 'low' ? 'linear' : 'hermite',
    audioQuality,
    fftSize: 1024,
    hopSize: 512,
    yieldInterval: 150,
    visualResolutionScale,
    visualFpsTarget,
    particleDensity,
    bloomQuality: specs.estimatedTier === 'low' ? 'off' : specs.estimatedTier === 'ultra' ? 'high' : 'low',
    adaptiveQuality: true,
    fitness: 7500,
    fitnessMix: 7600,
    fitnessRender: 7400,
    fitnessVisual: 7500,
    fitnessAnalysis: 7500,
    timestamp: Date.now(),
    device: `${specs.estimatedTier.toUpperCase()} [${specs.cpuCores}C / ${specs.deviceMemoryGb}GB RAM / ${specs.gpuRenderer.slice(0, 24)}]`,
  };
}

// Load Genome from LocalStorage
export function loadPerformanceGenome(): PerformanceGenome {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(BACKUP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.concurrency === 'number') {
        return { ...getBaselineDefaultGenome(), ...parsed };
      }
    }
  } catch (e) {
    console.warn('Failed to load performance genome from storage, using baseline:', e);
  }
  return getBaselineDefaultGenome();
}

// Save Genome to LocalStorage
export function savePerformanceGenome(genome: PerformanceGenome) {
  try {
    const json = JSON.stringify(genome);
    localStorage.setItem(STORAGE_KEY, json);
    localStorage.setItem(BACKUP_STORAGE_KEY, json);
  } catch (e) {
    console.warn('Failed to save performance genome to storage:', e);
  }
}

// Apply Genome Directly to Active Audio and Visual Engines
export function applyGenomeToEngine(genome: PerformanceGenome) {
  // 1. Audio Engine Tuning
  synth.setPolyphonyLimit(genome.polyphonyLimit);
  synth.setReverbQuality(genome.reverbQuality);
  synth.setFftSize(genome.fftSize);

  // 2. VisionFlow Video Engine Tuning
  visionFlow.setResolutionScale(genome.visualResolutionScale);
  visionFlow.setTargetFps(genome.visualFpsTarget);

  const densityMultMap: Record<string, number> = {
    low: 0.5,
    medium: 0.85,
    high: 1.0,
    ultra: 1.75,
  };
  visionFlow.setParticleDensityMultiplier(densityMultMap[genome.particleDensity] || 1.0);
}

// Genetic Algorithm: Mutate a Genome slightly to search for speed/stability improvements (LayAI style)
export function mutatePerformanceGenome(base: PerformanceGenome): PerformanceGenome {
  const mutated = { ...base };
  const gene = Math.floor(Math.random() * 8);

  switch (gene) {
    case 0: { // Concurrency (1 - 8)
      const delta = Math.random() > 0.5 ? 1 : -1;
      mutated.concurrency = Math.max(1, Math.min(8, mutated.concurrency + delta));
      break;
    }
    case 1: { // Chunk Size
      const chunks = [1024, 2048, 4096, 8192];
      mutated.chunkSize = chunks[Math.floor(Math.random() * chunks.length)];
      break;
    }
    case 2: { // MIDI Sample Rate
      const rates = [22050, 32000, 44100, 48000];
      mutated.midiSampleRate = rates[Math.floor(Math.random() * rates.length)];
      break;
    }
    case 3: { // FFT Size
      const fftSizes = [256, 512, 1024, 2048];
      mutated.fftSize = fftSizes[Math.floor(Math.random() * fftSizes.length)];
      break;
    }
    case 4: { // Visual Resolution Scale
      const scales = [0.5, 0.75, 1.0, 1.25, 1.5];
      mutated.visualResolutionScale = scales[Math.floor(Math.random() * scales.length)];
      break;
    }
    case 5: { // Target FPS
      const fpsOptions = [30, 45, 60, 90, 120];
      mutated.visualFpsTarget = fpsOptions[Math.floor(Math.random() * fpsOptions.length)];
      break;
    }
    case 6: { // Polyphony Cap
      const polyOptions = [24, 32, 48, 64, 96];
      mutated.polyphonyLimit = polyOptions[Math.floor(Math.random() * polyOptions.length)];
      break;
    }
    case 7: { // Particle Density
      const densities: ('low' | 'medium' | 'high' | 'ultra')[] = ['low', 'medium', 'high', 'ultra'];
      mutated.particleDensity = densities[Math.floor(Math.random() * densities.length)];
      break;
    }
  }

  return mutated;
}

// -------------------------------------------------------------
// BENCHMARKING SUITE
// -------------------------------------------------------------

// 1. Audio DSP & Synthesis Benchmark (Measures polyphonic voice synthesis speed)
export async function runAudioDspBenchmark(sampleRate = 44100): Promise<number> {
  const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
    2,
    sampleRate * 1.5, // 1.5 seconds of audio
    sampleRate
  );

  const tStart = performance.now();

  // Create 32 polyphonic oscillators with filters & envelope gains
  const notePitches = [48, 52, 55, 60, 64, 67, 71, 72, 76, 79, 84, 88];
  for (let i = 0; i < 32; i++) {
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    const filter = offlineCtx.createBiquadFilter();

    const pitch = notePitches[i % notePitches.length];
    osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(440 * Math.pow(2, (pitch - 69) / 12), 0);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800 + (i % 5) * 400, 0);
    filter.Q.setValueAtTime(3.0, 0);

    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(0.2, 0.05 + (i * 0.02));
    gain.gain.exponentialRampToValueAtTime(0.001, 1.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(offlineCtx.destination);

    osc.start(i * 0.03);
    osc.stop(1.4);
  }

  await offlineCtx.startRendering();
  const tElapsed = performance.now() - tStart;

  // Faster execution = higher score (e.g. 15ms => ~10000 score)
  const score = Math.max(100, Math.min(25000, Math.round(150000 / (tElapsed + 5))));
  return score;
}

// 2. Multi-Track Audio Mixing Benchmark (Measures buffer math & gain/pan matrix)
export async function runMixingBenchmark(concurrency = 4, chunkSize = 4096): Promise<number> {
  const tStart = performance.now();
  const bufferLen = chunkSize * 32; // 131,072 samples per track
  const tracks = 8;

  // Create dummy audio channel buffers
  const trackBuffers: Float32Array[] = [];
  for (let t = 0; t < tracks; t++) {
    const buf = new Float32Array(bufferLen);
    for (let i = 0; i < bufferLen; i += 8) {
      buf[i] = (Math.sin(i * 0.01) + Math.cos(i * 0.03)) * 0.5;
    }
    trackBuffers.push(buf);
  }

  // Simulate master stereo mixdown with pan & volume attenuation
  const masterL = new Float32Array(bufferLen);
  const masterR = new Float32Array(bufferLen);

  for (let t = 0; t < tracks; t++) {
    const src = trackBuffers[t];
    const pan = (t / (tracks - 1)) * 2 - 1; // -1 to +1
    const panL = Math.cos(((pan + 1) * Math.PI) / 4);
    const panR = Math.sin(((pan + 1) * Math.PI) / 4);
    const vol = 0.75;

    for (let i = 0; i < bufferLen; i++) {
      masterL[i] += src[i] * vol * panL;
      masterR[i] += src[i] * vol * panR;
    }
  }

  // Master soft limiter simulation
  for (let i = 0; i < bufferLen; i++) {
    masterL[i] = Math.tanh(masterL[i]);
    masterR[i] = Math.tanh(masterR[i]);
  }

  const tElapsed = performance.now() - tStart;
  const score = Math.max(100, Math.min(25000, Math.round(100000 / (tElapsed + 4))));
  return score;
}

// 3. Visual Canvas & Particle Rendering Benchmark (Measures GPU draw-call throughput & FPS)
export async function runVisualBenchmark(resolutionScale = 1.0, particleCount = 400): Promise<number> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const width = Math.round(1280 * resolutionScale);
    const height = Math.round(720 * resolutionScale);
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(5000);
      return;
    }

    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      r: 2 + Math.random() * 5,
      color: `hsl(${Math.random() * 360}, 80%, 60%)`,
    }));

    const tStart = performance.now();
    let frames = 0;
    const testDuration = 120; // 120ms stress test

    function step() {
      frames++;
      ctx.fillStyle = 'rgba(10, 15, 30, 0.2)';
      ctx.fillRect(0, 0, width, height);

      // Draw particle cluster with glow
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      if (performance.now() - tStart < testDuration) {
        requestAnimationFrame(step);
      } else {
        const actualElapsed = performance.now() - tStart;
        const fps = (frames / actualElapsed) * 1000;
        // 60 FPS => ~8000 score, 120 FPS => ~16000 score
        const score = Math.max(500, Math.min(25000, Math.round(fps * 140)));
        resolve(score);
      }
    }

    requestAnimationFrame(step);
  });
}

// 4. FFT & Audio Analysis Benchmark (Measures spectral bin processing)
export async function runAnalysisBenchmark(fftSize = 1024): Promise<number> {
  const tStart = performance.now();
  const iterations = 80;
  const buffer = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) buffer[i] = Math.sin(i * 0.1) * 0.8;

  // Simulate windowed FFT magnitude computation
  for (let it = 0; it < iterations; it++) {
    const mags = new Float32Array(fftSize / 2);
    for (let k = 0; k < fftSize / 2; k++) {
      let real = 0;
      let imag = 0;
      // Step sample for speed
      for (let n = 0; n < fftSize; n += 4) {
        const angle = (2 * Math.PI * k * n) / fftSize;
        real += buffer[n] * Math.cos(angle);
        imag -= buffer[n] * Math.sin(angle);
      }
      mags[k] = Math.sqrt(real * real + imag * imag);
    }
  }

  const tElapsed = performance.now() - tStart;
  const score = Math.max(200, Math.min(25000, Math.round(90000 / (tElapsed + 4))));
  return score;
}

// Comprehensive Benchmark
export async function runComprehensiveBenchmark(genome?: PerformanceGenome): Promise<BenchmarkScores> {
  const g = genome || loadPerformanceGenome();

  const [mixScore, renderScore, visualScore, analysisScore] = await Promise.all([
    runMixingBenchmark(g.concurrency, g.chunkSize),
    runAudioDspBenchmark(g.midiSampleRate),
    runVisualBenchmark(g.visualResolutionScale, g.particleDensity === 'ultra' ? 600 : g.particleDensity === 'high' ? 350 : 200),
    runAnalysisBenchmark(g.fftSize),
  ]);

  const total = Math.round((mixScore * 0.3) + (renderScore * 0.3) + (visualScore * 0.25) + (analysisScore * 0.15));

  return {
    total,
    mix: mixScore,
    render: renderScore,
    visual: visualScore,
    analysis: analysisScore,
  };
}

// -------------------------------------------------------------
// LAYAI "FIRE AWAY (AUTO-OPTIMIZE)" GENETIC ALGORITHM ENGINE
// -------------------------------------------------------------

export interface FireAwayOptions {
  durationSeconds?: number; // default 25s
  signal?: AbortSignal;
}

export async function* fireAwayOptimization(
  options: FireAwayOptions = {}
): AsyncGenerator<FireAwayProgress, PerformanceGenome, void> {
  const targetDurationMs = (options.durationSeconds || 25) * 1000;
  const startTime = Date.now();

  yield {
    elapsedSeconds: 0,
    remainingSeconds: Math.ceil(targetDurationMs / 1000),
    progressPercent: 0,
    currentIteration: 0,
    currentScore: 0,
    bestScore: 0,
    isNewBest: false,
    activeGenome: loadPerformanceGenome(),
    logMessage: `Starting 'Fire Away' Auto-Optimization (${Math.ceil(targetDurationMs / 1000)}s test suite)...`,
    logType: 'info',
  };

  // Baseline benchmark
  let bestGenome = { ...loadPerformanceGenome() };
  const initialScores = await runComprehensiveBenchmark(bestGenome);
  bestGenome.fitness = initialScores.total;
  bestGenome.fitnessMix = initialScores.mix;
  bestGenome.fitnessRender = initialScores.render;
  bestGenome.fitnessVisual = initialScores.visual;
  bestGenome.fitnessAnalysis = initialScores.analysis;

  let bestScore = bestGenome.fitness;
  let iterations = 0;

  yield {
    elapsedSeconds: Math.floor((Date.now() - startTime) / 1000),
    remainingSeconds: Math.max(0, Math.ceil((targetDurationMs - (Date.now() - startTime)) / 1000)),
    progressPercent: Math.min(100, Math.round(((Date.now() - startTime) / targetDurationMs) * 100)),
    currentIteration: iterations,
    currentScore: bestScore,
    bestScore: bestScore,
    isNewBest: true,
    activeGenome: bestGenome,
    logMessage: `Baseline Profile Measured: Score ${bestScore} (Concurrency: ${bestGenome.concurrency}, SampleRate: ${bestGenome.midiSampleRate}Hz, Res: ${bestGenome.visualResolutionScale}x)`,
    logType: 'success',
  };

  let candidateGenome = { ...bestGenome };

  while (Date.now() - startTime < targetDurationMs) {
    if (options.signal?.aborted) break;

    iterations++;

    // Mutate candidate from best genome
    candidateGenome = mutatePerformanceGenome(bestGenome);

    // Test candidate configuration with synthetic benchmarks
    const scores = await runComprehensiveBenchmark(candidateGenome);
    const candidateScore = scores.total;

    const isNewBest = candidateScore > bestScore;

    if (isNewBest) {
      bestScore = candidateScore;
      bestGenome = {
        ...candidateGenome,
        fitness: candidateScore,
        fitnessMix: scores.mix,
        fitnessRender: scores.render,
        fitnessVisual: scores.visual,
        fitnessAnalysis: scores.analysis,
        timestamp: Date.now(),
      };

      // Save locally
      savePerformanceGenome(bestGenome);
      // Apply immediately
      applyGenomeToEngine(bestGenome);

      yield {
        elapsedSeconds: Math.floor((Date.now() - startTime) / 1000),
        remainingSeconds: Math.max(0, Math.ceil((targetDurationMs - (Date.now() - startTime)) / 1000)),
        progressPercent: Math.min(100, Math.round(((Date.now() - startTime) / targetDurationMs) * 100)),
        currentIteration: iterations,
        currentScore: candidateScore,
        bestScore: bestScore,
        isNewBest: true,
        activeGenome: bestGenome,
        logMessage: `[Auto-Optimization] Performance improved! New fitness: ${candidateScore} (C:${bestGenome.concurrency} SR:${bestGenome.midiSampleRate} V:${bestGenome.visualResolutionScale}x)`,
        logType: 'success',
      };
    } else {
      yield {
        elapsedSeconds: Math.floor((Date.now() - startTime) / 1000),
        remainingSeconds: Math.max(0, Math.ceil((targetDurationMs - (Date.now() - startTime)) / 1000)),
        progressPercent: Math.min(100, Math.round(((Date.now() - startTime) / targetDurationMs) * 100)),
        currentIteration: iterations,
        currentScore: candidateScore,
        bestScore: bestScore,
        isNewBest: false,
        activeGenome: candidateGenome,
        logMessage: `Iteration #${iterations}: Tested config (Score ${candidateScore}). Keeping best (${bestScore}).`,
        logType: 'info',
      };
    }

    // Yield control to UI
    await new Promise((r) => setTimeout(r, 40));
  }

  // Finalize
  savePerformanceGenome(bestGenome);
  applyGenomeToEngine(bestGenome);

  // Sync with server optimization database (LayAI cloud sync)
  try {
    await syncGenomeWithServer(bestGenome);
  } catch (e) {
    // Non-blocking
  }

  yield {
    elapsedSeconds: Math.floor((Date.now() - startTime) / 1000),
    remainingSeconds: 0,
    progressPercent: 100,
    currentIteration: iterations,
    currentScore: bestScore,
    bestScore: bestScore,
    isNewBest: false,
    activeGenome: bestGenome,
    logMessage: `Fire Away Optimization Complete! Ran ${iterations} benchmark iterations. Final Fitness Score: ${bestScore}.`,
    logType: 'success',
  };

  return bestGenome;
}

// Sync Local Best Genome to Server API
export async function syncGenomeWithServer(genome: PerformanceGenome): Promise<{ success: boolean; isNewRecord: boolean; bestFitness?: number }> {
  try {
    const res = await fetch('/api/optimization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...genome,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.warn('Server optimization sync offline:', e);
    return { success: false, isNewRecord: false };
  }
}

// Fetch Global Best Genome from Server
export async function fetchGlobalBestGenome(): Promise<PerformanceGenome | null> {
  try {
    const res = await fetch('/api/optimization');
    if (!res.ok) return null;
    const data = await res.json();
    return data.bestGenome || null;
  } catch (e) {
    return null;
  }
}
