/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// The build is served from yurykorzun.github.io/border_crossing_game/, so it needs that base.
// Dev stays at / so localhost works as before.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/border_crossing_game/' : '/',
  plugins: [react()],
  // e2e/ holds Playwright specs, run by `npm run e2e`, not by vitest.
  test: { include: ['src/**/*.test.ts'] },
}))
