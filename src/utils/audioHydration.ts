import { ProjectState } from '../types/daw';
import { getAudioData } from './audioPersistence';
import { synth } from '../audio/synthEngine'; // Import synth engine
import { sampleManager } from '../audio/audioProcessor';

export async function hydrateProject(project: ProjectState): Promise<ProjectState> {
  console.log('[Hydration] Starting project hydration', project);
  const ctx = synth.getAudioContext() || new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Hydrate Tracks
  const hydratedTracks = await Promise.all(
    project.tracks.map(async (track) => {
      let hydratedStem = track.audioStem;
      if (track.audioStem && !track.audioStem.buffer) {
        console.log(`[Hydration] Hydrating track stem: ${track.audioStem.id}`);
        const arrayBuffer = await getAudioData(track.audioStem.id);
        if (arrayBuffer) {
          console.log(`[Hydration] Decoding buffer for stem: ${track.audioStem.id}`);
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          hydratedStem = { ...track.audioStem, buffer };
        } else {
          console.warn(`[Hydration] Could not find buffer for stem: ${track.audioStem.id}`);
        }
      }
      return { ...track, audioStem: hydratedStem };
    })
  );

  // Hydrate Custom Instruments
  const hydratedInstruments = await Promise.all(
    (project.customInstruments || []).map(async (inst) => {
      if (inst.audioBuffer) {
        sampleManager.registerInstrument(inst);
        return inst; // Already hydrated
      }
      console.log(`[Hydration] Hydrating instrument: ${inst.id}`);
      const arrayBuffer = await getAudioData(inst.id);
      if (arrayBuffer) {
        console.log(`[Hydration] Decoding buffer for instrument: ${inst.id}`);
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const hydratedInst = { ...inst, audioBuffer };
        sampleManager.registerInstrument(hydratedInst);
        return hydratedInst;
      }
      console.warn(`[Hydration] Could not find buffer for instrument: ${inst.id}`);
      return inst;
    })
  );
  
  console.log('[Hydration] Project hydration complete');
  return { ...project, tracks: hydratedTracks, customInstruments: hydratedInstruments };
}
