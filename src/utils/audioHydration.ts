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
      // If already has audioBuffer, and NOT an SF2 instrument that might need further hydration, skip
      if (inst.audioBuffer && !inst.isSf2) {
        sampleManager.registerInstrument(inst);
        return inst;
      }
      
      console.log(`[Hydration] Hydrating instrument: ${inst.id}, isSf2: ${!!inst.isSf2}`);
      const arrayBuffer = await getAudioData(inst.id);
      if (arrayBuffer) {
        if (inst.isSf2) {
          console.log(`[Hydration] Hydrating SF2 instrument: ${inst.id}`);
          const sf2Blob = new Blob([arrayBuffer], { type: 'application/x-soundfont' });
          const sf2Url = URL.createObjectURL(sf2Blob);
          const hydratedInst = { ...inst, sf2Blob, sf2Url };
          sampleManager.registerInstrument(hydratedInst);
          return hydratedInst;
        } else {
          console.log(`[Hydration] Decoding buffer for instrument: ${inst.id}`);
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          const hydratedInst = { ...inst, audioBuffer };
          sampleManager.registerInstrument(hydratedInst);
          return hydratedInst;
        }
      }
      console.warn(`[Hydration] Could not find buffer for instrument: ${inst.id}`);
      return inst;
    })
  );
  
  console.log('[Hydration] Project hydration complete');
  return { ...project, tracks: hydratedTracks, customInstruments: hydratedInstruments };
}
