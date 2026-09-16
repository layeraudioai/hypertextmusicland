// SoundFont 2.04 Binary Container Generator
// Produces valid RIFF sfbk (.sf2) files from AudioBuffers for hardware/software DAWs

export function generateSf2Binary(
  sampleName: string,
  audioBuffer: AudioBuffer,
  rootPitch: number = 60, // MIDI C4
  presetName: string = 'AuraVision Custom SF2',
  fineTuneCents: number = 0
): Uint8Array {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const channelData = audioBuffer.getChannelData(0); // Take mono or left channel
  const sampleCount = channelData.length;

  // SoundFont 2 specification requires 46 zero-padding samples at the end of each sample
  const padLength = 46;
  const totalSampleCount = sampleCount + padLength;
  const pcmByteLength = totalSampleCount * 2; // 16-bit signed PCM

  // Prepare 16-bit PCM data
  const pcmBytes = new Int16Array(totalSampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    pcmBytes[i] = s < 0 ? s * 32768 : s * 32767;
  }
  // Remaining padLength is 0

  // Helper functions for binary building
  const chunks: Uint8Array[] = [];

  function stringToBytes(str: string, fixedLength?: number): Uint8Array {
    const len = fixedLength !== undefined ? fixedLength : str.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < Math.min(str.length, len); i++) {
      arr[i] = str.charCodeAt(i);
    }
    return arr;
  }

  function uint16Bytes(val: number): Uint8Array {
    const b = new Uint8Array(2);
    b[0] = val & 0xff;
    b[1] = (val >> 8) & 0xff;
    return b;
  }

  function int16Bytes(val: number): Uint8Array {
    const b = new Uint8Array(2);
    const v = val < 0 ? 0x10000 + val : val;
    b[0] = v & 0xff;
    b[1] = (v >> 8) & 0xff;
    return b;
  }

  function uint32Bytes(val: number): Uint8Array {
    const b = new Uint8Array(4);
    b[0] = val & 0xff;
    b[1] = (val >> 8) & 0xff;
    b[2] = (val >> 16) & 0xff;
    b[3] = (val >> 24) & 0xff;
    return b;
  }

  function createChunk(id: string, data: Uint8Array): Uint8Array {
    // RIFF chunks must be padded to an even number of bytes
    const pad = data.length % 2 !== 0 ? 1 : 0;
    const chunk = new Uint8Array(8 + data.length + pad);
    chunk.set(stringToBytes(id, 4), 0);
    chunk.set(uint32Bytes(data.length), 4);
    chunk.set(data, 8);
    return chunk;
  }

  function createListChunk(listType: string, subChunks: Uint8Array[]): Uint8Array {
    let subLength = 4; // for listType
    for (const sc of subChunks) {
      subLength += sc.length;
    }
    const pad = subLength % 2 !== 0 ? 1 : 0;
    const list = new Uint8Array(8 + subLength + pad);
    list.set(stringToBytes('LIST', 4), 0);
    list.set(uint32Bytes(subLength), 4);
    list.set(stringToBytes(listType, 4), 8);
    let offset = 12;
    for (const sc of subChunks) {
      list.set(sc, offset);
      offset += sc.length;
    }
    return list;
  }

  // --- 1. INFO LIST CHUNK ---
  // ifil (SF2 version 2.04)
  const ifilData = new Uint8Array(4);
  ifilData[0] = 2; // major
  ifilData[1] = 0;
  ifilData[2] = 4; // minor 0.4
  ifilData[3] = 0;
  const ifilChunk = createChunk('ifil', ifilData);

  // isng (Sound Engine)
  const isngChunk = createChunk('isng', stringToBytes('EMU8000\0'));

  // INAM (SoundFont Name)
  const inamChunk = createChunk('INAM', stringToBytes((presetName || 'AuraVision SF2') + '\0'));

  // ICRD (Creation date)
  const icrdChunk = createChunk('ICRD', stringToBytes(new Date().toISOString().slice(0, 10) + '\0'));

  const infoList = createListChunk('INFO', [ifilChunk, isngChunk, inamChunk, icrdChunk]);

  // --- 2. sdta LIST CHUNK (Waveform Data) ---
  const smplData = new Uint8Array(pcmBytes.buffer);
  const smplChunk = createChunk('smpl', smplData);
  const sdtaList = createListChunk('sdta', [smplChunk]);

  // --- 3. pdta LIST CHUNK (Presets, Instruments, Sample Headers) ---

  // A. phdr (Preset Header: 38 bytes each)
  // Preset 0 + Terminal Preset EOP
  const phdrData = new Uint8Array(38 * 2);
  // Preset 0:
  phdrData.set(stringToBytes((presetName || 'Preset 1').slice(0, 19) + '\0', 20), 0); // achPresetName
  phdrData.set(uint16Bytes(0), 20); // wPreset = 0
  phdrData.set(uint16Bytes(0), 22); // wBank = 0
  phdrData.set(uint16Bytes(0), 24); // wPresetBagNdx = 0
  phdrData.set(uint32Bytes(0), 26); // dwLibrary
  phdrData.set(uint32Bytes(0), 30); // dwGenre
  phdrData.set(uint32Bytes(0), 34); // dwMorphology
  // Terminal Preset:
  phdrData.set(stringToBytes('EOP\0', 20), 38);
  phdrData.set(uint16Bytes(255), 38 + 20);
  phdrData.set(uint16Bytes(255), 38 + 22);
  phdrData.set(uint16Bytes(1), 38 + 24); // wPresetBagNdx = 1
  const phdrChunk = createChunk('phdr', phdrData);

  // B. pbag (Preset Bag: 4 bytes each, 2 entries)
  const pbagData = new Uint8Array(4 * 2);
  pbagData.set(uint16Bytes(0), 0); // wGenNdx = 0
  pbagData.set(uint16Bytes(0), 2); // wModNdx = 0
  pbagData.set(uint16Bytes(1), 4); // Terminal wGenNdx = 1
  pbagData.set(uint16Bytes(0), 6); // Terminal wModNdx = 0
  const pbagChunk = createChunk('pbag', pbagData);

  // C. pmod (Preset Modulator: 10 bytes, terminal only)
  const pmodData = new Uint8Array(10);
  const pmodChunk = createChunk('pmod', pmodData);

  // D. pgen (Preset Generator: 4 bytes each)
  // Generator: instrument index = 0 (gen 41)
  const pgenData = new Uint8Array(4 * 2);
  pgenData.set(uint16Bytes(41), 0); // sfGenOper = instrument
  pgenData.set(uint16Bytes(0), 2); // genAmount = instrument 0
  // Terminal:
  pgenData.set(uint16Bytes(0), 4);
  pgenData.set(uint16Bytes(0), 6);
  const pgenChunk = createChunk('pgen', pgenData);

  // E. inst (Instrument Header: 22 bytes each)
  const instData = new Uint8Array(22 * 2);
  instData.set(stringToBytes((sampleName || 'Instrument 1').slice(0, 19) + '\0', 20), 0);
  instData.set(uint16Bytes(0), 20); // wInstBagNdx = 0
  // Terminal Instrument EOI:
  instData.set(stringToBytes('EOI\0', 20), 22);
  instData.set(uint16Bytes(1), 22 + 20); // wInstBagNdx = 1
  const instChunk = createChunk('inst', instData);

  // F. ibag (Instrument Bag: 4 bytes each, 2 entries)
  // Instrument 0 has 4 generators (indices 0..3), Terminal wGenNdx = 4
  const ibagData = new Uint8Array(4 * 2);
  ibagData.set(uint16Bytes(0), 0); // wGenNdx = 0
  ibagData.set(uint16Bytes(0), 2); // wModNdx = 0
  ibagData.set(uint16Bytes(4), 4); // Terminal wGenNdx = 4
  ibagData.set(uint16Bytes(0), 6);
  const ibagChunk = createChunk('ibag', ibagData);

  // G. imod (Instrument Modulator: 10 bytes, terminal only)
  const imodData = new Uint8Array(10);
  const imodChunk = createChunk('imod', imodData);

  // H. igen (Instrument Generator: 4 bytes each)
  // Gen 0: keyRange = 0 to 127 (sfGenOper = 43) -> lo=0, hi=127 -> 0x7F00
  // Gen 1: OverridingRootKey = clamped rootPitch (sfGenOper = 58)
  // Gen 2: fineTune = fineTuneCents (sfGenOper = 52)
  // Gen 3: SampleID = 0 (sfGenOper = 53, MUST be last generator in zone)
  // Terminal: sfGenOper = 0, genAmount = 0
  const clampedRoot = Math.max(0, Math.min(127, Math.round(rootPitch)));
  const clampedCents = Math.max(-50, Math.min(50, Math.round(fineTuneCents)));

  const igenData = new Uint8Array(4 * 5);
  // Gen 0: keyRange (43)
  igenData.set(uint16Bytes(43), 0);
  igenData[2] = 0;   // byLoKey = 0
  igenData[3] = 127; // byHiKey = 127

  // Gen 1: overridingRootKey (58)
  igenData.set(uint16Bytes(58), 4);
  igenData.set(int16Bytes(clampedRoot), 6);

  // Gen 2: fineTune (52)
  igenData.set(uint16Bytes(52), 8);
  igenData.set(int16Bytes(clampedCents), 10);

  // Gen 3: sampleID (53)
  igenData.set(uint16Bytes(53), 12);
  igenData.set(uint16Bytes(0), 14);

  // Terminal:
  igenData.set(uint16Bytes(0), 16);
  igenData.set(uint16Bytes(0), 18);
  const igenChunk = createChunk('igen', igenData);

  // I. shdr (Sample Header: 46 bytes each)
  const shdrData = new Uint8Array(46 * 2);
  // Sample 0:
  shdrData.set(stringToBytes((sampleName || 'Sample 1').slice(0, 19) + '\0', 20), 0);
  shdrData.set(uint32Bytes(0), 20); // dwStart = 0
  shdrData.set(uint32Bytes(sampleCount), 24); // dwEnd
  shdrData.set(uint32Bytes(0), 28); // dwStartloop
  shdrData.set(uint32Bytes(sampleCount), 32); // dwEndloop
  shdrData.set(uint32Bytes(sampleRate), 36); // dwSampleRate
  shdrData[40] = clampedRoot; // byOriginalPitch (0-127)
  shdrData[41] = clampedCents < 0 ? 256 + clampedCents : clampedCents; // chPitchCorrection (signed 8-bit)
  shdrData.set(uint16Bytes(0), 42); // wSampleLink
  shdrData.set(uint16Bytes(1), 44); // sfSampleType = 1 (monoSample)

  // Terminal Sample EOS:
  shdrData.set(stringToBytes('EOS\0', 20), 46);
  const shdrChunk = createChunk('shdr', shdrData);

  const pdtaList = createListChunk('pdta', [
    phdrChunk,
    pbagChunk,
    pmodChunk,
    pgenChunk,
    instChunk,
    ibagChunk,
    imodChunk,
    igenChunk,
    shdrChunk,
  ]);

  // Assemble full RIFF sfbk Container
  const totalSubLength = 4 + infoList.length + sdtaList.length + pdtaList.length;
  const sf2File = new Uint8Array(8 + totalSubLength);
  sf2File.set(stringToBytes('RIFF', 4), 0);
  sf2File.set(uint32Bytes(totalSubLength), 4);
  sf2File.set(stringToBytes('sfbk', 4), 8);

  let fileOffset = 12;
  sf2File.set(infoList, fileOffset);
  fileOffset += infoList.length;

  sf2File.set(sdtaList, fileOffset);
  fileOffset += sdtaList.length;

  sf2File.set(pdtaList, fileOffset);

  return sf2File;
}
