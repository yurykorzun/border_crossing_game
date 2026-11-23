// An answer given to the supervisor at a secondary inspection is hers (border_crossing_game-azv.16):
// its reaction says the supervisor has the number, and "What decided it" lists it under
// the supervisor, never under the desk the inspection interrupted.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ending } from './App';
import { changeText, decisive } from './game/consequence';
import { newRun, options } from './game/engine';
import { playStep } from './game/play';
import { t } from './i18n';
import type { RunState } from './game/types';

/** Mark at the security interview, sent to the supervisor's purpose inspection with nothing that shows why he came. */
function atSupervisor(): RunState {
  const s = newRun({ character: 'mark', loadout: ['hotel', 'employerLetter', 'returnTicket', 'deed'], bulletin: 'records', seed: 7 });
  return { ...s, checkpoint: 2, slot: 1, scrutiny: 3, inspections: 1, seen: ['s_supervisor'], screen: { kind: 'inspection', id: 's_supervisor' } };
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

describe('an answer at a secondary inspection is labelled the supervisor\'s', () => {
  const s = atSupervisor();
  const contact = options(s).find((o) => o.approach.id === 'contact');
  const n = playStep(s, { type: 'choose', approach: 'contact' });
  const label = t('insp.s_supervisor.contact.label', { contact: 'mother' });

  it('the reaction says the supervisor has the number, not the security interview', () => {
    expect(contact?.blocked).toBeFalsy();
    const lines = (n.changes ?? []).map(changeText);
    expect(lines).toContain("The supervisor has your mother's number.");
    expect(lines.join(' ')).not.toContain(t('checkpoint.interview'));
  });

  it('"What decided it" lists the answer under the supervisor', () => {
    const d = decisive(n).find((x) => x.key === 'insp.s_supervisor.contact.label');
    expect(d?.inspection).toBe(true);
    const end: RunState = { ...n, reaction: null, changes: null, screen: { kind: 'ending' }, ending: 'homeAtCost' };
    const html = renderToStaticMarkup(createElement(Ending, { s: end, onChoose: () => {}, onRetry: () => {}, onNext: () => {} }));
    const item = html.split('class="decisive-answer"').map(plain).find((x) => x.includes(label));
    expect(item).toBeDefined();
    expect(item).toContain(t('ending.decided.inspection'));
    expect(item).not.toContain(t('ending.decided.at', { desk: 'interview' }));
  });

  it('a desk answer still names its desk', () => {
    const desk: RunState = { ...newRun({ character: 'mark', loadout: ['hotel', 'employerLetter', 'returnTicket', 'deed'], bulletin: 'records', seed: 7 }), reaction: null, checkpoint: 2, slot: 1, screen: { kind: 'encounter', id: 'i_family' }, seen: ['i_family'] };
    const pick = options(desk).find((o) => !o.blocked && !o.documents)!;
    const m = playStep(desk, { type: 'choose', approach: pick.approach.id });
    const end: RunState = { ...m, reaction: null, changes: null, screen: { kind: 'ending' }, ending: 'homeAtCost' };
    expect(decisive(end).some((x) => x.desk === 'interview' && !x.inspection)).toBe(true);
    const html = plain(renderToStaticMarkup(createElement(Ending, { s: end, onChoose: () => {}, onRetry: () => {}, onNext: () => {} })));
    expect(html).toContain(t('ending.decided.at', { desk: 'interview' }));
  });
});
