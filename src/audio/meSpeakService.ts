// meSpeak TTS Service wrapper for browser & Vite
// Imports meSpeak and bundled voices/config
import meSpeak from 'mespeak';
import mespeakConfig from 'mespeak/src/mespeak_config.json';
import enUsVoice from 'mespeak/voices/en/en-us.json';
import enVoice from 'mespeak/voices/en/en.json';
import esVoice from 'mespeak/voices/es.json';
import frVoice from 'mespeak/voices/fr.json';
import deVoice from 'mespeak/voices/de.json';

export interface MeSpeakVoiceOption {
  id: string;
  name: string;
  lang: string;
  voiceData: any;
  variant?: string;
  defaultPitch?: number;
  defaultSpeed?: number;
}

export const MESPEAK_VOICES: MeSpeakVoiceOption[] = [
  { id: 'en/en-us', name: 'English (US) - Natural', lang: 'en', voiceData: enUsVoice, defaultPitch: 50, defaultSpeed: 160 },
  { id: 'en/en', name: 'English (UK) - Formal', lang: 'en', voiceData: enVoice, defaultPitch: 50, defaultSpeed: 155 },
  { id: 'en/en-us-robot', name: 'Cyber Robot (Whisper & Metal)', lang: 'en', voiceData: enUsVoice, variant: 'm3', defaultPitch: 35, defaultSpeed: 140 },
  { id: 'en/en-us-alien', name: 'Alien / High Formant', lang: 'en', voiceData: enUsVoice, variant: 'f5', defaultPitch: 78, defaultSpeed: 180 },
  { id: 'en/en-us-bass', name: 'Deep Sub-Vocoder / Narrator', lang: 'en', voiceData: enUsVoice, variant: 'm1', defaultPitch: 22, defaultSpeed: 130 },
  { id: 'es', name: 'Spanish (Español)', lang: 'es', voiceData: esVoice, defaultPitch: 50, defaultSpeed: 165 },
  { id: 'fr', name: 'French (Français)', lang: 'fr', voiceData: frVoice, defaultPitch: 52, defaultSpeed: 160 },
  { id: 'de', name: 'German (Deutsch)', lang: 'de', voiceData: deVoice, defaultPitch: 48, defaultSpeed: 150 },
];

let isInitialized = false;
const loadedVoices = new Set<string>();

export function ensureMeSpeakInitialized(): boolean {
  if (isInitialized) return true;
  try {
    if (!meSpeak.isConfigLoaded()) {
      meSpeak.loadConfig(mespeakConfig);
    }
    // Load default voice
    if (!loadedVoices.has('en/en-us')) {
      meSpeak.loadVoice(enUsVoice);
      loadedVoices.add('en/en-us');
    }
    isInitialized = true;
    return true;
  } catch (err) {
    console.error('Failed to initialize meSpeak TTS:', err);
    return false;
  }
}

export interface TtsSynthOptions {
  voice?: string;
  variant?: string;
  pitch?: number; // 0 to 100, default 50
  speed?: number; // words per min, default 160
  wordgap?: number; // pause between words, default 0
  amplitude?: number; // volume 0 to 200, default 100
}

/**
 * Synthesize speech from text using meSpeak and return a raw 16-bit WAV ArrayBuffer
 */
export function synthesizeSpeechWav(text: string, options: TtsSynthOptions = {}): ArrayBuffer {
  ensureMeSpeakInitialized();

  const voiceId = options.voice || 'en/en-us';
  const voicePreset = MESPEAK_VOICES.find((v) => v.id === voiceId) || MESPEAK_VOICES[0];

  // Load voice if not already loaded into meSpeak virtual fs
  if (!loadedVoices.has(voicePreset.id) && voicePreset.voiceData) {
    try {
      meSpeak.loadVoice(voicePreset.voiceData);
      loadedVoices.add(voicePreset.id);
    } catch (e) {
      console.warn('Could not load specific meSpeak voice, falling back to default', e);
    }
  }

  const pitch = options.pitch ?? voicePreset.defaultPitch ?? 50;
  const speed = options.speed ?? voicePreset.defaultSpeed ?? 160;
  const amplitude = options.amplitude ?? 100;
  const wordgap = options.wordgap ?? 0;
  const variant = options.variant || voicePreset.variant;

  const wavArrayBuffer = meSpeak.speak(text, {
    voice: voicePreset.lang === 'en' ? 'en/en-us' : voicePreset.lang,
    variant,
    pitch,
    speed,
    amplitude,
    wordgap,
    rawdata: 'buffer',
  });

  if (!wavArrayBuffer) {
    throw new Error('meSpeak returned empty audio buffer for text: ' + text);
  }

  return wavArrayBuffer as ArrayBuffer;
}

/**
 * Synthesizes text and decodes it into a Web Audio AudioBuffer
 */
export async function synthesizeSpeechToAudioBuffer(
  text: string,
  options: TtsSynthOptions = {},
  audioCtx?: BaseAudioContext
): Promise<{ audioBuffer: AudioBuffer; wavBlob: Blob; wavArrayBuffer: ArrayBuffer }> {
  const wavArrayBuffer = synthesizeSpeechWav(text, options);
  
  // Clone ArrayBuffer before decoding because decodeAudioData detaches the buffer in some browsers
  const bufferCopy = wavArrayBuffer.slice(0);
  const ctx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await ctx.decodeAudioData(bufferCopy);
  const wavBlob = new Blob([wavArrayBuffer], { type: 'audio/wav' });

  return {
    audioBuffer,
    wavBlob,
    wavArrayBuffer,
  };
}
