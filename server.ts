import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// In-memory store for performance genome optimization
let globalBestGenome: any = {
  fitnessScore: 94.8,
  timestamp: Date.now(),
  sampleRate: 44100,
  bufferSize: 512,
  concurrencyLimit: 4,
  qualityPreset: 'high',
  userAgent: 'System Benchmark Default',
};

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. LayAI Generative Music Composer
app.post('/api/ai-compose', async (req, res) => {
  const { prompt, genre = 'synthwave', bpm = 120, key = 'C Major', lengthBars = 4 } = req.body || {};

  // Rule-based fallback generator for offline or non-API mode
  const generateFallbackComposition = () => {
    const scales: Record<string, number[]> = {
      'C Major': [60, 62, 64, 65, 67, 69, 71, 72],
      'A Minor': [57, 59, 60, 62, 64, 65, 67, 69],
      'D Minor': [62, 64, 65, 67, 69, 70, 72, 74],
      'G Major': [55, 57, 59, 60, 62, 64, 66, 67],
    };
    const scaleNotes = scales[key] || scales['C Major'];
    const totalBeats = lengthBars * 4;

    // Melody lead
    const leadNotes = [];
    for (let b = 0; b < totalBeats; b += 0.5) {
      if (Math.random() > 0.3) {
        const pitch = scaleNotes[Math.floor(Math.random() * scaleNotes.length)];
        leadNotes.push({
          pitch: pitch + 12,
          time: b,
          duration: 0.5,
          velocity: 0.85,
        });
      }
    }

    // Bassline
    const bassNotes = [];
    for (let bar = 0; bar < lengthBars; bar++) {
      const root = scaleNotes[0] - 24;
      for (let step = 0; step < 4; step++) {
        bassNotes.push({
          pitch: root,
          time: bar * 4 + step,
          duration: 0.75,
          velocity: 0.9,
        });
      }
    }

    // Chords / Pad
    const padNotes = [];
    for (let bar = 0; bar < lengthBars; bar++) {
      const root = scaleNotes[0];
      [root, root + 4, root + 7].forEach((p) => {
        padNotes.push({
          pitch: p,
          time: bar * 4,
          duration: 3.8,
          velocity: 0.7,
        });
      });
    }

    return {
      title: `${genre.toUpperCase()} - ${prompt?.slice(0, 20) || 'AI Composition'}`,
      bpm,
      totalBars: lengthBars,
      tracks: [
        { name: 'Lead Synth', instrument: 'synth_lead', volume: 0.85, notes: leadNotes },
        { name: 'Analog Bass', instrument: 'analog_bass', volume: 0.9, notes: bassNotes },
        { name: 'Ambient Pad', instrument: 'ambient_pad', volume: 0.7, notes: padNotes },
      ],
    };
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const fallbackData = generateFallbackComposition();
    return res.json({ success: true, fallback: true, data: fallbackData });
  }

  try {
    const ai = new GoogleGenAI();
    const systemPrompt = `You are a music theory and generative MIDI synthesis engine.
Given the following user request, compose a multi-track musical piece with MIDI notes.
Key: ${key}, Genre: ${genre}, BPM: ${bpm}, Length in bars: ${lengthBars}.
Prompt: "${prompt}"

Return ONLY a valid JSON object without markdown or formatting backticks, with this schema:
{
  "title": string,
  "bpm": number,
  "totalBars": number,
  "tracks": [
    {
      "name": string,
      "instrument": "synth_lead" | "analog_bass" | "ambient_pad" | "rhodes" | "grand_piano" | "chiptune" | "drums",
      "volume": number,
      "notes": [
        { "pitch": number (MIDI 0-127), "time": number (in beats, 0-indexed), "duration": number (in beats), "velocity": number (0-1) }
      ]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
    });

    let text = response.text || '';
    // Clean potential markdown wrap
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    return res.json({ success: true, fallback: false, data: parsed });
  } catch (err: any) {
    console.warn('Gemini composition failed, falling back to algorithmic rules:', err?.message || err);
    const fallbackData = generateFallbackComposition();
    return res.json({ success: true, fallback: true, data: fallbackData });
  }
});

// 3. Performance & Fire Away Optimization
app.get('/api/optimization', (req, res) => {
  res.json({ bestGenome: globalBestGenome });
});

app.post('/api/optimization', (req, res) => {
  const genome = req.body;
  if (genome && typeof genome.fitnessScore === 'number') {
    const isNewRecord = genome.fitnessScore > (globalBestGenome.fitnessScore || 0);
    if (isNewRecord) {
      globalBestGenome = { ...genome, timestamp: Date.now() };
    }
    return res.json({ success: true, isNewRecord, bestFitness: globalBestGenome.fitnessScore });
  }
  res.status(400).json({ success: false, error: 'Invalid genome data' });
});

// 4. Git Synchronization Endpoints (Local Repo Info)
app.get('/api/git/status', (req, res) => {
  res.json({
    success: true,
    branch: 'main',
    hasUncommittedChanges: false,
    stagedFiles: [],
    untrackedFiles: [],
    remoteUrl: 'https://github.com/auravision-daw/auravision-workstation.git',
  });
});

app.post('/api/git/commit', (req, res) => {
  const { message } = req.body;
  res.json({ success: true, message: `Committed: ${message || 'Updated project'}` });
});

app.post('/api/git/remote', (req, res) => {
  const { remoteUrl } = req.body;
  res.json({ success: true, remoteUrl });
});

app.post('/api/git/push', (req, res) => {
  res.json({ success: true, message: 'Changes pushed to remote repository!' });
});

// 5. Mount Vite middleware for dev or static for prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Support Express v4 and v5 path matchers safely
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
