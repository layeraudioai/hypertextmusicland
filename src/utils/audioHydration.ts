import { ProjectState } from '../types/daw';
import { getAudioData } from './audioPersistence';
import { synth } from '../audio/synthEngine'; // Import synth engine

export async function hydrateProject(project: ProjectState): Promise<ProjectState> {
  const ctx = synth.getAudioContext() || new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Hydrate Tracks
  const hydratedTracks = await Promise.all(
    project.tracks.map(async (track) => {
      let hydratedStem = track.audioStem;
      if (track.audioStem && !track.audioStem.buffer) {
        const arrayBuffer = await getAudioData(track.audioStem.id);
        if (arrayBuffer) {
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          hydratedStem = { ...track.audioStem, buffer };
        }
      }
      return { ...track, audioStem: hydratedStem };
    })
  );

  // Hydrate Custom Instruments
  const hydratedInstruments = await Promise.all(
    (project.customInstruments || []).map(async (inst) => {
      if (inst.audioBuffer) return inst; // Already hydrated
      const arrayBuffer = await getAudioData(inst.id);
      if (arrayBuffer) {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        return { ...inst, audioBuffer };
      }
      return inst;
    })
  );
  
  return { ...project, tracks: hydratedTracks, customInstruments: hydratedInstruments };
}
