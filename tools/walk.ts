// Prints what the branch walk found: state count, endings, decision range.
// `npm run walk`. A balance smell, not a verdict: endings are counted per
// distinct end state, not weighted by how a person would play.
import { walk } from '../src/game/walk';

const r = walk();
const total = Object.values(r.endings).reduce((a, b) => a + b, 0);
console.log(`states walked: ${r.states}`);
console.log(`end states: ${total}, max decisions: ${r.maxDecisions}, dead ends: ${r.deadEnds.length}`);
for (const [e, n] of Object.entries(r.endings)) console.log(`  ${e.padEnd(12)} ${n} (${((n / total) * 100).toFixed(1)}%)`);
