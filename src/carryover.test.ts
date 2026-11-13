// The ending and the Departure file agree with the run that made them
// (border_crossing_game-dap.39). Found on the live site after PR #53: "What decided it"
// listed 2 + 1 + 1 hours lost with 3 of 8 left (the supervisor's hour left out), the
// Departure passport desk said "Kept from Arrival: no place to stay on your entry form"
// after the deed answered where you would stay, the Departure ending said "Contacts: No
// one on file" after a desk noted another relative, and "The following morning" stood
// over "Three days later:".
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ending } from './App';
import { BOT_STYLES, playRun } from './game/bots';
import type { BotStyle } from './game/bots';
import { fileOf } from './game/carry';
import { axisLines, consequences, decisive, fileLine, laterBeat, unlistedHours } from './game/consequence';
import { levelOf } from './game/content/levels';
import { newRun, optionFor } from './game/engine';
import type { RunSetup } from './game/engine';
import { tryStep } from './game/play';
import type { Action, CarriedFile, ContactId, EvidenceId, RunState } from './game/types';
import { allSetups } from './game/walk';
import { setStory, t } from './i18n';

const render = (s: RunState) => renderToStaticMarkup(createElement(Ending, { s, onChoose: () => {}, onRetry: () => {}, onNext: () => {} }));
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/**
 * What a run put on record, read from its own answers as they were picked (not the
 * engine's bookkeeping): the documents shown and the card each answered, the stay
 * claims said, the cash answer, and who and which relative went on file. `lines` holds
 * every file line a card showed under its question.
 */
interface Played {
  final: RunState;
  shownOn: Map<string, EvidenceId>;
  spent: Set<EvidenceId>;
  stayClaim: boolean;
  underLimit: boolean;
  cashCounted: boolean;
  cashShown: boolean;
  people: Set<ContactId>;
  relative: boolean;
  lines: { key: string; vars: Record<string, string> }[];
}

/** Plays `actions` through tryStep(), as the game does, so the run keeps its answers (RunState.answers). */
function play(setup: RunSetup, actions: readonly Action[]): Played {
  let s = newRun(setup);
  const p: Played = {
    final: s, shownOn: new Map(), spent: new Set(), stayClaim: false, underLimit: false, cashCounted: false, cashShown: false,
    people: new Set(), relative: false, lines: [],
  };
  const look = (x: RunState) => {
    if (x.screen.kind !== 'encounter' || x.reaction) return;
    const l = fileLine(x, x.screen.id);
    if (l) p.lines.push(l);
  };
  look(s);
  for (const a of actions) {
    const sc = s.screen;
    const card = sc.kind === 'encounter' || sc.kind === 'inspection' ? sc.id : undefined;
    const o = a.type === 'choose' && card ? optionFor(s, a) : undefined;
    const r = tryStep(s, a);
    expect(r.ok, `${card ?? sc.kind}: ${JSON.stringify(a)}`).toBe(true);
    const n = r.state;
    if (o && !o.documents && card && o.card) {
      p.shownOn.set(card, o.card);
      p.spent.add(o.card);
      if (card === 'c_cash') p.cashShown = true;
    }
    if (o?.contact) p.people.add(o.contact);
    if (['stayingWithFamily', 'hotelStay'].some((c) => n.claims.includes(c as never) && !s.claims.includes(c as never))) p.stayClaim = true;
    if (n.claims.includes('cashUnderLimit')) p.underLimit = true;
    if (n.facts.cashCount?.length) p.cashCounted = true;
    if (n.facts.relativeContact?.length || n.facts.relativeNamed?.length) p.relative = true;
    s = n;
    look(s);
  }
  p.final = s;
  return p;
}

/** The hours a level starts with. */
const startHours = (s: RunState) => levelOf(s).startTime;

/** The ending's checks: hours add up, contacts name everyone on file, no heading over another time. */
function checkEnding(p: Played, file: CarriedFile | undefined, where: string, seen: Seen) {
  const s = p.final;
  // What decided it: the hours listed, the rest line and the hours at the exit make the start.
  const listed = decisive(s).flatMap((d) => d.costs).reduce((h, c) => h + (c.key === 'ending.cost.hours' ? c.n ?? 0 : 0), 0);
  const spent = (s.answers ?? []).reduce((h, a) => h + a.hours, 0);
  expect(listed + unlistedHours(s), `${where}: listed hours`).toBe(spent);
  expect(listed + unlistedHours(s) + s.time, `${where}: hours add up`).toBe(startHours(s));

  // Contacts: everyone the run named, the names the file brought in, and another relative a desk noted.
  const contacts = axisLines(s).find((l) => l.axis === 'contacts')!;
  const text = t(contacts.key, contacts.vars);
  const people = new Set([...p.people, ...(file?.named ?? [])]);
  for (const c of people) expect(text, `${where}: contacts`).toContain(t(`contact.${c}`));
  if (p.relative) expect(text, `${where}: contacts`).toContain(t('ending.axis.contacts.relative'));
  if (!people.size && !p.relative) expect(contacts.key, where).toBe('ending.axis.contacts.none');

  // The rendered ending says the same, and its time heading only stands over the costs it dates.
  const html = render(s);
  const shown = plain(html);
  expect(shown, where).toContain(`${t('ending.axis.contacts')}: ${text}`);
  const rest = unlistedHours(s);
  if (rest) seen.rest++;
  if (p.relative) seen.relative++;
  if (laterBeat(s) && !consequences(s).length) seen.beatOnly++;
  if (rest) expect(shown, where).toContain(t(`ending.decided.rest.${rest === 1 ? 'one' : 'other'}`, { n: String(rest) }));
  else expect(html, where).not.toContain('class="decided-rest"');
  const headings = html.split('class="mono later-heading"').length - 1;
  expect(headings, `${where}: one heading for the costs, none without them`).toBe(consequences(s).length ? 1 : 0);
  if (headings) expect(html, `${where}: the heading sits over the costs`).toMatch(/class="mono later-heading">[^<]*<\/h2><ul class="costs">/);
  // A later beat has its own time heading, so the costs' heading never stands over its line.
  const beat = laterBeat(s);
  if (beat) expect(html, `${where}: the beat's own heading`).toContain(`<h2 class="mono beat-when">${t(`later.${beat.id}.when`)}</h2><p class="beat-line">`);
}

/** Departure's "Kept from Arrival" lines, against what the Arrival run put on record. */
function checkKept(arrival: Played, departure: Played, where: string, seen: Seen) {
  const declared = arrival.underLimit ? 'under' : arrival.cashCounted ? 'counted' : arrival.cashShown ? 'shown' : 'none';
  const host = arrival.shownOn.get('p_host');
  for (const l of departure.lines) {
    const text = t(l.key, l.vars);
    if (!text.startsWith('Kept from ')) {
      // A line that is not a "Kept from" line: the entry form's place shows the document that answered it.
      if (l.key === 'file.stayed.shown' && !arrival.stayClaim) {
        expect(l.vars.cardThe, `${where}: ${text}`).toBe(host);
        seen.placeShown++;
      }
      continue;
    }
    seen.kept++;
    if (l.key.startsWith('file.declared.')) expect(l.key, `${where}: ${text}`).toBe(`file.declared.${declared}`);
    else if (l.key === 'file.stayed.none') {
      expect(arrival.stayClaim, `${where}: ${text}, a place was said`).toBe(false);
      expect(host, `${where}: ${text}, a document answered it`).toBeUndefined();
    } else if (l.key === 'file.stay.ticket') expect(arrival.spent.has('returnTicket'), `${where}: ${text}`).toBe(true);
    else if (l.key === 'file.stay.hotel') {
      expect(arrival.spent.has('hotel'), `${where}: ${text}`).toBe(true);
      expect(arrival.spent.has('returnTicket'), `${where}: ${text}`).toBe(false);
    } else if (l.key === 'file.stay.undated') {
      expect(arrival.spent.has('hotel') || arrival.spent.has('returnTicket'), `${where}: ${text}`).toBe(false);
    } else throw new Error(`${where}: a "Kept from" line this test does not know: ${l.key}`);
  }
}

/** How often the sweep reached each case it is about. */
interface Seen { rest: number; kept: number; placeShown: number; relative: number; beatOnly: number }

describe('the ending and the Departure file match the run', () => {
  const arrival = allSetups('arrival');
  const departure = allSetups('departure');
  for (const style of BOT_STYLES) {
    it(`${style}: every Arrival setup over seeds 1-10, then into Departure`, () => {
      const seen: Seen = { rest: 0, kept: 0, placeShown: 0, relative: 0, beatOnly: 0 };
      for (let seed = 1; seed <= 10; seed++) {
        arrival.forEach((base, i) => {
          const setup = { ...base, seed };
          const where = `${style} ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin} seed ${seed}`;
          const a = play(setup, playRun(style as BotStyle, setup).actions);
          if (!a.final.ending) return;
          checkEnding(a, undefined, `Arrival ${where}`, seen);

          const file = fileOf(a.final);
          const out = departure.filter((d) => d.character === setup.character);
          const next: RunSetup = { ...out[(i + seed) % out.length], seed, file };
          setStory('departure');
          try {
            const d = play(next, playRun(style as BotStyle, next).actions);
            checkKept(a, d, `Departure ${where}`, seen);
            if (d.final.ending) checkEnding(d, file, `Departure ${where}`, seen);
          } finally {
            setStory(undefined);
          }
        });
      }
      // The sweep has to reach the cases it is about, or it proves nothing.
      expect(seen.kept, 'Kept from Arrival lines').toBeGreaterThan(0);
      expect(seen.rest, 'answers left off the list that cost hours').toBeGreaterThan(0);
      expect(seen.placeShown, 'a document that answered where you stay').toBeGreaterThan(0);
      expect(seen.relative, 'another relative on file').toBeGreaterThan(0);
      expect(seen.beatOnly, 'a later beat with no cost before it').toBeGreaterThan(0);
    }, 300_000);
  }
});
