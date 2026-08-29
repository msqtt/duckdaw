import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function installUnsupportedApiFallbacks(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: undefined });
    try {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    } catch {
      if (navigator.mediaDevices) {
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: undefined });
      }
    }
  });
}

async function installRecordingApiMocks(
  page: Page,
  options: {
    countInBars?: 0 | 1 | 2 | 4;
    rejectCapture?: boolean;
    midiAccessDelayMs?: number;
    midiAccessDelaysMs?: number[];
    audioAccessDelayMs?: number;
  } = {},
) {
  const config = {
    countInBars: options.countInBars ?? 0,
    rejectCapture: options.rejectCapture ?? false,
    midiAccessDelayMs: options.midiAccessDelayMs ?? 0,
    midiAccessDelaysMs: options.midiAccessDelaysMs ?? [],
    audioAccessDelayMs: options.audioAccessDelayMs ?? 0,
  };
  await page.addInitScript(({ countInBars, rejectCapture, midiAccessDelayMs, midiAccessDelaysMs, audioAccessDelayMs }) => {
    localStorage.setItem('duckdaw_countin_bars', String(countInBars));
    const mediaDevices = {
      getUserMedia: async () => {
        if (audioAccessDelayMs > 0) await new Promise(resolve => setTimeout(resolve, audioAccessDelayMs));
        if (rejectCapture) throw new DOMException('Permission denied', 'NotAllowedError');
        const AudioContextConstructor = window.AudioContext
          ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const context = new AudioContextConstructor();
        return context.createMediaStreamDestination().stream;
      },
      enumerateDevices: async () => [{
        deviceId: 'mock-audio-input',
        groupId: 'mock-group',
        kind: 'audioinput' as MediaDeviceKind,
        label: 'Mock Audio Input',
        toJSON: () => ({}),
      }],
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });

    const midiInput = { id: 'mock-midi-input', onmidimessage: null as ((event: { data: Uint8Array }) => void) | null };
    (window as unknown as { __mockMidiInput: typeof midiInput }).__mockMidiInput = midiInput;
    let midiRequestIndex = 0;
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: async () => {
        const delay = midiAccessDelaysMs[midiRequestIndex++] ?? midiAccessDelayMs;
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        return { inputs: new Map([['mock-midi-input', midiInput]]) };
      },
    });
    class MockMediaRecorder {
      state: RecordingState = 'inactive';
      mimeType = 'audio/webm;codecs=opus';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;

      constructor(_stream: MediaStream) {}

      start() {
        this.state = 'recording';
      }

      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        const data = new Blob(['mock recording'], { type: this.mimeType });
        this.ondataavailable?.({ data } as BlobEvent);
        queueMicrotask(() => this.onstop?.());
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: MockMediaRecorder });
  }, config);
}

async function openApp(page: Page) {
  await installUnsupportedApiFallbacks(page);
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
}

async function newProject(page: Page) {
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('option', { name: 'New Project (Reset)' }).click();
  const decision = page.getByRole('dialog', { name: /Discard unsaved changes/i });
  if (await decision.isVisible().catch(() => false)) await decision.getByRole('button', { name: /Discard/i }).click();
  await expect(page.getByTestId('empty-state-cta')).toBeVisible();
}

async function addTrack(page: Page, type: 'midi' | 'audio') {
  await page.getByRole('button', { name: type === 'midi' ? 'Add MIDI Track' : 'Add Audio Track' }).click();
  await expect(page.locator(`[data-testid="track-header"][data-track-type="${type}"]`)).toHaveCount(1);
}

async function addClip(page: Page, type: 'midi' | 'audio') {
  await page.locator(`[data-testid="track-lane"][data-track-type="${type}"]`).dblclick({ position: { x: 90, y: 45 } });
  await expect(page.locator(`[data-testid="clip-item"][data-clip-type="${type}"]`)).toHaveCount(1);
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
}

async function openProjectCenter(page: Page) {
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('option', { name: 'Project Center…' }).click();
  await expect(page.getByRole('dialog', { name: 'Project Center' })).toBeVisible();
}

test('PLUG-E2E-01 uses Track instrument selection and a right-side Inspector for ordered Mixer effects', async ({ page }) => {
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');

  const instrument = page.getByLabel('Instrument for Inst 1');
  await expect.poll(async () => {
    await instrument.selectOption('duckdaw.instrument.pluck');
    return instrument.inputValue();
  }, { timeout: 10_000 }).toBe('duckdaw.instrument.pluck');
  await page.getByRole('button', { name: 'Open instrument details for Inst 1' }).click();
  const inspector = page.getByRole('complementary', { name: 'Plugin Inspector' });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'Pluck' })).toBeVisible();
  await page.getByRole('button', { name: 'Close plugin inspector' }).click();

  await page.getByRole('button', { name: 'Toggle mixer' }).click();
  await expect(page.getByText('MIXER', { exact: true })).toBeVisible();
  const channel = page.getByTestId('mixer-channel');
  const addEffect = channel.getByLabel('Add effect to Inst 1');
  await addEffect.selectOption('duckdaw.effect.distortion');
  await addEffect.selectOption('duckdaw.effect.chorus');

  const chainItems = channel.getByTestId('plugin-chain-item');
  await expect(chainItems).toHaveCount(2);
  await expect(chainItems.nth(0)).toHaveAttribute('data-plugin-id', 'duckdaw.effect.distortion');
  await expect(chainItems.nth(1)).toHaveAttribute('data-plugin-id', 'duckdaw.effect.chorus');
  await expect(channel.getByLabel('Drive for duckdaw.effect.distortion')).toHaveCount(0);

  await channel.getByRole('button', { name: 'Open Distortion details on Inst 1' }).click();
  await expect(inspector.getByRole('heading', { name: 'Distortion' })).toBeVisible();
  await inspector.getByLabel('Drive for duckdaw.effect.distortion').fill('0.8');

  await channel.getByRole('button', { name: 'Move Chorus up on Inst 1' }).click();
  await expect(chainItems.nth(0)).toHaveAttribute('data-plugin-id', 'duckdaw.effect.chorus');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(chainItems.nth(0)).toHaveAttribute('data-plugin-id', 'duckdaw.effect.distortion');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(chainItems.nth(0)).toHaveAttribute('data-plugin-id', 'duckdaw.effect.chorus');
});



test('PLUG-E2E-02 keeps an existing MIDI schedule audible after instrument hot-swap', async ({ page }) => {
  test.setTimeout(75_000);
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');
  await addClip(page, 'midi');
  await page.getByTestId('clip-item').dblclick({ position: { x: 20, y: 50 } });
  const pianoGrid = page.getByTestId('piano-grid');
  for (const x of [35, 95, 155, 215, 275, 335]) await pianoGrid.click({ position: { x, y: 110 } });
  await expect(page.getByTestId('piano-note')).toHaveCount(6);
  const sustainedNote = page.getByTestId('piano-note').first();
  const noteResizeHandle = sustainedNote.locator('div').first();
  const resizeBox = await noteResizeHandle.boundingBox();
  if (!resizeBox) throw new Error('MIDI note resize handle is not measurable');
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 120, resizeBox.y + resizeBox.height / 2);
  await page.mouse.up();
  await expect.poll(async () => (await sustainedNote.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Toggle mixer' }).click();
  await page.getByRole('button', { name: 'Show mixer route' }).click();
  await page.getByLabel('New bus name').fill('Hot Swap Monitor');
  await page.getByRole('button', { name: 'Add Bus' }).click();
  const busInput = page.getByRole('button', { name: 'Hot Swap Monitor IN routing port' });
  const busId = (await busInput.getAttribute('data-routing-port'))!.split(':')[1];
  await page.getByRole('button', { name: 'Inst 1 OUT routing port' }).click();
  await busInput.click();

  const meter = page.locator(`[data-testid="bus-meter-level"][data-bus-id="${busId}"]`);
  await page.getByRole('button', { name: 'Toggle cycle mode' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => meter.evaluate(element => Number.parseFloat(element.style.height) || 0), {
    timeout: 20_000,
    intervals: [20, 50, 100],
  }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Stop' }).click();

  await page.getByLabel('Instrument for Inst 1').selectOption('duckdaw.instrument.bass');
  await meter.evaluate(element => { element.style.height = '0%'; });
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => meter.evaluate(element => Number.parseFloat(element.style.height) || 0), {
    timeout: 20_000,
    intervals: [20, 50, 100],
  }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Stop' }).click();
});

test('TRN-E2E-07 shows truthful Play/Pause glyphs and keeps idle Stop stable', async ({ page }) => {
  await openApp(page);
  const transportTime = page.getByTestId('transport-time');
  const initialTime = await transportTime.textContent();
  const play = page.getByRole('button', { name: 'Play' });
  await expect(play.locator('svg')).toHaveClass(/lucide-play/);
  await play.click();
  const pause = page.getByRole('button', { name: 'Pause' });
  await expect(pause.locator('svg')).toHaveClass(/lucide-pause/);
  await pause.click();
  await expect(page.getByRole('button', { name: 'Play' }).locator('svg')).toHaveClass(/lucide-play/);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(transportTime).toHaveText(initialTime ?? '0:00:000');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(transportTime).toHaveText(initialTime ?? '0:00:000');
});

test('WORKSPACE-E2E-01 resizes Inspector/Track, discloses Route, themes EQ, and centralizes Project', async ({ page }) => {
  test.setTimeout(45_000);
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');
  await page.getByRole('button', { name: 'Open instrument details for Inst 1' }).click();

  const inspector = page.getByRole('complementary', { name: 'Plugin Inspector' });
  const inspectorWidth = (await inspector.boundingBox())!.width;
  const inspectorResize = page.getByRole('separator', { name: 'Resize plugin inspector' });
  await inspectorResize.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await inspector.boundingBox())!.width).toBeGreaterThan(inspectorWidth);
  await page.getByRole('button', { name: 'Maximize plugin inspector' }).click();
  await expect(inspector).toHaveAttribute('data-maximized', 'true');
  await page.getByRole('button', { name: 'Restore plugin inspector' }).click();
  await page.getByRole('button', { name: 'Close plugin inspector' }).click();

  await page.getByRole('button', { name: 'Toggle mixer' }).click();
  await expect(page.getByRole('region', { name: 'Visual mixer routing' })).toHaveCount(0);
  const routeToggle = page.getByRole('button', { name: 'Show mixer route' });
  await expect(routeToggle).toHaveAttribute('aria-expanded', 'false');
  await routeToggle.click();
  await expect(page.getByRole('region', { name: 'Visual mixer routing' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand mixer route' }).click();
  await expect(page.getByRole('region', { name: 'Visual mixer routing' })).toHaveAttribute('data-expanded', 'true');
  await page.getByRole('button', { name: 'Restore mixer route' }).click();

  const channel = page.getByTestId('mixer-channel');
  const channelWidth = (await channel.boundingBox())!.width;
  const channelResize = page.getByRole('separator', { name: 'Resize mixer channel Inst 1' });
  await channelResize.focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await channel.boundingBox())!.width).toBeGreaterThan(channelWidth);

  await channel.getByLabel('Add effect to Inst 1').selectOption('duckdaw.effect.parametric-eq');
  await expect(inspector.getByRole('heading', { name: 'Parametric EQ' })).toBeVisible();
  const eqBackground = inspector.getByTestId('eq-background');
  await openSettings(page);
  await page.getByTitle('Dark Theme').click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  const darkFill = await eqBackground.evaluate(element => getComputedStyle(element).fill);
  await openSettings(page);
  await page.getByTitle('Light Theme').click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect.poll(() => eqBackground.evaluate(element => getComputedStyle(element).fill)).not.toBe(darkFill);
  await page.getByRole('button', { name: 'Close plugin inspector' }).click();

  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('option', { name: 'Project Center…' }).click();
  const projectCenter = page.getByRole('dialog', { name: 'Project Center' });
  await expect(projectCenter.getByRole('heading', { name: 'New Project' })).toBeVisible();
  await expect(projectCenter.getByRole('heading', { name: 'Recent Projects' })).toBeVisible();
  await expect(projectCenter.getByRole('heading', { name: 'Local Project' })).toBeVisible();
  await expect(projectCenter.getByRole('heading', { name: 'GitHub Sync' })).toBeVisible();
  await projectCenter.getByRole('button', { name: 'Close project center' }).click();

  await expect(page.getByRole('button', { name: 'Arrangement' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Project timeline' })).toBeVisible();
  await openSettings(page);
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByRole('heading', { name: 'Local Project' })).toHaveCount(0);
  await expect(settings.getByRole('heading', { name: 'GitHub Sync' })).toHaveCount(0);
});
test('E2E-01 new → edit → download save → reload package', async ({ page }, testInfo) => {
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');
  await addClip(page, 'midi');

  await openProjectCenter(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save File' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('project.duckdaw');
  const packagePath = testInfo.outputPath('project.duckdaw');
  await download.saveAs(packagePath);
  await page.getByRole('button', { name: 'Close project center' }).click();

  const addTrackMenu = page.getByText('Add Track', { exact: true });
  await addTrackMenu.click();
  await page.getByRole('option', { name: 'Audio Track' }).click();
  await expect(page.getByTestId('track-header')).toHaveCount(2);

  await openProjectCenter(page);
  await page.locator('input[accept=".json,.duckdaw,.zip"]').setInputFiles(packagePath!);
  const discard = page.getByRole('dialog', { name: /Discard unsaved changes/i });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: /Discard/i }).click();
  await expect(page.getByTestId('track-header')).toHaveCount(1);
  await expect(page.getByTestId('clip-item')).toHaveCount(1);
});

test('PROJ-E2E-09 stops runtime playback before replacing the active Project', async ({ page }) => {
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');

  const transportTime = page.getByTestId('transport-time');
  const initialTime = await transportTime.textContent();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => transportTime.textContent()).not.toBe(initialTime);
  await newProject(page);

  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect.poll(() => transportTime.textContent()).toBe(initialTime);
});

test('PROJ-E2E-09 cancels active MIDI count-in before replacing the Project', async ({ page }) => {
  await installRecordingApiMocks(page, { countInBars: 4 });
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  await newProject(page);
  await addTrack(page, 'midi');

  const transportTime = page.getByTestId('transport-time');
  const initialTime = await transportTime.textContent();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => transportTime.textContent()).not.toBe(initialTime);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Start MIDI recording' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Count-in:/ })).toBeVisible();
  await newProject(page);

  await expect(page.getByRole('status').filter({ hasText: /^Count-in:/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(transportTime).toHaveText(initialTime ?? '0:00:000');
  await expect(page.getByTestId('empty-state-cta')).toBeVisible();
  await page.waitForTimeout(1_200);
  await expect(transportTime).toHaveText(initialTime ?? '0:00:000');
  await expect(page.getByTestId('clip-item')).toHaveCount(0);
});

test('E2E-02 undo/redo and Audio reverse are single browser-visible transactions', async ({ page }) => {
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'audio');
  await addClip(page, 'audio');
  const clip = page.getByTestId('clip-item');
  await expect(clip).toHaveAttribute('data-reversed', 'false');

  await clip.click({ button: 'right' });
  await page.getByRole('button', { name: 'Reverse', exact: true }).click();
  await expect(clip).toHaveAttribute('data-reversed', 'true');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(clip).toHaveAttribute('data-reversed', 'false');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(clip).toHaveAttribute('data-reversed', 'true');
});

test('E2E-02 Piano Roll note transpose changes the selected note and can be undone', async ({ page }) => {
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');
  await addClip(page, 'midi');
  const clip = page.getByTestId('clip-item');
  await clip.dblclick({ position: { x: 20, y: 60 } });
  const grid = page.getByTestId('piano-grid');
  await expect(grid).toBeVisible();
  await grid.click({ position: { x: 120, y: 110 } });
  const note = page.getByTestId('piano-note');
  await expect(note).toHaveCount(1);
  await note.click();
  const originalPitch = await note.getAttribute('data-note');

  await page.getByRole('button', { name: 'Transpose selected notes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Transpose notes' });
  await dialog.getByRole('textbox', { name: 'Semitones' }).fill('2');
  await dialog.getByRole('button', { name: 'Transpose', exact: true }).click();
  await expect(note).not.toHaveAttribute('data-note', originalPitch!);
  await page.keyboard.press('Control+z');
  await expect(note).toHaveAttribute('data-note', originalPitch!);
});

test('E2E-02 dirty edits create a restorable recovery snapshot', async ({ page }) => {
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');
  await expect(page.getByTestId('track-header')).toHaveCount(1);
  await page.waitForTimeout(2_500);
  page.once('dialog', dialog => void dialog.accept());
  await page.reload();
  const recovery = page.getByRole('dialog', { name: 'Recovery snapshot found' });
  await expect(recovery).toBeVisible();
  await recovery.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByTestId('track-header')).toHaveCount(1);
});

test('MIX-E2E-03 patches visual ports, creates a Bus channel, and edits Spectrum EQ points', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const AudioContextConstructor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const originalCreateAnalyser = AudioContextConstructor.prototype.createAnalyser;
    AudioContextConstructor.prototype.createAnalyser = function createFailingAnalyser() {
      const analyser = originalCreateAnalyser.call(this);
      analyser.getFloatFrequencyData = () => { throw new Error('Analyser unavailable'); };
      return analyser;
    };
  });
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');
  await addClip(page, 'midi');
  const clip = page.getByTestId('clip-item');
  await clip.dblclick({ position: { x: 20, y: 60 } });
  const pianoGrid = page.getByTestId('piano-grid');
  await expect(pianoGrid).toBeVisible();
  for (const x of [40, 120, 200, 280]) {
    await pianoGrid.click({ position: { x, y: 110 } });
  }
  await expect(page.getByTestId('piano-note')).toHaveCount(4);
  await page.getByRole('button', { name: 'Toggle mixer' }).click();
  await page.getByRole('button', { name: 'Show mixer route' }).click();
  await page.getByRole('button', { name: 'Full screen mixer' }).click();
  await page.getByRole('button', { name: 'Zoom in routing' }).click();
  await expect(page.getByText('110%', { exact: true })).toBeVisible();

  await page.getByLabel('New bus name').fill('Music Group');
  await page.getByRole('button', { name: 'Add Bus' }).click();
  const busInput = page.getByRole('button', { name: 'Music Group IN routing port' });
  await expect(busInput).toBeVisible();
  const busPort = await busInput.getAttribute('data-routing-port');
  const busId = busPort!.split(':')[1];

  await page.getByRole('button', { name: 'Inst 1 OUT routing port' }).click();
  await busInput.click();
  const trackOutput = page.locator('[data-routing-edge^="output:track:"]');
  await expect(trackOutput).toHaveAttribute('data-routing-edge', new RegExp(`:${busId}$`));
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(trackOutput).toHaveAttribute('data-routing-edge', /:master$/);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(trackOutput).toHaveAttribute('data-routing-edge', new RegExp(`:${busId}$`));

  await page.getByRole('button', { name: 'Solo Inst 1' }).click();
  await page.getByRole('button', { name: 'Toggle cycle mode' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  const busMeter = page.locator(`[data-testid="bus-meter-level"][data-bus-id="${busId}"]`);
  await expect.poll(async () => busMeter.evaluate(element => Number.parseFloat(element.style.height) || 0), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Stop' }).click();

  const prePort = page.getByRole('button', { name: 'Inst 1 PRE routing port' });
  await prePort.focus();
  await page.keyboard.press('Enter');
  const masterInput = page.getByRole('button', { name: 'Master IN routing port' });
  await masterInput.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Delete pre send Inst 1 to Master/ })).toBeVisible();
  await expect(page.locator('[data-routing-edge*="pre:master"]')).toHaveCount(1);

  const busChannel = page.locator(`[data-testid="bus-mixer-channel"][data-bus-id="${busId}"]`);
  await expect(busChannel).toBeVisible();
  await busChannel.getByLabel('Add effect to Music Group').selectOption('duckdaw.effect.parametric-eq');
  const inspector = page.getByRole('complementary', { name: 'Plugin Inspector' });
  await expect(inspector.getByRole('heading', { name: 'Parametric EQ' })).toBeVisible();
  const eq = inspector.getByTestId('parametric-eq-editor');
  await expect(eq.getByTestId('eq-response-path')).toHaveAttribute('d', /^M /);
  await expect(eq.getByTestId('eq-spectrum-path')).toHaveCount(0);
  const graph = eq.getByRole('img', { name: /EQ frequency response graph/ });
  await expect(eq.getByRole('button', { name: /EQ band/ })).toHaveCount(3);
  await graph.focus();
  await page.keyboard.press('Enter');
  await expect(eq.getByRole('button', { name: /EQ band/ })).toHaveCount(4);

  const point = eq.getByRole('button', { name: /EQ band 4/ });
  const originalLabel = await point.getAttribute('aria-label');
  const box = await point.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 45, box!.y + 35, { steps: 3 });
  await page.mouse.up();
  await expect(point).not.toHaveAttribute('aria-label', originalLabel!);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(point).toHaveAttribute('aria-label', originalLabel!);

  for (let index = 0; index < 4; index += 1) {
    await graph.click({ position: { x: 70 + index * 40, y: 90 + index * 8 } });
  }
  await expect(eq.getByRole('button', { name: /EQ band/ })).toHaveCount(8);
  await graph.click({ position: { x: 240, y: 100 } });
  await expect(eq.getByText(/eight-band limit/i)).toBeVisible();
  await eq.getByRole('button', { name: 'Delete point' }).click();
  await expect(eq.getByRole('button', { name: /EQ band/ })).toHaveCount(7);
});

test('REC-E2E-05 records an Audio Track while playback continues', async ({ page }) => {
  await installRecordingApiMocks(page);
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  await newProject(page);
  await addTrack(page, 'midi');
  await addClip(page, 'midi');
  await page.getByText('Add Track', { exact: true }).click();
  await page.getByRole('option', { name: 'Audio Track' }).click();
  await expect(page.locator('[data-testid="track-header"][data-track-type="audio"]')).toHaveCount(1);

  const transportTime = page.getByTestId('transport-time');
  const timeBeforeRecording = await transportTime.textContent();
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop microphone recording' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => transportTime.textContent()).not.toBe(timeBeforeRecording);

  const timeWhileRecording = await transportTime.textContent();
  await page.getByRole('button', { name: 'Stop microphone recording' }).click();
  await expect(page.getByRole('button', { name: 'Start microphone recording' })).toBeVisible();
  await expect(page.locator('[data-testid="clip-item"][data-clip-type="audio"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => transportTime.textContent()).not.toBe(timeWhileRecording);
});

test('REC-E2E-05 rolls back count-in playback when microphone permission fails', async ({ page }) => {
  await installRecordingApiMocks(page, { countInBars: 1, rejectCapture: true });
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  await newProject(page);
  await addTrack(page, 'audio');

  const transportTime = page.getByTestId('transport-time');
  const initialTime = await transportTime.textContent();
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Count-in:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByText(/Microphone access failed:/)).toBeVisible({ timeout: 10_000 });

  await expect(page.getByRole('button', { name: 'Start microphone recording' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect.poll(() => transportTime.textContent()).toBe(initialTime);
  await expect(page.locator('[data-testid="clip-item"][data-clip-type="audio"]')).toHaveCount(0);
});

test('REC-E2E-05 cancelling count-in restores stopped playback and prevents delayed capture', async ({ page }) => {
  await installRecordingApiMocks(page, { countInBars: 4 });
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  await newProject(page);
  await addTrack(page, 'audio');

  const transportTime = page.getByTestId('transport-time');
  const initialTime = await transportTime.textContent();
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Count-in:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => transportTime.textContent()).not.toBe(initialTime);
  await page.getByRole('button', { name: 'Stop microphone recording' }).click();

  await expect(page.getByRole('status').filter({ hasText: /^Count-in:/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect.poll(() => transportTime.textContent()).toBe(initialTime);
  await page.waitForTimeout(2_200);
  await expect(page.getByRole('button', { name: 'Start microphone recording' })).toBeVisible();
  await expect(page.locator('[data-testid="clip-item"][data-clip-type="audio"]')).toHaveCount(0);
});

test('REC-E2E-05 cancelling MIDI count-in restores stopped playback and prevents delayed capture', async ({ page }) => {
  await installRecordingApiMocks(page, { countInBars: 4 });
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  await newProject(page);
  await addTrack(page, 'midi');

  const transportTime = page.getByTestId('transport-time');
  const initialTime = await transportTime.textContent();
  await page.getByRole('button', { name: 'Start MIDI recording' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Count-in:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(() => transportTime.textContent()).not.toBe(initialTime);
  await page.getByRole('button', { name: 'Stop MIDI recording' }).click();

  await expect(page.getByRole('status').filter({ hasText: /^Count-in:/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect.poll(() => transportTime.textContent()).toBe(initialTime);
  await page.waitForTimeout(2_200);
  await expect(page.getByRole('button', { name: 'Start MIDI recording' })).toBeVisible();
  await expect(page.getByTestId('clip-item')).toHaveCount(0);
});

test('REC-E2E-05 ignores a late Web MIDI connection after recording is cancelled', async ({ page }) => {
  await installRecordingApiMocks(page, { midiAccessDelayMs: 800 });
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  await newProject(page);
  await addTrack(page, 'midi');

  await page.getByRole('button', { name: 'Start MIDI recording' }).click();
  await page.getByRole('button', { name: 'Stop MIDI recording' }).click();
  await page.waitForTimeout(1_200);

  await expect(page.getByRole('button', { name: 'Start MIDI recording' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByTestId('clip-item')).toHaveCount(0);
});

test('PROJ-E2E-09 keeps a re-armed MIDI input when the old permission resolves last', async ({ page }) => {
  await installRecordingApiMocks(page, { midiAccessDelaysMs: [1_000, 100] });
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  await newProject(page);
  await addTrack(page, 'midi');

  await page.getByRole('button', { name: 'Start MIDI recording' }).click();
  await newProject(page);
  await addTrack(page, 'midi');
  await page.getByRole('button', { name: 'Start MIDI recording' }).click();
  await page.waitForTimeout(1_200);
  await page.evaluate(() => {
    const input = (window as unknown as {
      __mockMidiInput: { onmidimessage: ((event: { data: Uint8Array }) => void) | null };
    }).__mockMidiInput;
    if (!input.onmidimessage) throw new Error('New Project MIDI handler was disconnected');
    input.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const input = (window as unknown as {
      __mockMidiInput: { onmidimessage: ((event: { data: Uint8Array }) => void) | null };
    }).__mockMidiInput;
    input.onmidimessage?.({ data: new Uint8Array([0x80, 60, 0]) });
  });
  await page.getByRole('button', { name: 'Stop MIDI recording' }).click();

  await expect(page.locator('[data-testid="clip-item"][data-clip-type="midi"]')).toHaveCount(1);
});

test('PROJ-E2E-09 keeps a re-armed microphone recording owned by the new Project', async ({ page }) => {
  await installRecordingApiMocks(page, { audioAccessDelayMs: 800 });
  await page.goto('/');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  await newProject(page);
  await addTrack(page, 'audio');

  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await newProject(page);
  await addTrack(page, 'audio');
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await page.waitForTimeout(1_200);
  await expect(page.getByRole('button', { name: 'Stop microphone recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop microphone recording' }).click();

  await expect(page.locator('[data-testid="clip-item"][data-clip-type="audio"]')).toHaveCount(1);
});

test('E2E-03 unsupported FSA, Web MIDI, and microphone APIs use visible fallbacks', async ({ page }) => {
  await openApp(page);
  await openSettings(page);


  await expect(page.getByText('Web MIDI API not supported by this browser')).toBeVisible();
  await expect(page.getByText('getUserMedia not supported')).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await openProjectCenter(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save File' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('project.duckdaw');
});

test('AUTO-E2E-02 creates control and plugin automation directly on the owning track curve', async ({ page }) => {
  test.setTimeout(60_000);
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');
  await page.getByTestId('track-lane').dblclick({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId('clip-item')).toHaveCount(1);

  await page.getByRole('button', { name: 'Create automation for Volume on Inst 1' }).click();
  const volumeCurve = page.getByRole('region', { name: 'Automation curve for Volume on Inst 1' });
  await expect(volumeCurve).toBeVisible();
  await expect(volumeCurve.getByRole('button', { name: /Automation point.*beat 0/ })).toHaveCount(1);
  await volumeCurve.dblclick({ position: { x: 120, y: 25 } });
  await expect(volumeCurve.getByRole('button', { name: /Automation point/ })).toHaveCount(2);
  const movedPoint = volumeCurve.getByRole('button', { name: /Automation point/ }).nth(1);
  const originalPointLabel = await movedPoint.getAttribute('aria-label');
  const pointBox = await movedPoint.boundingBox();
  expect(pointBox).not.toBeNull();
  await page.mouse.move(pointBox!.x + pointBox!.width / 2, pointBox!.y + pointBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(pointBox!.x + 60, pointBox!.y + 30, { steps: 3 });
  await page.mouse.up();
  await expect(movedPoint).not.toHaveAttribute('aria-label', originalPointLabel!);
  const draggedPointLabel = await movedPoint.getAttribute('aria-label');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(movedPoint).toHaveAttribute('aria-label', originalPointLabel!);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(movedPoint).toHaveAttribute('aria-label', draggedPointLabel!);

  await page.getByRole('button', { name: 'Open instrument details for Inst 1' }).click();
  const inspector = page.getByRole('complementary', { name: 'Plugin Inspector' });
  await inspector.getByRole('button', { name: 'Create automation for Attack on Inst 1' }).click();
  await expect(page.getByRole('region', { name: 'Automation curve for Attack on Inst 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Toggle mixer' }).click();
  const channel = page.getByTestId('mixer-channel');
  await channel.getByLabel('Add effect to Inst 1').selectOption('duckdaw.effect.distortion');
  await inspector.getByRole('button', { name: 'Create automation for Drive on Inst 1' }).click();
  await expect(page.getByRole('region', { name: 'Automation curve for Drive on Inst 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('region', { name: 'Automation curve for Attack on Inst 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('region', { name: 'Automation curve for Drive on Inst 1' })).toBeVisible();

  const audioDownload = page.waitForEvent('download').then(download => ({ kind: 'download' as const, name: download.suggestedFilename() }));
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Start Export' }).click();
  const exportFailed = page.getByText(/Export failed:/).textContent().then(message => ({ kind: 'error' as const, message }));
  const exportResult = await Promise.race([audioDownload, exportFailed]);
  expect(exportResult).toEqual({ kind: 'download', name: expect.stringMatching(/\.wav$/) });
});

test('@smoke app metadata, SPA fallback, and serious accessibility gate', async ({ page }) => {
  await installUnsupportedApiFallbacks(page);
  await page.goto('/e2e/spa-fallback');
  await expect(page.getByText('DuckDAW', { exact: false }).first()).toBeVisible();
  const expectedCommit = process.env.EXPECTED_COMMIT;
  const expectedContext = process.env.EXPECTED_CONTEXT;
  const expectedBranch = process.env.EXPECTED_BRANCH;
  if (expectedCommit) await expect(page.locator('html')).toHaveAttribute('data-duckdaw-commit', expectedCommit);
  if (expectedContext) await expect(page.locator('html')).toHaveAttribute('data-duckdaw-context', expectedContext);
  if (expectedBranch) await expect(page.locator('html')).toHaveAttribute('data-duckdaw-branch', expectedBranch);

  if (process.env.PLAYWRIGHT_BASE_URL) {
    for (const path of ['/', '/e2e/spa-fallback']) {
      const response = await page.request.get(path);
      expect(response.ok(), `${path} should return a successful HTML response`).toBe(true);
      const headers = response.headers();
      expect(headers['cache-control'], `${path} must not be cached`).toContain('no-store');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
    }
  }

  const noticesResponse = await page.request.get('/THIRD_PARTY_NOTICES.txt');
  expect(noticesResponse.ok()).toBe(true);
  expect(await noticesResponse.text()).toContain('@ffmpeg/core 0.12.10');
  const licenseResponse = await page.request.get('/licenses/GPL-2.0.txt');
  expect(licenseResponse.ok()).toBe(true);
  expect(await licenseResponse.text()).toContain('GNU GENERAL PUBLIC LICENSE');

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  expect(blocking, blocking.map(item => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
});
