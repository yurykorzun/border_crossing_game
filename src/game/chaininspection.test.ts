// azv.21: the ending's follow-up chain line names the supervisor when the answer that
// brought the follow-up was given to her at a secondary inspection, not the desk she
// interrupted. No bot run reaches this (seeds 1-3, every level), so the run is built here.
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { SAMPLE_FILES } from './carry';
import { chains, questionKey } from './consequence';
import { newRun } from './engine';
import type { Answered, RunState } from './types';

const answer = (a: Pick<Answered, 'desk' | 'card' | 'pick' | 'key'> & Partial<Answered>): Answered =>
  ({ hours: 0, travel: 0, scrutiny: 0, named: [], medicine: false, caught: [], used: [], settled: [], ...a });

/**
 * Lena in Departure: the border transfer, taken at a passport desk inspection or by the
 * passport card itself, puts her family address on file, and customs then phones the host.
 */
function run(cause: Answered): RunState {
  const s = newRun({ level: 'departure', character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7, file: SAMPLE_FILES.lena });
  const host = answer({ desk: 'customs', card: 'c_host', pick: 'call', key: 'enc.c_host.call.label', hours: 1 });
  return { ...s, facts: { ...s.facts, familyAddress: ['passport', 'customs'] }, answers: [cause, host] };
}

describe('a follow-up chain line whose cause was a supervisor answer', () => {
  it('names the supervisor, not the desk', () => {
    const s = run(answer({ desk: 'passport', card: 's_connection', pick: 'transfer', key: 'insp.s_connection.transfer.label', recorded: ['familyAddress'] }));
    const [line] = chains(s);
    expect(line).toMatchObject({ kind: 'followUp', key: 'ending.chain.followUp.fact.inspection', vars: { fact: 'familyAddress', desk: 'customs' } });
    const text = t(line.key, line.vars);
    expect(text).toContain('by the supervisor');
    expect(text.toLowerCase()).not.toContain('passport');
    expect(text).toContain(t(questionKey(s, 'enc', 'c_host')));
  });

  it('still names the desk when the cause was its own card', () => {
    const s = run(answer({ desk: 'passport', card: 'p_host', pick: 'mother', key: 'enc.p_host.mother.label', recorded: ['familyAddress'] }));
    const [line] = chains(s);
    expect(line).toMatchObject({ kind: 'followUp', key: 'ending.chain.followUp.fact', vars: { deskAt: 'passport', desk: 'customs' } });
  });

  it('has a supervisor line for every kind of cause', () => {
    for (const kind of ['fact', 'claim', 'did', 'shown']) expect(t(`ending.chain.followUp.${kind}.inspection`)).toContain('supervisor');
  });
});
