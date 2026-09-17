import express from 'express';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'AuraVision DAW Hybrid Engine' });
  });

  // Git Repository & Sync APIs
  app.get('/api/git/status', (req, res) => {
    try {
      let isGitRepo = true;
      let branch = 'main';
      let lastCommit = { hash: '', message: '', date: '' };
      let remoteUrl = '';
      let statusOutput = '';

      try {
        branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim() || 'main';
        const logOutput = execSync('git log -1 --format="%h||%s||%cd"', { encoding: 'utf-8' }).trim();
        if (logOutput) {
          const [hash, message, date] = logOutput.split('||');
          lastCommit = { hash: hash || '', message: message || '', date: date || '' };
        }
        try {
          remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
        } catch (e) {
          remoteUrl = '';
        }
        statusOutput = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
      } catch (e: any) {
        isGitRepo = false;
      }

      const modifiedFiles = statusOutput ? statusOutput.split('\n').map((l) => l.trim()).filter(Boolean) : [];

      res.json({
        success: true,
        isGitRepo,
        branch,
        lastCommit,
        remoteUrl,
        clean: modifiedFiles.length === 0,
        modifiedFiles,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/git/commit', (req, res) => {
    try {
      const { message = 'Update AuraVision DAW session' } = req.body;
      try {
        execSync('git config user.name "AuraVision DAW"');
        execSync('git config user.email "auravision@studio.internal"');
      } catch (e) {}

      execSync('git add .');
      const safeMsg = (message || 'Update AuraVision DAW session').replace(/"/g, '\\"');
      try {
        execSync(`git commit -m "${safeMsg}"`);
      } catch (e) {
        // Nothing to commit is okay
      }

      let lastCommit = { hash: '', message: '', date: '' };
      try {
        const logOutput = execSync('git log -1 --format="%h||%s||%cd"', { encoding: 'utf-8' }).trim();
        const [hash, commitMessage, date] = logOutput.split('||');
        lastCommit = { hash: hash || '', message: commitMessage || '', date: date || '' };
      } catch (e) {}

      res.json({
        success: true,
        lastCommit,
        message: 'Changes successfully committed to local repository.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/git/remote', (req, res) => {
    try {
      const { remoteUrl } = req.body;
      if (!remoteUrl || typeof remoteUrl !== 'string') {
        return res.status(400).json({ success: false, error: 'Valid remote URL is required' });
      }
      try {
        execSync('git remote remove origin');
      } catch (e) {}
      execSync(`git remote add origin ${remoteUrl.trim()}`);
      res.json({ success: true, remoteUrl: remoteUrl.trim() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/git/push', (req, res) => {
    try {
      const { token, remoteUrl, branch = 'main' } = req.body;
      let targetRemote = (remoteUrl || '').trim();
      if (!targetRemote) {
        try {
          targetRemote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
        } catch (e) {}
      }

      if (!targetRemote) {
        return res.status(400).json({
          success: false,
          error: 'No remote GitHub repository configured. Please set the GitHub repository URL.',
        });
      }

      // Stage and commit any outstanding changes
      try {
        execSync('git add .');
        execSync('git commit -m "Sync project changes with GitHub"');
      } catch (e) {}

      try {
        execSync(`git branch -M ${branch}`);
      } catch (e) {}

      let authenticatedUrl = targetRemote;
      if (token && targetRemote.startsWith('https://github.com/')) {
        const cleanUrl = targetRemote.replace('https://', '');
        authenticatedUrl = `https://${encodeURIComponent(token.trim())}@${cleanUrl}`;
      }

      const output = execSync(`git push ${authenticatedUrl} ${branch} --force`, {
        encoding: 'utf-8',
        timeout: 25000,
      });

      res.json({
        success: true,
        message: 'Successfully pushed and synced with GitHub repository!',
        output,
      });
    } catch (err: any) {
      console.error('Git push error:', err);
      res.status(500).json({
        success: false,
        error:
          err.message ||
          'Failed to push to GitHub. Verify repository URL, token permissions (repo scope), and network accessibility.',
      });
    }
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
