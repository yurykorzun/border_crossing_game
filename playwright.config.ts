import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Phone-size browser checks against the production build served by `vite preview`.
// The build uses base '/border_crossing_game/' (as on GitHub Pages). `vite preview` runs
// as command 'serve', so vite.config.ts gives it base '/'; --base puts it back.
const PORT = 4173;
const BASE = '/border_crossing_game/';
// scripts/verify sets E2E_PREBUILT=1 because its build step has just built dist/, so the
// gate builds once. Run on its own (npm run e2e), the webServer builds first. Prebuilt
// still builds when dist/ is older than what the build reads, because a gate rerun skips
// the build step and a failed build leaves the last good dist/ behind.
const INPUTS = ['src', 'public', 'index.html', 'vite.config.ts', 'package.json'];
function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  return Math.max(0, ...readdirSync(path).map((n) => newest(join(path, n))));
}
function distIsFresh(): boolean {
  const out = 'dist/index.html';
  return existsSync(out) && statSync(out).mtimeMs >= Math.max(...INPUTS.map(newest));
}
const PREBUILT = process.env.E2E_PREBUILT === '1' && distIsFresh();
const BUILD = PREBUILT ? 'echo "e2e: serving the gate\'s dist/"' : 'npx vite build';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'retain-on-failure',
    // Tests play whole runs, so without this the game's sounds play through the speakers.
    launchOptions: { args: ['--mute-audio'] },
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  webServer: {
    command: `${BUILD} && npx vite preview --base ${BASE} --port ${PORT} --strictPort`,
    // Server output goes to the log, so it shows whether this run built or served the gate's build.
    stdout: 'pipe',
    url: `http://localhost:${PORT}${BASE}`,
    // Never reuse whatever already listens on the port: it may be an old build.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
