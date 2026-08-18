import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Batch C audio editing UI contracts', () => {
  it('exposes split, gain, four fade curves, and reverse from the clip menu', () => {
    const arrange = source('../components/DAW/ArrangeView.tsx');
    expect(arrange).toContain('Split here');
    expect(arrange).toContain('Clip gain');
    expect(arrange).toContain("['linear', 'Linear']");
    expect(arrange).toContain("['exponential', 'Exponential']");
    expect(arrange).toContain("['sCurve', 'S-curve']");
    expect(arrange).toContain("['logarithmic', 'Logarithmic']");
    expect(arrange).toContain("'Reverse'");
  });

  it('keeps trim handles visible on clip hover and mirrors reversed waveforms', () => {
    const item = source('../components/DAW/ClipItem.tsx');
    expect(item).toContain('group absolute h-20');
    expect(item.match(/cursor-ew-resize[^\"]*group-hover:opacity-100/g)?.length).toBe(2);
    expect(item).toContain("'scaleX(-1)'");
    expect(item).toContain('trimClipStart(clip.id, finalStart)');
    expect(item).toContain('trimClipEnd(clip.id, clip.start + finalDuration)');
  });

  it('registers the S split shortcut in the Arrange scope', () => {
    const shortcuts = source('./shortcutRegistry.ts');
    const app = source('../DAWApp.tsx');
    expect(shortcuts).toContain("id: 'split-clip', keys: 'S'");
    expect(app).toContain("e.code === 'KeyS'");
    expect(app).toContain('state.splitClipAtBeat');
  });
});
