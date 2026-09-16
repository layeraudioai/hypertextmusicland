import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'AuraVision DAW Hybrid Engine' });
  });

  // LayAI Generative Composer API
  app.post('/api/ai-compose', async (req, res) => {
    try {
      const { prompt, genre = 'synthwave', bpm = 120, key = 'C minor', lengthBars = 4 } = req.body;

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Safe offline algorithmic fallback if API key is not configured
        return res.json({
          success: true,
          fallback: true,
          message: 'Offline Algorithmic Mode Active (GEMINI_API_KEY not configured)',
          data: generateAlgorithmicComposition(prompt, genre, bpm, key, lengthBars),
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are LayAI & MidiMuse, an elite AI Music Producer and Audio-Visual Architect.
Generate a cohesive multi-track MIDI and sound design arrangement conforming to the user prompt.
Output JSON only with this exact schema:
{
  "title": string,
  "genre": string,
  "bpm": number (40-200),
  "key": string,
  "scale": string,
  "description": string,
  "visualFlowTheme": "neon-aura" | "cyber-grid" | "particle-vortex" | "nebula-bloom" | "retro-vhs" | "kaleidoscope",
  "tracks": [
    {
      "name": string,
      "instrument": "grand_piano" | "rhodes" | "synth_lead" | "analog_bass" | "ambient_pad" | "chiptune" | "drums",
      "volume": number (0 to 1),
      "pan": number (-1 to 1),
      "notes": [
        { "pitch": number (MIDI note 24 to 96), "time": number (in beats, starting at 0), "duration": number (in beats, e.g. 0.5, 1, 2), "velocity": number (0 to 1) }
      ]
    }
  ]
}`;

      const userContent = `User Request: "${prompt || 'Generative Cyberpunk Synth Track'}".
Desired Genre: ${genre}, BPM: ${bpm}, Key: ${key}, Length: ${lengthBars} bars.
Create 3 to 4 complementary tracks (e.g. Bassline, Melody/Lead, Chords/Pad, Drums) spanning ${lengthBars} bars (16 steps per bar at 16th notes). Ensure musically resonant harmonies in the key of ${key}.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userContent,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      const responseText = response.text || '{}';
      const parsedData = JSON.parse(responseText);

      return res.json({
        success: true,
        fallback: false,
        data: parsedData,
      });
    } catch (err: any) {
      console.error('AI Generation Error:', err);
      // Seamless fallback on any network or quota error
      const { prompt, genre = 'synthwave', bpm = 120, key = 'C minor', lengthBars = 4 } = req.body;
      return res.json({
        success: true,
        fallback: true,
        message: 'Algorithmic fallback triggered: ' + (err.message || 'unknown error'),
        data: generateAlgorithmicComposition(prompt, genre, bpm, key, lengthBars),
      });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AuraVision DAW Server] running on http://0.0.0.0:${PORT}`);
  });
}

function generateAlgorithmicComposition(prompt: string, genre: string, bpm: number, key: string, lengthBars: number = 4) {
  // Built-in procedural harmonic generator
  const scalePitches = [48, 51, 53, 55, 58, 60, 63, 65, 67, 70, 72]; // C minor pentatonic / blues basis
  const totalBeats = lengthBars * 4;

  // Bass notes
  const bassNotes = [];
  const bassPitches = [36, 39, 41, 43];
  for (let b = 0; b < totalBeats; b += 1) {
    const p = bassPitches[Math.floor(b / 4) % bassPitches.length];
    bassNotes.push({
      pitch: p,
      time: b,
      duration: 0.8,
      velocity: 0.85,
    });
  }

  // Lead Melody
  const leadNotes = [];
  for (let b = 0; b < totalBeats; b += 0.5) {
    if (Math.random() > 0.3) {
      const p = scalePitches[Math.floor(Math.random() * scalePitches.length)];
      leadNotes.push({
        pitch: p,
        time: b,
        duration: Math.random() > 0.5 ? 0.45 : 0.9,
        velocity: 0.7 + Math.random() * 0.25,
      });
    }
  }

  // Chords / Pad
  const padNotes = [];
  for (let bar = 0; bar < lengthBars; bar++) {
    const root = [48, 44, 46, 43][bar % 4];
    padNotes.push(
      { pitch: root, time: bar * 4, duration: 3.8, velocity: 0.6 },
      { pitch: root + 7, time: bar * 4, duration: 3.8, velocity: 0.55 },
      { pitch: root + 10, time: bar * 4, duration: 3.8, velocity: 0.5 }
    );
  }

  // Drums
  const drumNotes = [];
  for (let b = 0; b < totalBeats; b += 0.5) {
    // Kick on 1 and 3
    if (b % 2 === 0) {
      drumNotes.push({ pitch: 36, time: b, duration: 0.3, velocity: 0.95 });
    }
    // Snare on 2 and 4
    if (b % 2 === 1) {
      drumNotes.push({ pitch: 38, time: b, duration: 0.3, velocity: 0.9 });
    }
    // Hi-hat on 8ths
    drumNotes.push({ pitch: 42, time: b, duration: 0.2, velocity: 0.65 });
  }

  return {
    title: prompt ? `Generated: ${prompt.slice(0, 30)}` : 'Algorithmic Neon Pulse',
    genre,
    bpm: bpm || 124,
    key: key || 'C minor',
    scale: 'Natural Minor',
    description: 'Algorithmic procedural composition synthesizing Muse harmony and Sonic RNG rhythm.',
    visualFlowTheme: 'neon-aura',
    tracks: [
      { name: 'Sub Bass 808', instrument: 'analog_bass', volume: 0.85, pan: 0, notes: bassNotes },
      { name: 'Neon Lead Synth', instrument: 'synth_lead', volume: 0.75, pan: 0.2, notes: leadNotes },
      { name: 'Ambient Void Pad', instrument: 'ambient_pad', volume: 0.6, pan: -0.2, notes: padNotes },
      { name: 'Electro Beat Unit', instrument: 'drums', volume: 0.8, pan: 0, notes: drumNotes },
    ],
  };
}

startServer().catch(console.error);
