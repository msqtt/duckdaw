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
