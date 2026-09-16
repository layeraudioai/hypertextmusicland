import { Track, Note, InstrumentId } from '../types/daw';

export function parseMidiFile(arrayBuffer: ArrayBuffer): { tracks: Partial<Track>[]; bpm: number; title?: string } {
  const data = new Uint8Array(arrayBuffer);
  let pos = 0;

  function readString(length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      str += String.fromCharCode(data[pos++]);
    }
    return str;
  }

  function readUint16(): number {
    const val = (data[pos] << 8) | data[pos + 1];
    pos += 2;
    return val;
  }

  function readUint32(): number {
    const val = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
    pos += 4;
    return val;
  }

  function readVarInt(): number {
    let result = 0;
    while (pos < data.length) {
      const b = data[pos++];
      result = (result << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return result;
  }

  const header = readString(4);
  if (header !== 'MThd') {
    throw new Error('Not a valid MIDI file (missing MThd chunk)');
  }

  const headerLength = readUint32();
  const format = readUint16();
  const numTracks = readUint16();
  const timeDivision = readUint16(); // ticks per quarter note
  pos = 14 + (headerLength - 6);

  let detectedBpm = 120;
  let detectedTitle = 'Imported MIDI';
  const parsedTracks: Partial<Track>[] = [];

  for (let t = 0; t < numTracks && pos < data.length; t++) {
    const chunkType = readString(4);
    const chunkLength = readUint32();
    const trackEnd = pos + chunkLength;

    if (chunkType !== 'MTrk') {
      pos = trackEnd;
      continue;
    }

    let trackName = `Track ${t + 1}`;
    let instrumentId: InstrumentId = 'synth_lead';
    const notes: Note[] = [];
    const activeNotes = new Map<number, { pitch: number; startTick: number; velocity: number }>();
    let currentTick = 0;
    let runningStatus = 0;

    while (pos < trackEnd && pos < data.length) {
      const delta = readVarInt();
      currentTick += delta;

      let statusByte = data[pos];
      if (statusByte >= 0x80) {
        statusByte = data[pos++];
        runningStatus = statusByte;
      } else {
        statusByte = runningStatus;
      }

      const eventType = statusByte >> 4;
      const channel = statusByte & 0x0f;

      if (channel === 9) {
        instrumentId = 'drums';
      }

      if (statusByte === 0xff) {
        // Meta event
        const metaType = data[pos++];
        const metaLen = readVarInt();
        if (metaType === 0x03) {
          // Track Name
          let name = '';
          for (let i = 0; i < metaLen; i++) name += String.fromCharCode(data[pos + i]);
          trackName = name || trackName;
          if (t === 0) detectedTitle = trackName;
        } else if (metaType === 0x51 && metaLen === 3) {
          // Set Tempo (microseconds per quarter note)
          const usPerBeat = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
          detectedBpm = Math.round(60000000 / usPerBeat);
        }
        pos += metaLen;
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        // Sysex
        const len = readVarInt();
        pos += len;
      } else if (eventType === 0x9) {
        // Note On
        const pitch = data[pos++];
        const vel = data[pos++];
        const velocity = vel / 127;
        if (vel > 0) {
          activeNotes.set(pitch, { pitch, startTick: currentTick, velocity });
        } else {
          // Velocity 0 is Note Off
          const startNote = activeNotes.get(pitch);
          if (startNote) {
            const startBeat = startNote.startTick / (timeDivision || 480);
            const durationBeats = Math.max(0.125, (currentTick - startNote.startTick) / (timeDivision || 480));
            notes.push({
              id: `imported-${t}-${notes.length}`,
              pitch,
              time: Number(startBeat.toFixed(3)),
              duration: Number(durationBeats.toFixed(3)),
              velocity: Number(startNote.velocity.toFixed(2)),
            });
            activeNotes.delete(pitch);
          }
        }
      } else if (eventType === 0x8) {
        // Note Off
        const pitch = data[pos++];
        pos++; // velocity
        const startNote = activeNotes.get(pitch);
        if (startNote) {
          const startBeat = startNote.startTick / (timeDivision || 480);
          const durationBeats = Math.max(0.125, (currentTick - startNote.startTick) / (timeDivision || 480));
          notes.push({
            id: `imported-${t}-${notes.length}`,
            pitch,
            time: Number(startBeat.toFixed(3)),
            duration: Number(durationBeats.toFixed(3)),
            velocity: Number(startNote.velocity.toFixed(2)),
          });
          activeNotes.delete(pitch);
        }
      } else if (eventType === 0xc) {
        // Program Change (select instrument)
        const prog = data[pos++];
        if (prog >= 0 && prog <= 7) instrumentId = 'grand_piano';
        else if (prog >= 4 && prog <= 5) instrumentId = 'rhodes';
        else if (prog >= 32 && prog <= 39) instrumentId = 'analog_bass';
        else if (prog >= 88 && prog <= 95) instrumentId = 'ambient_pad';
        else if (prog >= 80 && prog <= 87) instrumentId = 'synth_lead';
      } else {
        // 2 byte parameter event (Controller, Pitch Bend, etc.)
        pos += 2;
      }
    }

    if (notes.length > 0) {
      parsedTracks.push({
        name: trackName,
        instrument: instrumentId,
        notes,
      });
    }
  }

  return {
    tracks: parsedTracks,
    bpm: detectedBpm,
    title: detectedTitle,
  };
}

export function exportToMidiFile(tracks: Track[], bpm: number, title: string = 'AuraDAW Song'): Uint8Array {
  const ticksPerBeat = 480;
  const trackChunks: Uint8Array[] = [];

  // Track 0: Tempo and Title Meta Track
  const tempoTrackEvents: number[] = [];
  // Delta 0, Meta 0x03 (Title)
  writeVarInt(tempoTrackEvents, 0);
  tempoTrackEvents.push(0xff, 0x03);
  writeVarInt(tempoTrackEvents, title.length);
  for (let i = 0; i < title.length; i++) tempoTrackEvents.push(title.charCodeAt(i));

  // Delta 0, Meta 0x51 (Tempo)
  const usPerBeat = Math.round(60000000 / bpm);
  writeVarInt(tempoTrackEvents, 0);
  tempoTrackEvents.push(0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff);

  // End of Track
  writeVarInt(tempoTrackEvents, 0);
  tempoTrackEvents.push(0xff, 0x2f, 0x00);
  trackChunks.push(createChunk('MTrk', new Uint8Array(tempoTrackEvents)));

  // Music Tracks
  tracks.forEach((track, trackIndex) => {
    const channel = track.instrument === 'drums' ? 9 : Math.min(15, trackIndex % 16);
    interface MidiEvent {
      tick: number;
      type: 'on' | 'off';
      pitch: number;
      velocity: number;
    }

    const events: MidiEvent[] = [];
    for (const note of track.notes) {
      const onTick = Math.round(note.time * ticksPerBeat);
      const offTick = Math.round((note.time + note.duration) * ticksPerBeat);
      events.push({ tick: onTick, type: 'on', pitch: note.pitch, velocity: Math.round(note.velocity * 127) });
      events.push({ tick: offTick, type: 'off', pitch: note.pitch, velocity: 0 });
    }

    events.sort((a, b) => a.tick - b.tick);

    const trackBytes: number[] = [];
    // Track Name Meta Event
    writeVarInt(trackBytes, 0);
    trackBytes.push(0xff, 0x03);
    writeVarInt(trackBytes, track.name.length);
    for (let i = 0; i < track.name.length; i++) trackBytes.push(track.name.charCodeAt(i));

    let lastTick = 0;
    for (const ev of events) {
      const delta = Math.max(0, ev.tick - lastTick);
      writeVarInt(trackBytes, delta);
      lastTick = ev.tick;

      if (ev.type === 'on') {
        trackBytes.push(0x90 | channel, ev.pitch, ev.velocity);
      } else {
        trackBytes.push(0x80 | channel, ev.pitch, 0);
      }
    }

    // End of track
    writeVarInt(trackBytes, 0);
    trackBytes.push(0xff, 0x2f, 0x00);
    trackChunks.push(createChunk('MTrk', new Uint8Array(trackBytes)));
  });

  // Assemble MThd Header
  const numTracks = trackChunks.length;
  const headerBytes = new Uint8Array(14);
  headerBytes.set([0x4d, 0x54, 0x68, 0x64]); // 'MThd'
  headerBytes[7] = 6; // chunk length = 6
  headerBytes[9] = 1; // format 1
  headerBytes[10] = (numTracks >> 8) & 0xff;
  headerBytes[11] = numTracks & 0xff;
  headerBytes[12] = (ticksPerBeat >> 8) & 0xff;
  headerBytes[13] = ticksPerBeat & 0xff;

  // Combine everything
  const totalLength = headerBytes.length + trackChunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(totalLength);
  out.set(headerBytes, 0);
  let writeOffset = headerBytes.length;
  for (const chunk of trackChunks) {
    out.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return out;
}

function writeVarInt(arr: number[], value: number) {
  let buffer = value & 0x7f;
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    arr.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + data.length);
  for (let i = 0; i < 4; i++) chunk[i] = type.charCodeAt(i);
  const len = data.length;
  chunk[4] = (len >> 24) & 0xff;
  chunk[5] = (len >> 16) & 0xff;
  chunk[6] = (len >> 8) & 0xff;
  chunk[7] = len & 0xff;
  chunk.set(data, 8);
  return chunk;
}
