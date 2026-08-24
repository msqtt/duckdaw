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

test('E2E-01 new → edit → download save → reload package', async ({ page }, testInfo) => {
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');
  await addClip(page, 'midi');

  await openSettings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save File' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('project.duckdaw');
  const packagePath = testInfo.outputPath('project.duckdaw');
  await download.saveAs(packagePath);
  await page.getByRole('button', { name: 'Close settings' }).click();

  const addTrackMenu = page.getByText('Add Track', { exact: true });
  await addTrackMenu.click();
  await page.getByRole('option', { name: 'Audio Track' }).click();
  await expect(page.getByTestId('track-header')).toHaveCount(2);

  await openSettings(page);
  await page.locator('input[accept=".json,.duckdaw,.zip"]').setInputFiles(packagePath!);
  const discard = page.getByRole('dialog', { name: /Discard unsaved changes/i });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: /Discard/i }).click();
  await expect(page.getByTestId('track-header')).toHaveCount(1);
  await expect(page.getByTestId('clip-item')).toHaveCount(1);
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

test('PLUG-E2E-01 uses Track instrument selection and a right-side Inspector for ordered Mixer effects', async ({ page }) => {
  await openApp(page);
  await newProject(page);
  await addTrack(page, 'midi');

  const instrument = page.getByLabel('Instrument for Inst 1');
  await instrument.selectOption('duckdaw.instrument.pluck');
  await expect(instrument).toHaveValue('duckdaw.instrument.pluck');
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

test('E2E-03 unsupported FSA, Web MIDI, and microphone APIs use visible fallbacks', async ({ page }) => {
  await openApp(page);
  await openSettings(page);


  await expect(page.getByText('Web MIDI API not supported by this browser')).toBeVisible();
  await expect(page.getByText('getUserMedia not supported')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save File' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('project.duckdaw');
});

test('AUTO-E2E-02 creates control and plugin automation directly on the owning track curve', async ({ page }) => {
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
