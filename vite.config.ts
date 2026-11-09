/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/**
 * Emits sw.js for the build: src/pwa/sw.js with the list of every built and public file to
 * precache, and a cache name hashed from those files, so each deploy gets a new worker.
 */
function serviceWorker(): Plugin {
  let publicDir = ''
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_options, bundle) {
      const hash = createHash('sha256')
      const built = Object.keys(bundle).filter((f) => f !== 'index.html')
      for (const f of built) hash.update(f)
      const publicFiles = publicDir
        ? readdirSync(publicDir, { recursive: true, withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => relative(publicDir, join(d.parentPath, d.name)).split(sep).join('/'))
            .sort()
        : []
      for (const f of publicFiles) hash.update(f).update(readFileSync(join(publicDir, f)))
      // index.html changes whenever the hashed names it points at change, so it is covered too.
      const template = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
      hash.update(template)
      const assets = [...built, ...publicFiles].sort()
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source:
          `const CACHE = 'purpose-of-visit-${hash.digest('hex').slice(0, 12)}';\n` +
          `const ASSETS = ${JSON.stringify(assets)};\n\n${template}`,
      })
    },
  }
}

// https://vite.dev/config/
// The build is served from yurykorzun.github.io/border_crossing_game/, so it needs that base.
// Dev stays at / so localhost works as before.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/border_crossing_game/' : '/',
  plugins: [react(), serviceWorker()],
  // e2e/ holds Playwright specs, run by `npm run e2e`, not by vitest.
  // tools/ tests run the npm scripts themselves (tools/eval.test.ts).
  test: { include: ['src/**/*.test.ts', 'tools/**/*.test.ts'] },
}))
