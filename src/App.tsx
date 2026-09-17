import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ProjectState, Track, Note } from './types/daw';
import { createDefaultProject } from './audio/defaultProject';
import { synth } from './audio/synthEngine';
import { parseMidiFile, exportToMidiFile } from './audio/midiParser';
import { sampleManager } from './audio/audioProcessor';
import { DEFAULT_TRACK_EFFECTS } from './audio/constants';
import { Header } from './components/Header';
import { TransportBar } from './components/TransportBar';
import { TimelineView } from './components/TimelineView';
import { PianoRollView } from './components/PianoRollView';
import { VisionFlowStudio } from './components/VisionFlowStudio';
import { MixerPanel } from './components/MixerPanel';
import { LayAiModal } from './components/LayAiModal';
import { SonicRngModal } from './components/SonicRngModal';
import { AudioTransmuterModal } from './components/AudioTransmuterModal';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { ConfirmationModal } from './components/ConfirmationModal';
import { FullSaveZipModal } from './components/FullSaveZipModal';
import { GitHubSyncModal } from './components/GitHubSyncModal';
import { SettingsPage } from './components/SettingsPage';
import { loadPerformanceGenome, applyGenomeToEngine } from './utils/performanceOptimizer';

export default function App() {
  const [project, setProject] = useState<ProjectState>(() => {
    // Check localStorage for saved session
    const saved = localStorage.getItem('auravision_project');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.tracks)) {
          const defaultProj = createDefaultProject();
          return {
            ...defaultProj,
            ...parsed,
            visionFlow: {
              ...defaultProj.visionFlow,
              ...(parsed.visionFlow || {}),
            },
            tracks: parsed.tracks.map((t: any) => ({
              ...t,
              volume: typeof t.volume === 'number' ? t.volume : 0.85,
              pan: typeof t.pan === 'number' ? t.pan : 0,
              effects: {
                ...DEFAULT_TRACK_EFFECTS,
                ...(t.effects || {}),
              },
              audioStem: t.audioStem
                ? {
                    ...t.audioStem,
                    duration: typeof t.audioStem.duration === 'number' ? t.audioStem.duration : 0,
                    // If buffer is not a real AudioBuffer instance (e.g. from JSON), clear it to avoid crash
                    buffer: t.audioStem.buffer && typeof t.audioStem.buffer.duration === 'number' ? t.audioStem.buffer : undefined,
                  }
                : undefined,
            })),
          };
        }
      } catch (e) {
        console.warn('Failed to parse saved project from localStorage:', e);
      }
    }
    return createDefaultProject();
  });

  const [activeView, setActiveView] = useState<'timeline' | 'pianoroll' | 'video' | 'mixer' | 'settings'>('timeline');

  // Initialize engine with calibrated performance genome
  useEffect(() => {
    try {
      const genome = loadPerformanceGenome();
      applyGenomeToEngine(genome);
    } catch (e) {
      console.warn('Failed to apply initial performance genome:', e);
    }
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isBouncingWav, setIsBouncingWav] = useState(false);
  const [webMidiConnected, setWebMidiConnected] = useState(false);

  // Modals
  const [isLayAiOpen, setIsLayAiOpen] = useState(false);
  const [isSonicRngOpen, setIsSonicRngOpen] = useState(false);
  const [isTransmuterOpen, setIsTransmuterOpen] = useState(false);
  const [transmuterTab, setTransmuterTab] = useState<'audio-to-sf2' | 'audio-to-midi' | 'midi-sf2-to-audio' | 'midi-to-audio' | 'sf2-to-audio' | 'audio-to-stems'>('audio-to-sf2');

  // Confirmation & Export Modals
  const [isClearProjectOpen, setIsClearProjectOpen] = useState(false);
  const [isClearWorkspaceOpen, setIsClearWorkspaceOpen] = useState(false);
  const [isFullSaveZipOpen, setIsFullSaveZipOpen] = useState(false);
  const [isGitHubSyncOpen, setIsGitHubSyncOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // References for high-precision audio scheduler
  const projectRef = useRef(project);
  projectRef.current = project;

  const currentBeatRef = useRef(currentBeat);
  currentBeatRef.current = currentBeat;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const lastAudioTimeRef = useRef<number>(0);
  const scheduledNotesRef = useRef<Set<string>>(new Set());

  // Save to localStorage when project changes
  useEffect(() => {
    try {
      localStorage.setItem('auravision_project', JSON.stringify(project));
    } catch (e) {}
  }, [project]);

  // Connect Web MIDI callback
  useEffect(() => {
    synth.setMidiCallback((pitch, velocity, isNoteOn) => {
      setWebMidiConnected(true);
      const activeTrack =
        projectRef.current.tracks.find((t) => t.id === projectRef.current.selectedTrackId) ||
        projectRef.current.tracks[0];
      if (!activeTrack) return;

      if (isNoteOn) {
        synth.triggerLiveNoteOn(activeTrack, pitch, velocity);
        // If recording, record note into track!
        if (isPlayingRef.current && isRecording) {
          const beat = Math.round(currentBeatRef.current * 4) / 4;
          const newNote: Note = {
            id: `rec-${Date.now()}-${pitch}`,
            pitch,
            time: beat,
            duration: 0.5,
            velocity,
          };
          setProject((prev) => ({
            ...prev,
            tracks: prev.tracks.map((t) =>
              t.id === activeTrack.id ? { ...t, notes: [...t.notes, newNote] } : t
            ),
          }));
        }
      } else {
        synth.triggerLiveNoteOff(activeTrack, pitch);
      }
    });
  }, [isRecording]);

  // Master Volume sync
  useEffect(() => {
    synth.setMasterVolume(project.masterVolume);
  }, [project.masterVolume]);

  // High-precision Web Audio Lookahead Scheduler
  useEffect(() => {
    if (!isPlaying) return;

    synth.init();
    const audioCtx = synth.getAudioContext();
    if (!audioCtx) return;

    let timerId: any;
    const lookaheadMs = 25; // Interval between scheduling runs
    const scheduleWindowSec = 0.1; // Window into future to schedule notes

    const scheduleNotes = () => {
      if (!isPlayingRef.current) return;

      const bpm = projectRef.current.bpm;
      const beatSeconds = 60 / bpm;
      const totalBeats = projectRef.current.totalBars * 4;

      const now = audioCtx.currentTime;
      if (lastAudioTimeRef.current === 0) {
        lastAudioTimeRef.current = now;
      }

      const elapsedSec = now - lastAudioTimeRef.current;
      lastAudioTimeRef.current = now;

      // Advance beat
      let nextBeat = currentBeatRef.current + elapsedSec / beatSeconds;
      if (nextBeat >= totalBeats) {
        if (isLooping) {
          nextBeat = nextBeat % totalBeats;
          scheduledNotesRef.current.clear();
          synth.stopAllAudioStems();
          projectRef.current.tracks.forEach((track) => {
            if (!track.muted && track.audioStem && track.audioStem.buffer) {
              synth.scheduleAudioStem(track, now, bpm, 0);
            }
          });
        } else {
          setIsPlaying(false);
          setCurrentBeat(0);
          synth.stopAllAudioStems();
          return;
        }
      }

      setCurrentBeat(nextBeat);

      // Check all notes inside [nextBeat, nextBeat + scheduleWindowBeats]
      const scheduleWindowBeats = scheduleWindowSec / beatSeconds;
      const windowStart = nextBeat;
      const windowEnd = nextBeat + scheduleWindowBeats;

      // Metronome Click
      if (metronomeOn) {
        const floorBeat = Math.floor(windowEnd);
        const metroKey = `metro-${floorBeat}`;
        if (floorBeat >= windowStart && floorBeat < windowEnd && !scheduledNotesRef.current.has(metroKey)) {
          scheduledNotesRef.current.add(metroKey);
          const clickTime = now + (floorBeat - nextBeat) * beatSeconds;
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.frequency.setValueAtTime(floorBeat % 4 === 0 ? 1000 : 750, clickTime);
          g.gain.setValueAtTime(0.3, clickTime);
          g.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.04);
          osc.connect(g);
          g.connect(audioCtx.destination);
          osc.start(clickTime);
          osc.stop(clickTime + 0.05);
        }
      }

      // Schedule Track Notes
      projectRef.current.tracks.forEach((track) => {
        if (track.muted) return;
        track.notes.forEach((note) => {
          const noteKey = `${track.id}-${note.id}-${note.time}`;
          if (note.time >= windowStart && note.time < windowEnd && !scheduledNotesRef.current.has(noteKey)) {
            scheduledNotesRef.current.add(noteKey);
            const noteStartTime = now + (note.time - nextBeat) * beatSeconds;
            synth.scheduleNote(track, note, noteStartTime, bpm);
          }
        });
      });

      timerId = setTimeout(scheduleNotes, lookaheadMs);
    };

    // On playback start, schedule any audio stems from currentBeat
    projectRef.current.tracks.forEach((track) => {
      if (!track.muted && track.audioStem && track.audioStem.buffer) {
        synth.scheduleAudioStem(track, audioCtx.currentTime, projectRef.current.bpm, currentBeatRef.current);
      }
    });

    scheduleNotes();

    return () => {
      clearTimeout(timerId);
      lastAudioTimeRef.current = 0;
      synth.stopAllAudioStems();
    };
  }, [isPlaying, isLooping, metronomeOn]);

  // Spacebar toggle Play/Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => {
          if (!p) scheduledNotesRef.current.clear();
          else synth.stopAllAudioStems();
          return !p;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTogglePlay = () => {
    synth.init();
    setIsPlaying((p) => {
      if (!p) scheduledNotesRef.current.clear();
      else synth.stopAllAudioStems();
      return !p;
    });
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentBeat(0);
    scheduledNotesRef.current.clear();
    synth.stopAllAudioStems();
  };

  const handleSeek = (beat: number) => {
    setCurrentBeat(beat);
    scheduledNotesRef.current.clear();
    synth.stopAllAudioStems();
    if (isPlaying) {
      const audioCtx = synth.getAudioContext();
      if (audioCtx) {
        projectRef.current.tracks.forEach((track) => {
          if (!track.muted && track.audioStem && track.audioStem.buffer) {
            synth.scheduleAudioStem(track, audioCtx.currentTime, projectRef.current.bpm, beat);
          }
        });
      }
    }
  };

  // AuraOffline: Glitch-free WAV Bouncing
  const handleExportWav = async () => {
    setIsBouncingWav(true);
    try {
      const wavBlob = await synth.renderOffline(project);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title.replace(/\s+/g, '_')}_Master.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('WAV render failed:', err);
    } finally {
      setIsBouncingWav(false);
    }
  };

  // MIDI Export
  const handleExportMidi = () => {
    const midiBytes = exportToMidiFile(project.tracks, project.bpm, project.title);
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, '_')}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import MIDI
  const handleImportMidi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseMidiFile(buffer);

      if (parsed.tracks.length > 0) {
        setProject((prev) => {
          const newTracks = parsed.tracks.map((t, idx) => ({
            id: `imported-track-${Date.now()}-${idx}`,
            name: t.name || `Imported Track ${idx + 1}`,
            instrument: t.instrument || 'synth_lead',
            color: idx === 0 ? '#38bdf8' : idx === 1 ? '#f43f5e' : '#a855f7',
            volume: 0.8,
            pan: 0,
            muted: false,
            solo: false,
            armed: false,
            notes: t.notes || [],
            effects: {
              cutoff: 8000,
              resonance: 2.0,
              distortion: 0.0,
              delaySend: 0.2,
              delayTime: 0.35,
              reverbSend: 0.3,
              attack: 0.01,
              decay: 0.3,
              sustain: 0.7,
              release: 0.4,
            },
          }));

          // Calculate required totalBars to fit notes
          let maxBeat = 0;
          newTracks.forEach((tr) => {
            tr.notes.forEach((n) => {
              if (n.time + n.duration > maxBeat) maxBeat = n.time + n.duration;
            });
          });
          const calculatedBars = Math.ceil(maxBeat / 4);

          return {
            ...prev,
            title: parsed.title || prev.title,
            bpm: parsed.bpm || prev.bpm,
            totalBars: Math.max(prev.totalBars, calculatedBars),
            tracks: newTracks,
            selectedTrackId: newTracks[0].id,
          };
        });
      }
    } catch (err: any) {
      alert('Failed to parse MIDI file: ' + err.message);
    }
    e.target.value = '';
  };

  // Save / Load Project JSON
  const handleSaveProject = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(project, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${project.title.replace(/\s+/g, '_')}_AuraSession.json`;
    a.click();
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const loaded = JSON.parse(ev.target?.result as string);
        if (loaded.tracks && loaded.bpm) {
          setProject(loaded);
        }
      } catch (err) {
        alert('Invalid session JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // LayAI Apply Generated Project
  const handleApplyGeneratedProject = (generatedData: any) => {
    setProject((prev) => {
      const newTracks: Track[] = generatedData.tracks.map((t: any, idx: number) => ({
        id: `ai-track-${Date.now()}-${idx}`,
        name: t.name,
        instrument: t.instrument || 'synth_lead',
        color: ['#38bdf8', '#f43f5e', '#34d399', '#ec4899', '#fbbf24'][idx % 5],
        volume: t.volume ?? 0.8,
        pan: t.pan ?? 0,
        muted: false,
        solo: false,
        armed: false,
        notes: (t.notes || []).map((n: any, nIdx: number) => ({
          id: `ai-n-${idx}-${nIdx}`,
          pitch: n.pitch,
          time: n.time,
          duration: n.duration,
          velocity: n.velocity ?? 0.8,
        })),
        effects: {
          cutoff: 6000,
          resonance: 3.0,
          distortion: 0.05,
          delaySend: 0.25,
          delayTime: 0.35,
          reverbSend: 0.35,
          attack: 0.01,
          decay: 0.3,
          sustain: 0.7,
          release: 0.4,
        },
      }));

      return {
        ...prev,
        title: generatedData.title || prev.title,
        bpm: generatedData.bpm || prev.bpm,
        tracks: newTracks,
        selectedTrackId: newTracks[0]?.id || prev.selectedTrackId,
        visionFlow: {
          ...prev.visionFlow,
          theme: generatedData.visualFlowTheme || prev.visionFlow.theme,
          titleText: generatedData.title || prev.visionFlow.titleText,
        },
      };
    });
    setCurrentBeat(0);
    scheduledNotesRef.current.clear();
  };

  // Clear Project Handler
  const handleConfirmClearProject = () => {
    setIsPlaying(false);
    setCurrentBeat(0);
    scheduledNotesRef.current.clear();
    synth.triggerAllNotesOff();
    setProject((prev) => ({
      id: `proj-${Date.now()}`,
      title: 'Untitled Project',
      bpm: 120,
      timeSignature: [4, 4],
      totalBars: 4,
      selectedTrackId: 'track-init-1',
      masterVolume: 0.9,
      masterLimiter: true,
      visionFlow: prev.visionFlow,
      tracks: [
        {
          id: 'track-init-1',
          name: 'Audio/MIDI Track 1',
          instrument: 'synth_lead',
          color: '#38bdf8',
          volume: 0.85,
          pan: 0,
          muted: false,
          solo: false,
          armed: false,
          notes: [],
          effects: { ...DEFAULT_TRACK_EFFECTS },
        },
      ],
    }));
    setToastMessage('Project cleared. Empty canvas ready.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Clear Workspace Handler
  const handleConfirmClearWorkspace = () => {
    setIsPlaying(false);
    setCurrentBeat(0);
    scheduledNotesRef.current.clear();
    synth.triggerAllNotesOff();

    // 1. Purge localStorage session cache
    try {
      localStorage.removeItem('auravision_project');
    } catch (e) {}

    // 2. Unload custom SoundFonts & sample buffers
    sampleManager.clearInstruments();
    synth.clearCustomSamples();

    // 3. Reset view
    setActiveView('timeline');

    // 4. Restore factory fresh default project
    const fresh = createDefaultProject();
    setProject({
      ...fresh,
      id: `workspace-${Date.now()}`,
      title: 'New Session',
    });

    setToastMessage('Workspace completely cleared & reset to factory state.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const activeTrack =
    project.tracks.find((t) => t.id === project.selectedTrackId) || project.tracks[0];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Top Application Header */}
      <Header
        project={project}
        onUpdateProject={setProject}
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenLayAi={() => setIsLayAiOpen(true)}
        onOpenSonicRng={() => setIsSonicRngOpen(true)}
        onOpenAudioTransmuter={(tab) => {
          if (tab) setTransmuterTab(tab);
          setIsTransmuterOpen(true);
        }}
        onExportWav={handleExportWav}
        onExportMidi={handleExportMidi}
        onExportVideo={() => setActiveView('video')}
        onExportFullZip={() => setIsFullSaveZipOpen(true)}
        onOpenGitHubSync={() => setIsGitHubSyncOpen(true)}
        onClearProject={() => setIsClearProjectOpen(true)}
        onClearWorkspace={() => setIsClearWorkspaceOpen(true)}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onImportMidi={handleImportMidi}
        isBouncingWav={isBouncingWav}
        isVideoRecording={false}
        webMidiConnected={webMidiConnected}
      />

      {/* Transport Controls Bar */}
      <TransportBar
        project={project}
        onUpdateProject={setProject}
        isPlaying={isPlaying}
        isLooping={isLooping}
        isRecording={isRecording}
        currentBeat={currentBeat}
        metronomeOn={metronomeOn}
        onTogglePlay={handleTogglePlay}
        onStop={handleStop}
        onToggleLoop={() => setIsLooping((l) => !l)}
        onToggleRecord={() => setIsRecording((r) => !r)}
        onToggleMetronome={() => setMetronomeOn((m) => !m)}
        onSeek={handleSeek}
      />

      {/* Active Main Workspace View */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {activeView === 'timeline' && (
          <TimelineView
            project={project}
            onUpdateProject={setProject}
            currentBeat={currentBeat}
            onSeek={handleSeek}
            onSelectTrackForPianoRoll={(trackId) => {
              setProject((p) => ({ ...p, selectedTrackId: trackId }));
              setActiveView('pianoroll');
            }}
            onOpenTransmuter={(tab) => {
              if (tab) setTransmuterTab(tab);
              setIsTransmuterOpen(true);
            }}
          />
        )}

        {activeView === 'pianoroll' && (
          <PianoRollView
            project={project}
            onUpdateProject={setProject}
            currentBeat={currentBeat}
            onSeek={handleSeek}
          />
        )}

        {activeView === 'video' && (
          <VisionFlowStudio
            project={project}
            onUpdateProject={setProject}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
          />
        )}

        {activeView === 'mixer' && (
          <MixerPanel
            project={project}
            onUpdateProject={setProject}
            isPlaying={isPlaying}
          />
        )}

        {activeView === 'settings' && (
          <SettingsPage onBackToDaw={() => setActiveView('timeline')} />
        )}
      </main>

      {/* Bottom Virtual Piano Keyboard with live neon aura glow (visible on DAW views) */}
      {activeView !== 'settings' && (
        <VirtualKeyboard
          project={project}
          activeTrack={activeTrack}
          webMidiConnected={webMidiConnected}
        />
      )}

      {/* LayAI Generative Composer Modal */}
      <LayAiModal
        isOpen={isLayAiOpen}
        onClose={() => setIsLayAiOpen(false)}
        project={project}
        onApplyGeneratedProject={handleApplyGeneratedProject}
      />

      {/* Sonic RNG Sound Lab Modal */}
      <SonicRngModal
        isOpen={isSonicRngOpen}
        onClose={() => setIsSonicRngOpen(false)}
        project={project}
        onUpdateProject={setProject}
      />

      {/* Audio & SoundFont Transmuter Modal (Upload Audio, Audio to SF2, Audio to MIDI, MIDI to Audio, SF2 to Audio) */}
      <AudioTransmuterModal
        isOpen={isTransmuterOpen}
        onClose={() => setIsTransmuterOpen(false)}
        project={project}
        onUpdateProject={setProject}
        initialTab={transmuterTab}
      />

      {/* Clear Project Confirmation Dialog */}
      <ConfirmationModal
        isOpen={isClearProjectOpen}
        onClose={() => setIsClearProjectOpen(false)}
        onConfirm={handleConfirmClearProject}
        title="Clear Current Project?"
        description="This will clear all tracks and notes from the timeline, resetting to a blank project."
        confirmLabel="Yes, Clear Project"
        confirmVariant="warning"
        icon="rotate"
        details={[
          'All timeline notes, clips, and tracks will be cleared',
          'Tracks will be reset to a single clean audio/MIDI track',
          'Playback position and transport will return to Bar 1',
        ]}
      />

      {/* Clear Workspace Confirmation Dialog */}
      <ConfirmationModal
        isOpen={isClearWorkspaceOpen}
        onClose={() => setIsClearWorkspaceOpen(false)}
        onConfirm={handleConfirmClearWorkspace}
        title="Clear Entire Workspace?"
        description="This will wipe the active session, clear browser localStorage cache, unload custom SoundFonts, and restore factory state."
        confirmLabel="Yes, Wipe Workspace"
        confirmVariant="danger"
        icon="trash"
        details={[
          'All active tracks and timeline notes will be reset',
          'Browser localStorage cache (auravision_project) will be purged',
          'All custom SoundFont 2 (SF2) instruments and audio buffers will be unloaded',
          'Workspace layout will be restored to default pristine timeline',
        ]}
      />

      {/* Full Saving to DAW stems + midi + sf2 + masters ZIP Modal */}
      <FullSaveZipModal
        isOpen={isFullSaveZipOpen}
        onClose={() => setIsFullSaveZipOpen(false)}
        project={project}
      />

      {/* GitHub Repository Sync Modal */}
      <GitHubSyncModal
        isOpen={isGitHubSyncOpen}
        onClose={() => setIsGitHubSyncOpen(false)}
      />

      {/* Quick Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-14 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold shadow-2xl animate-in fade-in slide-in-from-bottom-2 select-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
