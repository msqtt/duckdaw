import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDuckDawPackage, loadDuckDawPackage } from './projectStorage';
import JSZip from 'jszip';

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
        { id: 'clip-1', trackId: 'track-1', start: 0, duration: 4 }
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
    expect(projectData.clips.length).toBe(1);
  });

  it('should load a valid DuckDAW package from Blob', async () => {
    const blob = await createDuckDawPackage('Load Test');
    
    const pkg = await loadDuckDawPackage(blob);
    
    expect(pkg.manifest.format).toBe('duckdaw');
    expect(pkg.manifest.name).toBe('Load Test');
    
    expect(pkg.project.bpm).toBe(125); // the compatible transformed project object
    expect(pkg.project.tracks.length).toBe(1);
    expect(pkg.project.clips.length).toBe(1);
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
});
