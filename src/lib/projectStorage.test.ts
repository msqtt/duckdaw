import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDuckDawPackage, loadDuckDawPackage } from './projectStorage';
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
      bpm: 125,
      timeSignature: [4, 4],
      isLooping: true,
      loopStart: 1,
      loopEnd: 5,
      metronomeOn: false,
      metronomeSound: 'tick',
      metronomeVolume: 0.7,
      metronomeSubdivisions: 4,
      tracks: [
        { id: 'track-1', name: 'Bass', type: 'midi', volume: 0.8, pan: 0 }
      ],
      clips: [
        { id: 'clip-1', trackId: 'track-1', start: 0, duration: 4, type: 'midi' },
        { id: 'clip-2', trackId: 'track-1', start: 4, duration: 4, type: 'audio', bufferUrl: 'blob:http://localhost/fake-audio-blob.wav' }
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
    expect(projectData.tracks.length).toBe(1);
    expect(projectData.tracks[0].name).toBe('Bass');
    expect(projectData.clips.length).toBe(2);
  });

  it('should load a valid DuckDAW package from Blob', async () => {
    const blob = await createDuckDawPackage('Load Test');
    
    const pkg = await loadDuckDawPackage(blob);
    
    expect(pkg.manifest.format).toBe('duckdaw');
    expect(pkg.manifest.name).toBe('Load Test');
    
    expect(pkg.project.bpm).toBe(125); // the compatible transformed project object
    expect(pkg.project.tracks.length).toBe(1);
    expect(pkg.project.clips.length).toBe(2);
  });

  it('should throw an error when loading an invalid package (no manifest)', async () => {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({ meta: { version: '1.1.0' } }));
    const badBlob = await zip.generateAsync({ type: 'blob' });

    await expect(loadDuckDawPackage(badBlob)).rejects.toThrow('missing manifest.json');
  });

  it('should throw an error when loading an invalid package (no project data)', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ format: 'duckdaw', version: '1.1.0' }));
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
    expect(manifest.resources!.samples![0]).toBe('clip-2.wav');
    
    // Check project data 
    const projectStr = await loadedZip.file('project.json')?.async('text');
    const projectData = JSON.parse(projectStr!);
    const audioClip = projectData.clips.find((c: any) => c.type === 'audio');
    expect(audioClip.bufferUrl).toBe('samples/clip-2.wav');
    
    // Check sample file in zip
    const sampleData = await loadedZip.file('samples/clip-2.wav')?.async('arraybuffer');
    expect(sampleData).toBeDefined();
    expect(sampleData?.byteLength).toBe(10);
  });
  
  it('should restore audio samples and create blob URLs when loading package', async () => {
    const blob = await createDuckDawPackage('Audio Load Test');
    const pkg = await loadDuckDawPackage(blob);
    
    const audioClip = pkg.project.clips.find((c: any) => c.id === 'clip-2');
    expect(audioClip).toBeDefined();
    expect(audioClip.bufferUrl).toBe('blob:mock-url'); // Since we mocked createObjectURL
    expect(pkg.samples.size).toBe(1);
  });
});
