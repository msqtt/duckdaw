import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDuckDawPackage, loadDuckDawPackage, validatePersistedProjectState } from './projectStorage';
import JSZip from 'jszip';

// Setup environment mocks for API used by storage
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.startsWith('blob:')) {
    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10))
    });
  }
  return Promise.reject(new Error('not found'));
}) as unknown as typeof fetch;

global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');

// Mock the DAW store
vi.mock('../store/dawStore', () => ({
  useDAWStore: {
    getState: () => ({
      projectId: 'project-stable-id',
      createdAt: '2026-08-17T00:00:00.000Z',
      projectName: 'Store Project',
      bpm: 125,
      timeSignature: [7, 8],
      isLooping: false,
      loopStart: 0,
      loopEnd: 9.5,
      metronomeOn: false,
      metronomeSound: 'woodblock',
      metronomeVolume: 0,
      metronomeSubdivisions: 2,
      masterVolume: 0,
      markers: [{ id: 'marker-1', name: 'Drop', position: 3.5, color: '#abcdef' }],
      arrangements: [
        { id: 'main', name: 'Main Arrangement' },
        { id: 'alternate', name: 'Alternate' }
      ],
      activeArrangementId: 'alternate',
      tracks: [
        { id: 'track-1', name: 'Bass', type: 'midi', volume: 0.8, pan: 0 },
        { id: 'track-2', name: 'Audio', type: 'audio', volume: 0.8, pan: 0 }
      ],
      clips: [
        { id: 'clip-1', trackId: 'track-1', arrangementId: 'main', start: 0, duration: 4, type: 'midi', notes: [] },
        { id: 'clip-2', trackId: 'track-2', arrangementId: 'main', start: 4, duration: 4, type: 'audio', bufferUrl: 'blob:http://localhost/fake-audio-blob.wav', mimeType: 'audio/webm' }
      ]
    })
  }
}));

describe('Project Storage (DuckDAW format)', () => {
  beforeEach(() => {
    // any setup
  });

  it('should create a valid DuckDAW package blob', async () => {
    const blob = await createDuckDawPackage('Test Project', 'A test project');
    expect(blob).toBeInstanceOf(Blob);

    // Verify ZIP contents
    const zip = new JSZip();
    const buffer = await blob.arrayBuffer();
    const loadedZip = await zip.loadAsync(buffer);
    
    const manifestStr = await loadedZip.file('manifest.json')?.async('text');
    expect(manifestStr).toBeDefined();
    
    const manifest = JSON.parse(manifestStr!);
    expect(manifest.format).toBe('duckdaw');
    expect(manifest.version).toBe('1.1.0');
    expect(manifest.name).toBe('Test Project');
    expect(manifest.description).toBe('A test project');

    const projectStr = await loadedZip.file('project.json')?.async('text');
    expect(projectStr).toBeDefined();
    
    const projectData = JSON.parse(projectStr!);
    expect(projectData.meta.version).toBe('1.1.0');
    expect(projectData.transport.bpm).toBe(125);
    expect(projectData.tracks.length).toBe(2);
    expect(projectData.tracks[0].name).toBe('Bass');
    expect(projectData.clips.length).toBe(2);
  });

  it('should load a valid DuckDAW package from Blob', async () => {
    const blob = await createDuckDawPackage('Load Test');
    
    const pkg = await loadDuckDawPackage(blob);
    
    expect(pkg.manifest.format).toBe('duckdaw');
    expect(pkg.manifest.name).toBe('Load Test');
    
    expect(pkg.project.bpm).toBe(125);
    expect(pkg.project.tracks.length).toBe(2);
    expect(pkg.project.clips.length).toBe(2);
  });

  it('should round-trip every persisted field and preserve falsy values', async () => {
    const blob = await createDuckDawPackage('Full State');
    const pkg = await loadDuckDawPackage(blob);

    expect(pkg.project).toMatchObject({
      projectName: 'Full State',
      bpm: 125,
      timeSignature: [7, 8],
      isLooping: false,
      loopStart: 0,
      loopEnd: 9.5,
      metronomeOn: false,
      metronomeVolume: 0,
      metronomeSound: 'woodblock',
      metronomeSubdivisions: 2,
      masterVolume: 0,
      markers: [{ id: 'marker-1', name: 'Drop', position: 3.5, color: '#abcdef' }],
      arrangements: [
        { id: 'main', name: 'Main Arrangement' },
        { id: 'alternate', name: 'Alternate' }
      ],
      activeArrangementId: 'alternate',
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const projectData = JSON.parse((await zip.file('project.json')!.async('text')));
    expect(projectData.master.volume).toBe(0);
  });

  it('should throw an error when loading an invalid package (no manifest)', async () => {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({ meta: { version: '1.1.0' } }));
    const badBlob = await zip.generateAsync({ type: 'blob' });

    await expect(loadDuckDawPackage(badBlob)).rejects.toThrow('missing manifest.json');
  });

  it('should throw an error when loading an invalid package (no project data)', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      format: 'duckdaw',
      version: '1.1.0',
      projectId: 'missing-project-data',
      name: 'Missing Project Data',
      bpm: 120,
      timeSignature: [4, 4],
      resources: { samples: [], presets: [] }
    }));
    const badBlob = await zip.generateAsync({ type: 'blob' });

    await expect(loadDuckDawPackage(badBlob)).rejects.toThrow('missing project.json');
  });

  it('should package audio sample blobs into the samples/ directory and update resources', async () => {
    const blob = await createDuckDawPackage('Audio Test', 'Testing audio packing');
    const zip = new JSZip();
    const buffer = await blob.arrayBuffer();
    const loadedZip = await zip.loadAsync(buffer);
    
    // Check manifest
    const manifestStr = await loadedZip.file('manifest.json')?.async('text');
    const manifest = JSON.parse(manifestStr!);
    expect(manifest.resources?.samples).toBeDefined();
    expect(manifest.resources!.samples!.length).toBe(1);
    expect(manifest.resources!.samples![0]).toBe('clip-2.webm');
    
    // Check project data 
    const projectStr = await loadedZip.file('project.json')?.async('text');
    const projectData = JSON.parse(projectStr!);
    const audioClip = projectData.clips.find((c: any) => c.type === 'audio');
    expect(audioClip.bufferUrl).toBe('samples/clip-2.webm');
    
    // Check sample file in zip
    const sampleData = await loadedZip.file('samples/clip-2.webm')?.async('arraybuffer');
    expect(sampleData).toBeDefined();
    expect(sampleData?.byteLength).toBe(10);
  });
  
  it('should restore audio samples and create blob URLs when loading package', async () => {
    const blob = await createDuckDawPackage('Audio Load Test');
    const pkg = await loadDuckDawPackage(blob);
    
    const audioClip = pkg.project.clips.find((c: any) => c.id === 'clip-2');
    expect(audioClip).toBeDefined();
    expect(audioClip.bufferUrl).toBe('blob:mock-url'); // Since we mocked createObjectURL
    expect(audioClip.mimeType).toBe('audio/webm');
    expect(pkg.samples.size).toBe(1);
  });
});

  it('keeps project identity stable across consecutive package saves', async () => {
    const first = await createDuckDawPackage('Stable Project');
    const second = await createDuckDawPackage('Stable Project');
    const firstZip = await JSZip.loadAsync(await first.arrayBuffer());
    const secondZip = await JSZip.loadAsync(await second.arrayBuffer());
    const firstManifest = JSON.parse(await firstZip.file('manifest.json')!.async('text'));
    const secondManifest = JSON.parse(await secondZip.file('manifest.json')!.async('text'));

    expect(firstManifest.projectId).toBe('project-stable-id');
    expect(secondManifest.projectId).toBe(firstManifest.projectId);
    expect(secondManifest.createdAt).toBe(firstManifest.createdAt);
  });

  it('fails the whole package when an audio resource cannot be read', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('blob unavailable'));

    await expect(createDuckDawPackage('Broken Audio')).rejects.toThrow(/audio|blob|resource/i);
  });

  it('rejects a package created by an unsupported future major version', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      format: 'duckdaw',
      version: '2.0.0',
      projectId: 'future-project',
      name: 'Future',
      bpm: 120,
      timeSignature: [4, 4],
      resources: { samples: [], presets: [] },
    }));
    zip.file('project.json', JSON.stringify({
      meta: { version: '2.0.0', projectId: 'future-project' },
      transport: { bpm: 120, timeSignature: [4, 4] },
      tracks: [], clips: [], markers: [],
      arrangements: [{ id: 'main', name: 'Main' }],
      activeArrangementId: 'main',
    }));

    await expect(loadDuckDawPackage(await zip.generateAsync({ type: 'blob' })))
      .rejects.toThrow(/version/i);
  });

  it('rejects mismatched manifest and project identities', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      format: 'duckdaw', version: '1.1.0', projectId: 'manifest-id',
      name: 'Mismatch', bpm: 120, timeSignature: [4, 4],
      resources: { samples: [], presets: [] },
    }));
    zip.file('project.json', JSON.stringify({
      meta: { version: '1.1.0', projectId: 'project-id' },
      transport: { bpm: 120, timeSignature: [4, 4] },
      tracks: [], clips: [], markers: [],
      arrangements: [{ id: 'main', name: 'Main' }],
      activeArrangementId: 'main',
    }));

    await expect(loadDuckDawPackage(await zip.generateAsync({ type: 'blob' })))
      .rejects.toThrow(/project.*id|identity|mismatch/i);
  });


it('rejects a package whose declared audio resource is missing', async () => {
  const blob = await createDuckDawPackage('Missing Audio');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  zip.remove('samples/clip-2.webm');

  await expect(loadDuckDawPackage(await zip.generateAsync({ type: 'blob' })))
    .rejects.toThrow(/resource.*missing|missing.*resource/i);
});

it('rejects invalid MIDI note values before replacing project state', async () => {
  const blob = await createDuckDawPackage('Invalid Note');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const project = JSON.parse(await zip.file('project.json')!.async('text'));
  project.clips.find((clip: any) => clip.type === 'midi').notes = [
    { id: 'bad-note', note: 'C4', start: -1, duration: 0, velocity: 2 },
  ];
  zip.file('project.json', JSON.stringify(project));

  await expect(loadDuckDawPackage(await zip.generateAsync({ type: 'blob' })))
    .rejects.toThrow(/MIDI note/i);
});


it('rejects invalid legacy JSON project references before loading', () => {
  expect(() => validatePersistedProjectState({
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    clips: [{
      id: 'orphan', trackId: 'missing', arrangementId: 'main', type: 'midi',
      start: 0, duration: 1, notes: [],
    }],
    markers: [],
    arrangements: [{ id: 'main', name: 'Main' }],
    activeArrangementId: 'main',
  })).toThrow(/clip|track reference/i);
});


it('accepts a minimal valid legacy JSON project with migration defaults', () => {
  expect(() => validatePersistedProjectState({
    bpm: 120,
    tracks: [{
      id: 'legacy-track', name: 'Legacy', type: 'midi', volume: 0.8, pan: 0,
      isMuted: false, isSolo: false, instrument: 'synth', color: '#fff', reverb: 0, delay: 0,
    }],
    clips: [{
      id: 'legacy-clip', trackId: 'legacy-track', arrangementId: 'main', type: 'midi',
      start: 0, duration: 4, notes: [],
    }],
  })).not.toThrow();
});