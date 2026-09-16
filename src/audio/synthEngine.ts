import { Track, Note, ProjectState, InstrumentId } from '../types/daw';

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private isInitialized = false;

  // Active live voices for note-on / note-off
  private activeLiveVoices: Map<string, { stop: () => void }> = new Map();

  // Custom Sampled SoundFont Registry (audio upload + audio to sf2)
  private customSamples: Map<string, { buffer: AudioBuffer; rootPitch: number }> = new Map();

  public registerCustomSample(id: string, buffer: AudioBuffer, rootPitch: number = 60) {
    this.customSamples.set(id, { buffer, rootPitch });
  }

  public getCustomSample(id: string) {
    return this.customSamples.get(id);
  }

  public getAllCustomSamples() {
    return Array.from(this.customSamples.entries());
  }

  public clearCustomSamples() {
    this.customSamples.clear();
  }

  // Web MIDI access instance
  private midiAccess: any = null;
  private onMidiNoteCallback?: (pitch: number, velocity: number, isNoteOn: boolean) => void;

  public init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Master Compressor / Limiter
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    // Analyser Node for Audio-Reactive Video & Aura MIDI
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;

    // Stereo Delay Network
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(0.35, this.ctx.currentTime);
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.4, this.ctx.currentTime);

    const delayFilter = this.ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.setValueAtTime(3200, this.ctx.currentTime);

    this.delayNode.connect(delayFilter);
    delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);

    // Algorithmic Reverb Impulse
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = this.createImpulseResponse(this.ctx, 2.2, 2.0);

    // Routing
    this.delayNode.connect(this.compressor);
    this.reverbConvolver.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.isInitialized = true;
    this.setupWebMidi();
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public setMasterVolume(vol: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, vol)), this.ctx.currentTime, 0.02);
    }
  }

  public setMidiCallback(cb: (pitch: number, velocity: number, isNoteOn: boolean) => void) {
    this.onMidiNoteCallback = cb;
  }

  private async setupWebMidi() {
    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      try {
        const access = await (navigator as any).requestMIDIAccess();
        this.midiAccess = access;
        for (const input of access.inputs.values()) {
          input.onmidimessage = (event: any) => this.handleMidiMessage(event);
        }
        access.onstatechange = (e: any) => {
          if (e.port.type === 'input' && e.port.state === 'connected') {
            e.port.onmidimessage = (event: any) => this.handleMidiMessage(event);
          }
        };
      } catch (err) {
        // Web MIDI might be restricted in some iframe contexts, safe to swallow
      }
    }
  }

  private handleMidiMessage(event: any) {
    const [status, data1, data2] = event.data;
    const command = status >> 4;
    // 9 = Note On, 8 = Note Off
    if (command === 9) {
      const velocity = data2 / 127;
      if (velocity > 0) {
        this.onMidiNoteCallback?.(data1, velocity, true);
      } else {
        this.onMidiNoteCallback?.(data1, 0, false);
      }
    } else if (command === 8) {
      this.onMidiNoteCallback?.(data1, 0, false);
    }
  }

  private createImpulseResponse(ctx: BaseAudioContext, duration: number, decay: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i;
      const factor = Math.exp(-n / (sampleRate * (duration / decay)));
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }
    return impulse;
  }

  public triggerLiveNoteOn(track: Track, pitch: number, velocity: number = 0.8) {
    this.init();
    if (!this.ctx || track.muted) return;

    const keyId = `${track.id}-${pitch}`;
    if (this.activeLiveVoices.has(keyId)) {
      this.activeLiveVoices.get(keyId)?.stop();
      this.activeLiveVoices.delete(keyId);
    }

    const voice = this.synthesizeVoice(this.ctx, track, pitch, velocity, 0, 999);
    this.activeLiveVoices.set(keyId, voice);
  }

  public triggerLiveNoteOff(track: Track, pitch: number) {
    const keyId = `${track.id}-${pitch}`;
    const voice = this.activeLiveVoices.get(keyId);
    if (voice) {
      voice.stop();
      this.activeLiveVoices.delete(keyId);
    }
  }

  public triggerAllNotesOff() {
    this.activeLiveVoices.forEach((voice) => {
      try {
        voice.stop();
      } catch (e) {}
    });
    this.activeLiveVoices.clear();
  }

  public scheduleNote(track: Track, note: Note, audioTime: number, bpm: number) {
    if (!this.ctx || track.muted) return;
    const beatSeconds = 60 / bpm;
    const durationSeconds = note.duration * beatSeconds;
    this.synthesizeVoice(this.ctx, track, note.pitch, note.velocity, audioTime, durationSeconds);
  }

  private pitchToFreq(pitch: number): number {
    return 440 * Math.pow(2, (pitch - 69) / 12);
  }

  private synthesizeVoice(
    ctx: BaseAudioContext,
    track: Track,
    pitch: number,
    velocity: number,
    startTime: number,
    duration: number
  ): { stop: () => void } {
    const actualStartTime = Math.max(ctx.currentTime, startTime);
    const freq = this.pitchToFreq(pitch);
    const eff = track.effects;

    // Track Channel Strip
    const voiceGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(eff.cutoff, actualStartTime);
    filter.Q.setValueAtTime(eff.resonance, actualStartTime);

    // Track Pan
    let panner: StereoPannerNode | null = null;
    if (typeof (ctx as any).createStereoPanner === 'function') {
      panner = (ctx as any).createStereoPanner();
      panner!.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan)), actualStartTime);
    }

    // Connect strip
    if (panner) {
      voiceGain.connect(filter);
      filter.connect(panner);
      if (this.compressor) panner.connect(this.compressor);
      if (this.delayNode && eff.delaySend > 0) {
        const sendGain = ctx.createGain();
        sendGain.gain.setValueAtTime(eff.delaySend, actualStartTime);
        panner.connect(sendGain);
        sendGain.connect(this.delayNode);
      }
      if (this.reverbConvolver && eff.reverbSend > 0) {
        const revGain = ctx.createGain();
        revGain.gain.setValueAtTime(eff.reverbSend, actualStartTime);
        panner.connect(revGain);
        revGain.connect(this.reverbConvolver);
      }
    } else {
      voiceGain.connect(filter);
      if (this.compressor) filter.connect(this.compressor);
    }

    const baseVol = track.volume * velocity * 0.45;
    const attack = Math.max(0.002, eff.attack);
    const decay = Math.max(0.01, eff.decay);
    const sustainLevel = baseVol * Math.max(0, Math.min(1, eff.sustain));
    const release = Math.max(0.02, eff.release);

    // ADSR Envelope
    voiceGain.gain.setValueAtTime(0.0001, actualStartTime);
    voiceGain.gain.linearRampToValueAtTime(baseVol, actualStartTime + attack);
    voiceGain.gain.linearRampToValueAtTime(sustainLevel, actualStartTime + attack + decay);

    const cleanupNodes: { stop: (time: number) => void }[] = [];

    // Check for Custom Sampled SoundFont / Audio Upload
    const customSample = this.customSamples.get(track.instrument);
    if (customSample) {
      const src = ctx.createBufferSource();
      src.buffer = customSample.buffer;
      const rate = Math.pow(2, (pitch - customSample.rootPitch) / 12);
      src.playbackRate.setValueAtTime(rate, actualStartTime);
      src.connect(voiceGain);
      src.start(actualStartTime);
      cleanupNodes.push(src);
    } else {
      // Standard SoundFont Presets
      switch (track.instrument) {
      case 'grand_piano': {
        // Multi-harmonic acoustic model
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const osc3 = ctx.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc3.type = 'sawtooth';

        osc1.frequency.setValueAtTime(freq, actualStartTime);
        osc2.frequency.setValueAtTime(freq * 2, actualStartTime);
        osc3.frequency.setValueAtTime(freq * 3, actualStartTime);

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.3, actualStartTime);
        const osc3Gain = ctx.createGain();
        osc3Gain.gain.setValueAtTime(0.08, actualStartTime);

        osc1.connect(voiceGain);
        osc2.connect(osc2Gain);
        osc2Gain.connect(voiceGain);
        osc3.connect(osc3Gain);
        osc3Gain.connect(voiceGain);

        [osc1, osc2, osc3].forEach((o) => {
          o.start(actualStartTime);
          cleanupNodes.push(o);
        });
        break;
      }

      case 'rhodes': {
        // FM bell tine e-piano
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();

        carrier.type = 'sine';
        modulator.type = 'sine';
        carrier.frequency.setValueAtTime(freq, actualStartTime);
        modulator.frequency.setValueAtTime(freq * 2, actualStartTime);

        modGain.gain.setValueAtTime(freq * 1.5, actualStartTime);
        modGain.gain.exponentialRampToValueAtTime(1, actualStartTime + 0.5);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(voiceGain);

        carrier.start(actualStartTime);
        modulator.start(actualStartTime);
        cleanupNodes.push(carrier, modulator);
        break;
      }

      case 'synth_lead': {
        // Dual detuned saw lead
        const saw1 = ctx.createOscillator();
        const saw2 = ctx.createOscillator();
        saw1.type = 'sawtooth';
        saw2.type = 'sawtooth';
        saw1.frequency.setValueAtTime(freq, actualStartTime);
        saw2.frequency.setValueAtTime(freq * 1.004, actualStartTime); // Detuned

        saw1.connect(voiceGain);
        saw2.connect(voiceGain);

        // Filter envelope sweep
        filter.frequency.setValueAtTime(eff.cutoff * 1.8, actualStartTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(80, eff.cutoff), actualStartTime + 0.3);

        saw1.start(actualStartTime);
        saw2.start(actualStartTime);
        cleanupNodes.push(saw1, saw2);
        break;
      }

      case 'analog_bass': {
        // 808 sub bass with pitch sweep transient
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(freq * 1.4, actualStartTime);
        sub.frequency.exponentialRampToValueAtTime(freq, actualStartTime + 0.08);

        const subSquare = ctx.createOscillator();
        subSquare.type = 'square';
        subSquare.frequency.setValueAtTime(freq, actualStartTime);
        const subSquareGain = ctx.createGain();
        subSquareGain.gain.setValueAtTime(0.12, actualStartTime);

        sub.connect(voiceGain);
        subSquare.connect(subSquareGain);
        subSquareGain.connect(voiceGain);

        sub.start(actualStartTime);
        subSquare.start(actualStartTime);
        cleanupNodes.push(sub, subSquare);
        break;
      }

      case 'ambient_pad': {
        // 3-Osc detuned lush pad
        const p1 = ctx.createOscillator();
        const p2 = ctx.createOscillator();
        p1.type = 'sawtooth';
        p2.type = 'triangle';
        p1.frequency.setValueAtTime(freq * 0.998, actualStartTime);
        p2.frequency.setValueAtTime(freq * 1.002, actualStartTime);

        p1.connect(voiceGain);
        p2.connect(voiceGain);
        p1.start(actualStartTime);
        p2.start(actualStartTime);
        cleanupNodes.push(p1, p2);
        break;
      }

      case 'chiptune': {
        // Quantized 8-bit pulse wave
        const chip = ctx.createOscillator();
        chip.type = 'square';
        chip.frequency.setValueAtTime(freq, actualStartTime);
        chip.connect(voiceGain);
        chip.start(actualStartTime);
        cleanupNodes.push(chip);
        break;
      }

      case 'drums': {
        // General MIDI Drum Synth
        if (pitch <= 36) {
          // Kick (35/36)
          const kickOsc = ctx.createOscillator();
          kickOsc.type = 'sine';
          kickOsc.frequency.setValueAtTime(140, actualStartTime);
          kickOsc.frequency.exponentialRampToValueAtTime(38, actualStartTime + 0.12);
          kickOsc.connect(voiceGain);
          kickOsc.start(actualStartTime);
          cleanupNodes.push(kickOsc);
        } else if (pitch === 38 || pitch === 40) {
          // Snare
          const snareOsc = ctx.createOscillator();
          snareOsc.type = 'triangle';
          snareOsc.frequency.setValueAtTime(180, actualStartTime);
          snareOsc.connect(voiceGain);
          snareOsc.start(actualStartTime);

          const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
          const output = noiseBuffer.getChannelData(0);
          for (let i = 0; i < noiseBuffer.length; i++) {
            output[i] = Math.random() * 2 - 1;
          }
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;
          noise.connect(voiceGain);
          noise.start(actualStartTime);

          cleanupNodes.push(snareOsc, noise);
        } else if (pitch === 42 || pitch === 44 || pitch === 46) {
          // Hi-Hat
          const hatLength = pitch === 46 ? 0.35 : 0.05;
          const hatBuffer = ctx.createBuffer(1, ctx.sampleRate * hatLength, ctx.sampleRate);
          const data = hatBuffer.getChannelData(0);
          for (let i = 0; i < hatBuffer.length; i++) {
            data[i] = Math.random() * 2 - 1;
          }
          const hatSource = ctx.createBufferSource();
          hatSource.buffer = hatBuffer;

          const hatFilter = ctx.createBiquadFilter();
          hatFilter.type = 'highpass';
          hatFilter.frequency.setValueAtTime(7000, actualStartTime);

          hatSource.connect(hatFilter);
          hatFilter.connect(voiceGain);
          hatSource.start(actualStartTime);
          cleanupNodes.push(hatSource);
        } else {
          // Clap / Tom
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, actualStartTime);
          osc.connect(voiceGain);
          osc.start(actualStartTime);
          cleanupNodes.push(osc);
        }
        break;
      }
    }
  }

    const stopTime = actualStartTime + duration;
    voiceGain.gain.setValueAtTime(sustainLevel, stopTime);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime + release);

    cleanupNodes.forEach((node) => {
      try {
        node.stop(stopTime + release + 0.05);
      } catch (e) {}
    });

    return {
      stop: () => {
        const now = ctx.currentTime;
        voiceGain.gain.cancelScheduledValues(now);
        voiceGain.gain.setValueAtTime(voiceGain.gain.value, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        cleanupNodes.forEach((node) => {
          try {
            node.stop(now + 0.06);
          } catch (e) {}
        });
      },
    };
  }

  // AuraOffline: Glitch-free Fast Offline WAV Renderer
  public async renderOffline(project: ProjectState): Promise<Blob> {
    const bpm = project.bpm;
    const beatSeconds = 60 / bpm;
    const totalDuration = project.totalBars * 4 * beatSeconds + 2.0; // tail for reverb
    const sampleRate = 44100;

    const OfflineCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const offlineCtx = new OfflineCtxClass(2, Math.ceil(totalDuration * sampleRate), sampleRate);

    // Build offline graph
    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(project.masterVolume, 0);

    const comp = offlineCtx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-10, 0);
    comp.ratio.setValueAtTime(6, 0);

    masterGain.connect(comp);
    comp.connect(offlineCtx.destination);

    // Schedule all notes across all tracks
    for (const track of project.tracks) {
      if (track.muted) continue;
      for (const note of track.notes) {
        const noteStartTime = note.time * beatSeconds;
        const noteDuration = note.duration * beatSeconds;
        this.synthesizeOfflineVoice(offlineCtx, track, note, noteStartTime, noteDuration, masterGain);
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return this.audioBufferToWav(renderedBuffer);
  }

  private synthesizeOfflineVoice(
    ctx: OfflineAudioContext,
    track: Track,
    note: Note,
    startTime: number,
    duration: number,
    destination: AudioNode
  ) {
    const freq = this.pitchToFreq(note.pitch);
    const eff = track.effects;
    const voiceGain = ctx.createGain();

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(eff.cutoff, startTime);
    filter.Q.setValueAtTime(eff.resonance, startTime);

    voiceGain.connect(filter);
    filter.connect(destination);

    const baseVol = track.volume * note.velocity * 0.45;
    const attack = Math.max(0.002, eff.attack);
    const decay = Math.max(0.01, eff.decay);
    const sustain = baseVol * Math.max(0, Math.min(1, eff.sustain));
    const release = Math.max(0.02, eff.release);

    voiceGain.gain.setValueAtTime(0.0001, startTime);
    voiceGain.gain.linearRampToValueAtTime(baseVol, startTime + attack);
    voiceGain.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);

    const customSample = this.customSamples.get(track.instrument);
    if (customSample) {
      const src = ctx.createBufferSource();
      src.buffer = customSample.buffer;
      const rate = Math.pow(2, (note.pitch - customSample.rootPitch) / 12);
      src.playbackRate.setValueAtTime(rate, startTime);
      src.connect(voiceGain);
      src.start(startTime);
    } else {
      const osc = ctx.createOscillator();
      osc.type = track.instrument === 'analog_bass' ? 'sine' : track.instrument === 'synth_lead' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.connect(voiceGain);
      osc.start(startTime);

      const stopTime = startTime + duration;
      voiceGain.gain.setValueAtTime(sustain, stopTime);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime + release);
      osc.stop(stopTime + release + 0.05);
      return;
    }

    const stopTime = startTime + duration;
    voiceGain.gain.setValueAtTime(sustain, stopTime);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime + release);
  }

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * blockAlign;
    const bufferSize = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // RIFF identifier
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave samples
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

export const synth = new SynthEngine();
