import { defineConfig, devices } from '@playwright/test';

// Phone-size browser checks against the production build served by `vite preview`.
// The build uses base '/border_crossing_game/' (as on GitHub Pages). `vite preview` runs
// as command 'serve', so vite.config.ts gives it base '/'; --base puts it back.
const PORT = 4173;
const BASE = '/border_crossing_game/';

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
    command: `npx vite build && npx vite preview --base ${BASE} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    // Never reuse whatever already listens on the port: it may be an old build.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
