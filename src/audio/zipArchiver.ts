import JSZip from 'jszip';
import { ProjectState, Track } from '../types/daw';
import { synth } from './synthEngine';
import { exportToMidiFile } from './midiParser';
import { generateSf2Binary } from './sf2Generator';
import { sampleManager } from './audioProcessor';
import { SOUNDFONT_PRESETS, getNoteName } from './constants';

export interface ExportProgress {
  message: string;
  percent: number;
}

/**
 * Full Saving to DAW stems + midi + sf2 + masters ZIP
 * Packages everything into a production-grade ZIP container for cross-DAW collaboration & archiving.
 */
export async function exportFullDawZip(
  project: ProjectState,
  onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
  const zip = new JSZip();
  const safeTitle = (project.title || 'AuraVision_Project').replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. Project State JSON
  onProgress?.({ message: 'Serializing DAW Session State (.json)...', percent: 5 });
  const projectJson = JSON.stringify(project, null, 2);
  zip.file('project.json', projectJson);

  // 2. Master Mixdown WAV (Offline 32-bit Float DSP)
  onProgress?.({ message: 'Rendering Master Mixdown WAV (Full Master Audio)...', percent: 15 });
  try {
    const masterBlob = await synth.renderOffline(project);
    const mastersFolder = zip.folder('masters');
    mastersFolder?.file(`${safeTitle}_Master_Mix.wav`, masterBlob);
  } catch (err: any) {
    console.error('Failed to render master WAV:', err);
  }

  // 3. Render Individual Track Stems
  const stemsFolder = zip.folder('stems');
  const tracks = project.tracks;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const pct = Math.round(25 + ((i + 1) / Math.max(1, tracks.length)) * 45);
    onProgress?.({
      message: `Rendering Stem ${i + 1}/${tracks.length}: "${track.name}" (${track.instrument})...`,
      percent: pct,
    });

    try {
      // Create single-track project snapshot
      const stemProject: ProjectState = {
        ...project,
        tracks: [
          {
            ...track,
            muted: false,
            solo: false,
          },
        ],
      };

      const stemBlob = await synth.renderOffline(stemProject);
      const paddedIndex = String(i + 1).padStart(2, '0');
      const safeTrackName = track.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      stemsFolder?.file(`${paddedIndex}_${safeTrackName}.wav`, stemBlob);
    } catch (stemErr: any) {
      console.error(`Failed to render stem for ${track.name}:`, stemErr);
    }
  }

  // 4. MIDI Export (Full Project + Individual Stems)
  onProgress?.({ message: 'Compiling Standard MIDI (.mid) files for all tracks...', percent: 75 });
  const midiFolder = zip.folder('midi');

  // 4a. Multi-track project MIDI
  try {
    const fullMidiBytes = exportToMidiFile(project.tracks, project.bpm, project.title);
    midiFolder?.file(`${safeTitle}_Full_Project.mid`, fullMidiBytes);
  } catch (err) {
    console.error('Failed to export full MIDI:', err);
  }

  // 4b. Single-track MIDI files
  tracks.forEach((track, idx) => {
    try {
      const paddedIndex = String(idx + 1).padStart(2, '0');
      const safeTrackName = track.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const trackMidiBytes = exportToMidiFile([track], project.bpm, track.name);
      midiFolder?.file(`${paddedIndex}_${safeTrackName}.mid`, trackMidiBytes);
    } catch (err) {
      console.error(`Failed to export MIDI for ${track.name}:`, err);
    }
  });

  // 5. SoundFonts (.sf2) & Instrument Soundbanks
  onProgress?.({ message: 'Generating SoundFont 2.04 (.sf2) binary banks...', percent: 85 });
  const sf2Folder = zip.folder('sf2');

  const customInstruments = sampleManager.getAllInstruments();
  const addedSf2Ids = new Set<string>();

  for (const inst of customInstruments) {
    if (inst.audioBuffer) {
      try {
        const sf2Binary = generateSf2Binary(
          inst.name,
          inst.audioBuffer,
          inst.rootPitch,
          inst.name,
          0
        );
        const safeName = inst.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        sf2Folder?.file(`${safeName}.sf2`, sf2Binary);
        addedSf2Ids.add(inst.id);
      } catch (sf2Err) {
        console.error(`Failed to generate SF2 for ${inst.name}:`, sf2Err);
      }
    }
  }

  // Also check synth custom samples if not already included
  const allSynthSamples = synth.getAllCustomSamples();
  for (const [id, sampleData] of allSynthSamples) {
    if (!addedSf2Ids.has(id) && sampleData.buffer) {
      try {
        const sf2Binary = generateSf2Binary(
          id,
          sampleData.buffer,
          sampleData.rootPitch,
          `AuraVision_${id}`,
          0
        );
        const safeName = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        sf2Folder?.file(`${safeName}.sf2`, sf2Binary);
        addedSf2Ids.add(id);
      } catch (sf2Err) {
        console.error(`Failed to generate SF2 for synth sample ${id}:`, sf2Err);
      }
    }
  }

  // Create an Instruments Manifest for the project
  const instrumentsManifest = {
    projectName: project.title,
    bpm: project.bpm,
    exportedAt: new Date().toISOString(),
    tracksUsed: project.tracks.map((t) => ({
      trackName: t.name,
      instrumentId: t.instrument,
      notesCount: t.notes.length,
      volume: t.volume,
      pan: t.pan,
      isCustomSample: addedSf2Ids.has(t.instrument),
      presetInfo: SOUNDFONT_PRESETS.find((p) => p.id === t.instrument) || null,
      effects: t.effects,
    })),
    customSoundFontsCount: addedSf2Ids.size,
  };
  sf2Folder?.file('instruments_manifest.json', JSON.stringify(instrumentsManifest, null, 2));

  // 6. Project Documentation & Guide (README.txt)
  onProgress?.({ message: 'Building Session Documentation & DAW guide...', percent: 92 });
  const totalNotes = project.tracks.reduce((acc, t) => acc + t.notes.length, 0);
  const beatSeconds = 60 / project.bpm;
  const estimatedSeconds = project.totalBars * 4 * beatSeconds;

  const readmeContent = `=======================================================
AURAVISION HYBRID 66GHz - FULL DAW EXPORT PACKAGE
=======================================================
Project Title: ${project.title}
Tempo (BPM):   ${project.bpm}
Time Signature: ${project.timeSignature ? project.timeSignature.join('/') : '4/4'}
Total Bars:    ${project.totalBars} (~${estimatedSeconds.toFixed(1)} seconds)
Total Tracks:  ${project.tracks.length}
Total Notes:   ${totalNotes}
Export Date:   ${new Date().toUTCString()}

-------------------------------------------------------
PACKAGE CONTENTS
-------------------------------------------------------
1. /project.json
   Complete AuraVision DAW session file. Can be imported directly
   into AuraVision at any time using the "Import Project (.json)" button.

2. /masters/
   Contains the full stereo master mixdown:
   - ${safeTitle}_Master_Mix.wav (44.1kHz, 16/32-bit linear PCM)

3. /stems/
   Isolated audio stems for every track, perfect for drag-and-drop
   into external DAWs (Ableton Live, FL Studio, Logic Pro, Pro Tools, Reaper):
${project.tracks
  .map(
    (t, idx) =>
      `   - ${String(idx + 1).padStart(2, '0')}_${t.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.wav [${t.instrument}, ${t.notes.length} notes]`
  )
  .join('\n')}

4. /midi/
   Full standard MIDI files for score editing, virtual instruments, and hardware synths:
   - ${safeTitle}_Full_Project.mid (All tracks consolidated into standard Type 1 MIDI)
${project.tracks
  .map(
    (t, idx) =>
      `   - ${String(idx + 1).padStart(2, '0')}_${t.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.mid`
  )
  .join('\n')}

5. /sf2/
   SoundFont 2.04 (.sf2) binary soundbanks and instruments manifest:
   - instruments_manifest.json (Detailed sound design and patch mapping)
   ${
     addedSf2Ids.size > 0
       ? `Custom SoundFonts packaged: ${Array.from(addedSf2Ids).join(', ')}`
       : 'Standard 66GHz SoundFont presets used.'
   }

-------------------------------------------------------
TRACK & SYNTHESIS DETAILS
-------------------------------------------------------
${project.tracks
  .map(
    (t, i) => `[Track ${i + 1}] ${t.name}
  • Instrument: ${t.instrument}
  • Notes: ${t.notes.length}
  • Volume: ${Math.round(t.volume * 100)}% | Pan: ${t.pan}
  • Filter Cutoff: ${t.effects.cutoff} Hz | Resonance: ${t.effects.resonance}
  • Reverb Send: ${Math.round(t.effects.reverbSend * 100)}% | Delay Send: ${Math.round(t.effects.delaySend * 100)}%
  • Envelope: Attack ${t.effects.attack}s, Decay ${t.effects.decay}s, Sustain ${t.effects.sustain}, Release ${t.effects.release}s`
  )
  .join('\n\n')}

=======================================================
Generated with AuraVision Hybrid DAW Engine
`;
  zip.file('README.txt', readmeContent);

  // 7. Generate Compressed ZIP
  onProgress?.({ message: 'Compressing full DAW package into .zip archive...', percent: 96 });
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.({
        message: `Compressing ZIP archive: ${metadata.percent.toFixed(0)}%`,
        percent: Math.min(99, Math.round(96 + (metadata.percent / 100) * 3)),
      });
    }
  );

  onProgress?.({ message: 'Complete! Downloading package...', percent: 100 });
  return zipBlob;
}
