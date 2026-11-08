// Seeded random (mulberry32). The state is a plain number kept in RunState,
// so a saved run replays the same way.

export function nextRandom(state: number): { value: number; rng: number } {
  const rng = (state + 0x6d2b79f5) | 0;
  let t = rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, rng };
}

export function pick<T>(state: number, list: readonly T[]): { value: T; rng: number } {
  if (!list.length) throw new Error('pick from an empty list');
  const r = nextRandom(state);
  return { value: list[Math.floor(r.value * list.length)], rng: r.rng };
}
