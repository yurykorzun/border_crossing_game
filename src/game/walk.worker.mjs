// Walks one group of setups (walkGroups() in walk.ts) on a worker thread, so walk.test.ts can
// walk Arrival's destination groups at the same time. Plain Node runs the TypeScript (it strips
// the types, which erasableSyntaxOnly keeps possible); the hook below only adds the `.ts` or
// `/index.ts` that the source leaves off its relative imports.
import { register } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

const hook = `
export async function resolve(specifier, context, next) {
  if (/^\\.\\.?(\\/|$)/.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = specifier.replace(/\\/$/, '');
    for (const tail of base === '.' || base === '..' ? ['/index.ts'] : ['.ts', '/index.ts']) {
      try {
        return await next(base + tail, context);
      } catch {
        // not this one, try the next
      }
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`);

const { walk } = await import('./walk.ts');
parentPort.postMessage(walk(workerData));
