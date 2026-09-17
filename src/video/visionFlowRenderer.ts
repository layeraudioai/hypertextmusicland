import { VisionFlowConfig, Note, Track, ProjectState } from '../types/daw';
import { getPitchColor } from '../audio/constants';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export class VisionFlowRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private analyser: AnalyserNode | null = null;
  private animationId: number | null = null;
  private particles: Particle[] = [];
  private time: number = 0;

  // Dynamic Performance & Telemetry (LayAI inspired)
  private resolutionScale: number = 1.0;
  private targetFps: number = 60;
  private particleDensityMultiplier: number = 1.0;
  private lastFrameTimestamp: number = 0;
  private fpsHistory: number[] = [];
  private currentFps: number = 60;
  private currentFrameTimeMs: number = 16.6;
  private droppedFrameCount: number = 0;

  // MediaRecorder for video.2kool4u.net video export
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;

  public init(canvas: HTMLCanvasElement, analyser: AnalyserNode | null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.analyser = analyser;
    this.particles = [];
  }

  public setAnalyser(analyser: AnalyserNode | null) {
    this.analyser = analyser;
  }

  public setResolutionScale(scale: number) {
    this.resolutionScale = Math.max(0.25, Math.min(2.0, scale));
  }

  public setTargetFps(fps: number) {
    this.targetFps = fps;
  }

  public setParticleDensityMultiplier(mult: number) {
    this.particleDensityMultiplier = Math.max(0.1, Math.min(3.0, mult));
  }

  public getMetrics() {
    return {
      fps: this.currentFps,
      frameTimeMs: parseFloat(this.currentFrameTimeMs.toFixed(1)),
      droppedFrames: this.droppedFrameCount,
      resolutionScale: this.resolutionScale,
      targetFps: this.targetFps,
      particleDensityMultiplier: this.particleDensityMultiplier,
      activeParticles: this.particles.length,
    };
  }

  public startRenderLoop(
    getConfig: () => VisionFlowConfig,
    getCurrentBeat: () => number,
    getActiveTracks: () => Track[],
    getIsPlaying: () => boolean
  ) {
    if (this.animationId !== null) return;

    const render = (now: number) => {
      this.animationId = requestAnimationFrame(render);
      if (!this.canvas || !this.ctx) return;

      if (this.targetFps > 0 && this.targetFps < 120) {
        const interval = 1000 / this.targetFps;
        if (now - this.lastFrameTimestamp < interval - 2) {
          return;
        }
      }

      const delta = now - this.lastFrameTimestamp;
      this.lastFrameTimestamp = now;
      if (delta > 0 && delta < 500) {
        const instantFps = 1000 / delta;
        this.currentFrameTimeMs = delta;
        this.fpsHistory.push(instantFps);
        if (this.fpsHistory.length > 30) this.fpsHistory.shift();
        this.currentFps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
        if (delta > 35) this.droppedFrameCount++;
      }

      const config = getConfig();
      const beat = getCurrentBeat();
      const tracks = getActiveTracks();
      const isPlaying = getIsPlaying();

      this.renderFrame(config, beat, tracks, isPlaying);
    };

    render(performance.now());
  }

  public stopRenderLoop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private renderFrame(
    config: VisionFlowConfig,
    currentBeat: number,
    tracks: Track[],
    isPlaying: boolean
  ) {
    const canvas = this.canvas!;
    const ctx = this.ctx!;
    const w = canvas.width;
    const h = canvas.height;

    // Audio Analysis
    let bassEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    let overallVolume = 0;

    let freqData = new Uint8Array(256);
    let timeData = new Uint8Array(256);

    if (this.analyser) {
      freqData = new Uint8Array(this.analyser.frequencyBinCount);
      timeData = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteFrequencyData(freqData);
      this.analyser.getByteTimeDomainData(timeData);

      // Extract frequency band energies
      let bassSum = 0;
      for (let i = 0; i < 8; i++) bassSum += freqData[i];
      bassEnergy = (bassSum / (8 * 255)) * config.reactivity;

      let midSum = 0;
      for (let i = 8; i < 40; i++) midSum += freqData[i];
      midEnergy = (midSum / (32 * 255)) * config.reactivity;

      let highSum = 0;
      for (let i = 40; i < 120; i++) highSum += freqData[i];
      highEnergy = (highSum / (80 * 255)) * config.reactivity;

      overallVolume = (bassEnergy + midEnergy + highEnergy) / 3;
    }

    this.time += (0.015 + overallVolume * 0.02) * config.flowSpeed;

    // 1. Draw Scene Background
    this.drawBackground(ctx, w, h, config.theme, bassEnergy);

    // 2. Draw Theme Visuals
    switch (config.theme) {
      case 'neon-aura':
        this.drawNeonAura(ctx, w, h, bassEnergy, midEnergy, highEnergy, config);
        break;
      case 'cyber-grid':
        this.drawCyberGrid(ctx, w, h, bassEnergy, highEnergy);
        break;
      case 'particle-vortex':
        this.drawParticleVortex(ctx, w, h, bassEnergy, midEnergy, config);
        break;
      case 'nebula-bloom':
        this.drawNebulaBloom(ctx, w, h, bassEnergy, midEnergy);
        break;
      case 'retro-vhs':
        this.drawRetroVhs(ctx, w, h, bassEnergy, highEnergy);
        break;
      case 'kaleidoscope':
        this.drawKaleidoscope(ctx, w, h, freqData, bassEnergy);
        break;
    }

    // 3. Optional Synthesia-style Falling Piano Waterfall (auramidi.42web.io)
    if (config.showPianoWaterfall) {
      this.drawPianoWaterfall(ctx, w, h, currentBeat, tracks);
    }

    // 4. Optional Waveform Overlay
    if (config.showWaveform) {
      this.drawWaveform(ctx, w, h, timeData);
    }

    // 5. Optional Spectrogram Bars
    if (config.showSpectrogram) {
      this.drawSpectrogram(ctx, w, h, freqData);
    }

    // 6. Text Overlay
    if (config.showTextOverlay && config.titleText) {
      this.drawOverlayText(ctx, w, h, config.titleText, bassEnergy);
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, theme: string, bass: number) {
    ctx.fillStyle = '#090d16'; // Deep midnight
    ctx.fillRect(0, 0, w, h);

    if (bass > 0.3) {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
      grad.addColorStop(0, `rgba(56, 189, 248, ${Math.min(0.25, bass * 0.2)})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // AuraMIDI Luminous Pulse & Particle Bursts
  private drawNeonAura(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    bass: number,
    mid: number,
    high: number,
    config: VisionFlowConfig
  ) {
    const cx = w / 2;
    const cy = h / 2;

    // Glowing concentric resonance rings
    const ringCount = 6;
    for (let i = 0; i < ringCount; i++) {
      const radius = 60 + i * 45 + Math.sin(this.time * 2 + i) * 15 + bass * 80;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(10, radius), 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${200 + i * 25 + bass * 40}, 90%, 65%, ${0.2 + bass * 0.4})`;
      ctx.lineWidth = 2 + (i === 1 ? bass * 6 : mid * 4);
      ctx.shadowColor = `hsla(${200 + i * 25}, 90%, 65%, 0.8)`;
      ctx.shadowBlur = 15 * config.bloom;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Particle emissions
    const maxParticles = Math.round(config.particleCount * this.particleDensityMultiplier);
    if (this.particles.length < maxParticles) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4 + bass * 5;
      this.particles.push({
        x: cx + Math.cos(angle) * 30,
        y: cy + Math.sin(angle) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 3 + high * 3,
        color: `hsl(${180 + Math.random() * 120}, 95%, 70%)`,
        alpha: 1.0,
        life: 0,
        maxLife: 60 + Math.random() * 60,
      });
    }

    // Update & draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.alpha = 1 - p.life / p.maxLife;

      if (p.life >= p.maxLife || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8 * config.bloom;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
    }
  }

  // 3D Perspective Synthwave Cyber Grid
  private drawCyberGrid(ctx: CanvasRenderingContext2D, w: number, h: number, bass: number, high: number) {
    const horizon = h * 0.55;
    const cx = w / 2;

    // Glowing Neon Sun
    const sunRadius = 70 + bass * 35;
    const sunGrad = ctx.createLinearGradient(cx, horizon - sunRadius, cx, horizon);
    sunGrad.addColorStop(0, '#f43f5e');
    sunGrad.addColorStop(0.6, '#fb923c');
    sunGrad.addColorStop(1, '#eab308');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(cx, horizon - 10, sunRadius, Math.PI, 0, false);
    ctx.fill();

    // Perspective grid floor
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
    ctx.lineWidth = 1.5;

    // Vertical vanishing lines
    const lineCount = 20;
    for (let i = -lineCount; i <= lineCount; i++) {
      const xBottom = cx + (i * w) / (lineCount * 0.65);
      ctx.beginPath();
      ctx.moveTo(cx, horizon);
      ctx.lineTo(xBottom, h);
      ctx.stroke();
    }

    // Horizontal moving grid lines
    const gridSpeed = (this.time * 60) % 30;
    for (let y = horizon; y < h; y += (h - horizon) / 12) {
      const mappedY = y + gridSpeed * ((y - horizon) / (h - horizon));
      if (mappedY > horizon && mappedY < h) {
        ctx.beginPath();
        ctx.moveTo(0, mappedY);
        ctx.lineTo(w, mappedY);
        ctx.stroke();
      }
    }
  }

  // Particle Vortex
  private drawParticleVortex(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    bass: number,
    mid: number,
    config: VisionFlowConfig
  ) {
    const cx = w / 2;
    const cy = h / 2;
    const vortexParticles = 200;

    for (let i = 0; i < vortexParticles; i++) {
      const angle = i * 0.15 + this.time * 1.2;
      const dist = (i * 2 + this.time * 40) % (Math.min(w, h) * 0.48);
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const size = 1.5 + (dist / 100) * 1.5 + bass * 3;

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${(i * 5 + this.time * 50) % 360}, 85%, 65%, ${0.3 + (dist / 300) * 0.6})`;
      ctx.fill();
    }
  }

  // Nebula Bloom
  private drawNebulaBloom(ctx: CanvasRenderingContext2D, w: number, h: number, bass: number, mid: number) {
    const cx = w / 2;
    const cy = h / 2;
    const blobs = 4;

    for (let i = 0; i < blobs; i++) {
      const bx = cx + Math.cos(this.time + (i * Math.PI) / 2) * (120 + bass * 60);
      const by = cy + Math.sin(this.time * 0.8 + (i * Math.PI) / 2) * (80 + mid * 50);
      const radius = 150 + bass * 100;

      const grad = ctx.createRadialGradient(bx, by, 10, bx, by, radius);
      grad.addColorStop(0, `hsla(${210 + i * 40}, 90%, 60%, 0.35)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Retro VHS
  private drawRetroVhs(ctx: CanvasRenderingContext2D, w: number, h: number, bass: number, high: number) {
    // Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1.5);
    }

    // VHS Glitch band
    if (Math.random() < 0.2 + bass * 0.3) {
      const glitchY = Math.random() * h;
      const glitchH = 10 + Math.random() * 30;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + high * 0.3})`;
      ctx.fillRect(0, glitchY, w, glitchH);
    }

    // Timestamp
    ctx.font = '16px monospace';
    ctx.fillStyle = '#10b981';
    ctx.fillText('PLAY ▶ 00:00:14', 30, 40);
    ctx.fillText('SP 44.1kHz STEREO', 30, 65);
  }

  // Kaleidoscope
  private drawKaleidoscope(ctx: CanvasRenderingContext2D, w: number, h: number, freq: Uint8Array, bass: number) {
    const cx = w / 2;
    const cy = h / 2;
    const segments = 8;
    const angleStep = (Math.PI * 2) / segments;

    ctx.save();
    ctx.translate(cx, cy);

    for (let s = 0; s < segments; s++) {
      ctx.rotate(angleStep);
      ctx.beginPath();
      ctx.moveTo(0, 0);

      for (let i = 0; i < 40; i++) {
        const r = 20 + i * 4 + (freq[i] / 255) * 80 * (1 + bass);
        const a = (i / 40) * angleStep;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.strokeStyle = `hsl(${(s * 45 + this.time * 30) % 360}, 85%, 65%)`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  // Synthesia Waterfall Falling Notes (auramidi.42web.io)
  private drawPianoWaterfall(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    currentBeat: number,
    tracks: Track[]
  ) {
    const keyboardHeight = 60;
    const waterfallHeight = h - keyboardHeight;
    const lowestNote = 36; // C2
    const highestNote = 84; // C6
    const totalKeys = highestNote - lowestNote + 1;
    const keyWidth = w / totalKeys;
    const beatLookahead = 4; // 4 beats ahead visible

    // Draw keyboard base at bottom
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, waterfallHeight, w, keyboardHeight);

    // Active key lighting tracker
    const activeKeys = new Set<number>();

    // Draw falling note blocks
    tracks.forEach((track) => {
      if (track.muted) return;
      track.notes.forEach((note) => {
        const beatOffset = note.time - currentBeat;
        if (beatOffset < -note.duration || beatOffset > beatLookahead) return;

        // Note is currently striking the keyboard!
        if (beatOffset <= 0 && beatOffset + note.duration >= 0) {
          activeKeys.add(note.pitch);
        }

        const noteX = (note.pitch - lowestNote) * keyWidth;
        // Top of note box: when beatOffset is beatLookahead, y = 0
        const yTop = waterfallHeight - ((beatOffset + note.duration) / beatLookahead) * waterfallHeight;
        const yBottom = waterfallHeight - (beatOffset / beatLookahead) * waterfallHeight;
        const noteHeight = Math.max(4, yBottom - yTop);

        const color = getPitchColor(note.pitch);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillRect(noteX + 1, Math.max(0, yTop), keyWidth - 2, noteHeight);
        ctx.shadowBlur = 0;
      });
    });

    // Draw piano keys with active neon lighting
    for (let p = lowestNote; p <= highestNote; p++) {
      const kx = (p - lowestNote) * keyWidth;
      const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
      const isPressed = activeKeys.has(p);

      if (isPressed) {
        const color = getPitchColor(p);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillRect(kx, waterfallHeight, keyWidth, keyboardHeight);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = isBlack ? '#1e293b' : '#f8fafc';
        ctx.fillRect(kx + 0.5, waterfallHeight, keyWidth - 1, isBlack ? keyboardHeight * 0.65 : keyboardHeight);
      }
    }
  }

  // Audio Oscilloscope Waveform
  private drawWaveform(ctx: CanvasRenderingContext2D, w: number, h: number, timeData: Uint8Array) {
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;

    const sliceWidth = w / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * (h * 0.25)) + h * 0.15;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Spectrogram Frequency Bars
  private drawSpectrogram(ctx: CanvasRenderingContext2D, w: number, h: number, freqData: Uint8Array) {
    const barCount = 48;
    const barWidth = (w / barCount) * 0.7;
    const spacing = (w / barCount) * 0.3;

    for (let i = 0; i < barCount; i++) {
      const val = freqData[i * 2] / 255;
      const barHeight = val * (h * 0.3);
      const x = i * (barWidth + spacing);
      const y = h - 60 - barHeight;

      const grad = ctx.createLinearGradient(x, y, x, h - 60);
      grad.addColorStop(0, '#ec4899');
      grad.addColorStop(1, '#8b5cf6');

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }

  // Title Text Overlay
  private drawOverlayText(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, bass: number) {
    ctx.save();
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
    ctx.shadowBlur = 12 + bass * 12;
    ctx.fillText(text, w / 2, 70);
    ctx.restore();
  }

  // Video Recording & WebM Exporter (video.2kool4u.net & auraoffline.42web.io)
  public startRecording(audioStream?: MediaStreamAudioDestinationNode | null): boolean {
    if (!this.canvas) return false;
    try {
      const canvasStream = this.canvas.captureStream(60);
      let combinedStream = canvasStream;

      if (audioStream && audioStream.stream) {
        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioStream.stream.getAudioTracks(),
        ]);
      }

      this.recordedChunks = [];
      const options = { mimeType: 'video/webm; codecs=vp9' };
      const mime = MediaRecorder.isTypeSupported(options.mimeType) ? options.mimeType : 'video/webm';

      this.mediaRecorder = new MediaRecorder(combinedStream, { mimeType: mime });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      return true;
    } catch (e) {
      console.error('Failed to start video recording', e);
      return false;
    }
  }

  public stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('MediaRecorder not initialized'));
      }

      this.mediaRecorder.onstop = () => {
        const videoBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
        this.recordedChunks = [];
        this.isRecording = false;
        resolve(videoBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}

export const visionFlow = new VisionFlowRenderer();
