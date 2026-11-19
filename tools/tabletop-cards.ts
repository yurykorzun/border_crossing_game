// The tabletop prototype's cards as one HTML page, read from the game's own content
// (src/game/content) and text (src/i18n/en.ts), so the paper cards say what the game does.
// tools/tabletop.ts prints it to PDF; this file only builds the page, so tests can run it.
import { CONTRADICTIONS, CORE_CARDS, ENCOUNTER_BY_ID, INCONSISTENCIES, INSPECTION_BY_ID } from '../src/game/content/encounters';
import * as W from '../src/game/content/world';
import type { Approach, CharacterId, Checkpoint, Cond, Effect, Topic } from '../src/game/types';

/** The six core questions, two per desk, in the order the desks ask them. */
export const QUESTION_CARDS: readonly string[] = [...CORE_CARDS.passport, ...CORE_CARDS.customs, ...CORE_CARDS.interview];
/** Three inspections, one of each kind a paper table can run without the engine's bookkeeping. */
export const INSPECTION_CARDS: readonly string[] = ['s_supervisor', 's_medicine', 's_connection'];
/** Lena's two people: the mother every desk can phone, and the cousin she protects. */
export const CONTACT_CARDS: readonly string[] = ['mother', 'cousin'];

export interface Tabletop {
  html: string;
  /** en.ts keys a card needs that are not there. Any of these fails `npm run tabletop`. */
  missing: string[];
  /** Question card id and how many approaches it prints, after merging variants with the same label. */
  approaches: Record<string, number>;
  cards: number;
  /** Every hour and scrutiny point a card prints, by `<prefix>.<card>.<approach>`. */
  prices: Record<string, PrintedCost[]>;
}

/**
 * One printed cost, as numbers: what tools/tabletop.test.ts holds against the engine's
 * options(). `unverified`: only while that point is not yet verified.
 */
export interface PrintedCost {
  hours?: number;
  scrutiny?: number;
  when?: Cond;
  unverified?: Topic;
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function buildTabletop(en: Record<string, string>): Tabletop {
  const missing: string[] = [];
  /** A card's text. A missing key is recorded and prints as the key, so the PDF shows the gap. */
  const t = (k: string, vars: Record<string, string | number | (() => string)> = {}) => {
    if (!(k in en)) { if (!missing.includes(k)) missing.push(k); return `[${k}]`; }
    return en[k].replace(/\{(\w+)\}/g, (m, v) => { const x = vars[v]; return x === undefined ? m : typeof x === 'function' ? x() : String(x); });
  };
  const has = (k: string) => k in en;
  const hours = (n: number) => t(n === 1 ? 'ui.hours.one' : 'ui.hours.other', { n });
  const charOf = (bg: string) => W.CHARACTER_IDS.find((c) => (W.CHARACTERS[c].background as string[]).includes(bg));
  const name = (c: string) => t(`char.${c}.name`);

  /** A condition in plain words, from the same text the game shows. */
  function cond(c: Cond | undefined): string {
    if (!c) return '';
    const p: string[] = [];
    const and = ` ${t('ui.and')} `; const or = ` ${t('tabletop.part.or')} `;
    const as = (ch: string) => t('tabletop.part.as', { name: name(ch) });
    if (c.character) p.push(as(c.character));
    if (c.background) { const ch = charOf(c.background); p.push(ch ? as(ch) : c.background); }
    if (c.bulletin) p.push(t('tabletop.part.bulletin', { bulletin: cap(c.bulletin) }));
    if (c.facts) p.push(t('tabletop.part.facts', { facts: c.facts.map((f) => t(`fact.${f}`).toLowerCase()).join(and) }));
    if (c.noFacts) p.push(t('tabletop.part.noFacts', { facts: c.noFacts.map((f) => t(`fact.${f}`).toLowerCase()).join(or) }));
    if (c.claims) p.push(t('tabletop.part.claims', { claims: c.claims.map((x) => t(`claim.${x}`)).join(`"${and}"`) }));
    if (c.noClaims) p.push(t('tabletop.part.noClaims', { claims: c.noClaims.map((x) => t(`claim.${x}`)).join(`"${or}"`) }));
    if (c.contactFree) p.push(t('tabletop.part.contactFree', { contacts: c.contactFree.map((x) => t(`contact.${x}`)).join(or) }));
    if (c.lastHours !== undefined) p.push(t(c.lastHours ? 'tabletop.part.lastHours' : 'tabletop.part.moreHours', { hours: hours(W.LAST_HOURS) }));
    if (c.holds) p.push(t('tabletop.part.holds', { topic: t(`topic.${c.holds}.helps`).toLowerCase() }));
    if (c.used) p.push(t('tabletop.part.used', { docs: c.used.map((x) => t(`ev.${x}.the`)).join(and) }));
    if (c.flagged !== undefined) p.push(t(c.flagged ? 'tabletop.part.flagged' : 'tabletop.part.unflagged'));
    if (c.any) p.push(c.any.map((x) => cond(x) || t('tabletop.part.always')).join(or));
    if (c.not) {
      // Two travelers: "not as Mark" is "as Lena".
      const only = Object.keys(c.not);
      const other = only.length === 1 && c.not.character ? W.CHARACTER_IDS.find((x) => x !== c.not!.character) : undefined;
      p.push(other ? as(other) : t('tabletop.part.not', { cond: cond(c.not) }));
    }
    return p.join(', ');
  }
  const when = (c: Cond | undefined) => (c ? ` <i>(${esc(cond(c))})</i>` : '');

  /** What one effect costs or establishes, as a printed line. */
  function effect(e: Effect, event?: string): { cost?: string; gives?: string } {
    if ('time' in e) return { cost: event ? t(-e.time === 1 ? 'ui.line.event.one' : 'ui.line.event.other', { event, n: -e.time }) : `−${hours(-e.time)}` };
    if ('scrutiny' in e) return { cost: t('ui.line.scrutiny', { n: e.scrutiny }) };
    if ('loseMedicine' in e) return { cost: t('ui.line.medicine') };
    if ('travel' in e) return { cost: t(e.travel === 1 ? 'ui.line.travel.one' : 'ui.line.travel.other', { n: e.travel }) };
    if ('claim' in e) return { gives: `${t(`claim.${e.claim}.recorded`)}: "${t(`claim.${e.claim}`)}"` };
    if ('fact' in e) return { gives: t(`fact.${e.fact}.reveal`) };
    if ('send' in e) return { gives: e.facts ? t('tabletop.sent', { facts: e.facts.map((f) => t(`fact.${f}`).toLowerCase()).join(', ') }) : t('tabletop.sentAll') };
    return {};
  }

  /**
   * One approach row: label (with Mark's wording if he has his own), cost and what it puts on record.
   * On a desk's own question card the officer also reacts to the facts it cares about the first
   * time they come out (OFFICERS reactions, officerFlags() in src/game/engine.ts), so that
   * scrutiny prints too, under "not on file". An inspection card has no officer reaction.
   * A check of the card's `topic` costs a traveler whose weak point it is an hour more.
   */
  function approachRow(prefix: string, card: string, variants: Approach[], desk: Checkpoint | undefined, topic: Topic | undefined): string {
    const a = variants[0];
    const k = `${prefix}.${card}.${a.id}`;
    const contacts = a.contacts ?? [];
    // Each traveler names only their own people: Lena her cousin, Mark his brother.
    const own = (c: CharacterId) => contacts.filter((x) => W.CHARACTERS[c].contacts.includes(x));
    const mine = (c: CharacterId) => () => own(c).map((x) => t(`contact.${x}.mine`)).join(' / ');
    const aDocument = t('tabletop.part.aDocument');
    const label = t(`${k}.label`, { cardThe: aDocument, contact: contacts.map((c) => t(`contact.${c}`)).join(' or '), contactMine: mine('lena') });
    const markKey = `${prefix}.${card}.mark.${a.id}.label`;
    const mark = has(markKey) ? `<div class="alt">${esc(name('mark'))}: ${esc(t(markKey, { contactMine: mine('mark') }))}</div>` : '';
    const event = has(`${k}.event`) ? t(`${k}.event`) : undefined;
    const head: string[] = []; const names: string[] = [];
    if (a.kind === 'evidence') head.push(`${esc(t('ui.line.uses', { cardShort: aDocument }))} (${esc(t(`topic.${a.topic}.helps`).toLowerCase())})`);
    if (a.kind === 'perk') head.push(esc(t('ui.line.perk')));
    if (a.kind === 'withdraw') head.push(esc(t('ui.line.withdraw')));
    if (a.kind === 'contact') names.push(esc(t('tabletop.names', { contacts: contacts.map((c) => t(`contact.${c}`)).join(` ${t('tabletop.part.or')} `) })));
    if (a.check) head.push(esc(t('ui.line.check')));
    /** One variant's cost line and record line, under its condition when the choice has several. */
    const lines = (v: Approach, many: boolean) => {
      const costs = [...head]; const gives = [...names];
      // Every hour and scrutiny point printed, with its condition, so a test can hold it to the engine.
      const priced: PrintedCost[] = (prices[`${prefix}.${card}.${v.id}`] = []);
      for (const e of v.effects) {
        const r = effect(e, event);
        if (r.cost) costs.push(esc(r.cost) + when(e.when));
        if (r.gives) gives.push(esc(r.gives) + when(e.when));
        if ('time' in e) priced.push({ hours: -e.time, when: e.when });
        if ('scrutiny' in e) priced.push({ scrutiny: e.scrutiny, when: e.when });
        // The officer's own scrutiny for this fact, unless the answer already charges for it.
        if (!desk || !('fact' in e) || v.effects.some((x) => 'scrutiny' in x && x.reason === e.fact)) continue;
        const fact = e.fact;
        for (const re of W.OFFICERS[desk].reactions) {
          if (!re.reveals.includes(fact) || !re.scrutiny) continue;
          const c: Cond = { ...(e.when ?? {}), ...(re.when ?? {}), noFacts: [...(e.when?.noFacts ?? []), ...(re.when?.noFacts ?? []), fact] };
          costs.push(esc(t('ui.line.scrutiny', { n: re.scrutiny })) + when(c));
          priced.push({ scrutiny: re.scrutiny, when: c });
        }
      }
      // A traveler's weak point costs an extra hour on a check of it, until it is verified
      // (CHARACTERS weakTopics, resolvedEffects() in src/game/engine.ts): Lena's work.
      if (v.kind === 'verify' && topic) {
        for (const c of W.CHARACTER_IDS) {
          if (!W.CHARACTERS[c].weakTopics.includes(topic)) continue;
          const by: Cond = { character: c };
          costs.push(`−${esc(hours(1))} <i>(${esc(`${cond(by)}, ${t('tabletop.part.unverified', { topic: t(`topic.${topic}.helps`).toLowerCase() })}`)})</i>`);
          priced.push({ hours: 1, when: by, unverified: topic });
        }
      }
      if (v.ifVerified) costs.push(`<i>${esc(t('tabletop.ifVerified', { cost: v.ifVerified.length ? v.ifVerified.map((e) => effect(e, event).cost ?? '').join(', ') : t('ui.line.free') }))}</i>`);
      if (!costs.length) costs.push(esc(t('ui.line.free')));
      const only = v.requires ? `<div class="req">${esc(t(many ? 'tabletop.if' : 'tabletop.only', { cond: cond(v.requires) }))}</div>` : '';
      return `${only}<div class="cost">${costs.join(' · ')}</div>${gives.length ? `<div class="gives">${gives.join(' · ')}</div>` : ''}`;
    };
    return `<li><div class="al">${esc(label)}</div>${mark}${variants.map((v) => lines(v, variants.length > 1)).join('')}</li>`;
  }

  /** Approaches with the same label are one choice on paper (p_host's two "I haven't decided yet."). */
  function merged(prefix: string, card: string, approaches: Approach[]): Approach[][] {
    const by = new Map<string, Approach[]>();
    for (const a of approaches) {
      const key = en[`${prefix}.${card}.${a.id}.label`] ?? a.id;
      by.set(key, [...(by.get(key) ?? []), a]);
    }
    return [...by.values()];
  }

  const approaches: Record<string, number> = {};
  const prices: Record<string, PrintedCost[]> = {};
  const cards: string[] = [];

  for (const id of QUESTION_CARDS) {
    const e = ENCOUNTER_BY_ID.get(id);
    if (!e) throw new Error(`tabletop: no encounter ${id}`);
    const groups = merged('enc', id, e.approaches);
    approaches[id] = groups.length;
    const desk = e.checkpoint as 'passport' | 'customs' | 'interview';
    const markQ = has(`enc.${id}.mark.q`) ? `<div class="alt">${esc(name('mark'))}: ${esc(t(`enc.${id}.mark.q`))}</div>` : '';
    cards.push(`<div class="card q ${desk}"><div class="kind">${esc(t(`checkpoint.${desk}`))} · ${esc(t(`officer.${desk}`))}</div>
      <div class="qt">${esc(t(`enc.${id}.q`))}</div>${markQ}
      ${e.when ? `<div class="req">${esc(t('tabletop.askedOnly', { cond: cond(e.when) }))}</div>` : ''}
      <ol>${groups.map((g) => approachRow('enc', id, g, desk, e.topic)).join('')}</ol><div class="id">${id}</div></div>`);
  }

  for (const id of INSPECTION_CARDS) {
    const s = INSPECTION_BY_ID.get(id);
    if (!s) throw new Error(`tabletop: no inspection ${id}`);
    cards.push(`<div class="card insp"><div class="kind">${esc(t('officer.inspection'))} · ${esc(t(`insp.issue.${s.issue}`))}</div>
      <div class="qt">${esc(t(`insp.${id}.q`))}</div>
      ${s.when ? `<div class="req">${esc(t('tabletop.dealtOnly', { cond: cond(s.when) }))}</div>` : ''}
      <ol>${merged('insp', id, s.approaches).map((g) => approachRow('insp', id, g, undefined, s.topic)).join('')}</ol><div class="id">${id}</div></div>`);
  }

  for (const id of W.EVIDENCE_IDS) {
    const ev = W.EVIDENCE[id];
    cards.push(`<div class="card doc"><div class="kind">${esc(t('tabletop.document'))}</div><div class="qt">${esc(t(`ev.${id}.name`))}</div>
      <p>${esc(t(`ev.${id}.desc`))}</p>
      <div class="cost">${esc(t('tabletop.answers', { topics: ev.topics.map((x) => t(`topic.${x}.helps`)).join(', ') }))}</div>
      <div class="gives">${ev.onUse.map((e) => { const r = effect(e); return r.gives ? esc(r.gives) + when(e.when) : ''; }).filter(Boolean).join(' · ')}</div>
      ${ev.blockedBy ? `<div class="req">${esc(t('tabletop.notUsable', { cond: cond(ev.blockedBy) }))}</div>` : ''}<div class="id">${id}</div></div>`);
  }

  for (const id of W.CHARACTER_IDS) {
    const ch = W.CHARACTERS[id];
    cards.push(`<div class="card trav"><div class="kind">${esc(t('ui.traveler'))} · ${esc(t(`char.${id}.role`))}</div><div class="qt">${esc(name(id))}</div>
      <p>${esc(t(`char.${id}.blurb`))}</p>
      <div class="cost">${esc(t(ch.evidenceSlots === 1 ? 'ui.line.documents.one' : 'ui.line.documents.other', { n: ch.evidenceSlots }))} · ${esc(t('ui.scrutinyCount', { n: ch.startScrutiny, max: W.MAX_SCRUTINY }))}</div>
      <p><b>+</b> ${esc(t(`char.${id}.advantage`))}</p><p><b>−</b> ${esc(t(`char.${id}.complication`))}</p>
      <div class="gives">${esc(t('ui.contacts'))}: ${ch.contacts.map((c) => esc(t(`contact.${c}`))).join(', ')}</div>
      <p class="small">${esc(t(`char.${id}.protects`))}</p><div class="id">${id}</div></div>`);
  }

  for (const id of CONTACT_CARDS) {
    cards.push(`<div class="card contact"><div class="kind">${esc(t('ui.contacts'))}</div><div class="qt">${esc(cap(t(`contact.${id}`)))}</div>
      <p>${esc(t(`contact.${id}.note`))}</p><div class="gives">${esc(t(`contact.${id}.can`))}</div><div class="id">${id}</div></div>`);
  }

  for (const id of W.BULLETINS) {
    cards.push(`<div class="card bull"><div class="kind">${esc(t('ui.bulletin'))} · ${cap(id)}</div>
      <div class="qt">${esc(t(`bulletin.${id}`))}</div><p>${esc(t(`bulletin.${id}.cue`))}</p><div class="id">bulletin ${id}</div></div>`);
  }

  // Tokens and tracks: the medicine (front and back), time 8 to 0, scrutiny 0 to 3.
  const token = `<div class="tokens"><div class="token">${esc(t('ui.medicine'))}</div><div class="token lost">${esc(t('ui.medicineLost'))}</div></div>`;
  const time = Array.from({ length: W.START_TIME + 1 }, (_, i) => W.START_TIME - i);
  const scrutiny = Array.from({ length: W.MAX_SCRUTINY + 1 }, (_, i) => i);
  const tracks = `<div class="track"><div class="th">${esc(t('ui.lastBus.other', { n: W.START_TIME }))} · ${esc(t('ui.line.need.other', { n: W.MISSION_MIN_TIME }))}</div>
    <div class="cells">${time.map((n) => `<div class="cell">${n}</div>`).join('')}</div></div>
    <div class="track"><div class="th">${esc(t('ui.scrutiny'))} · ${esc(t('ui.scrutinyHelp.what'))}</div>
    <div class="cells">${scrutiny.map((n) => `<div class="cell${n === W.MAX_SCRUTINY ? ' max' : ''}">${n}</div>`).join('')}</div></div>`;

  // The two challenge cards' prices, read from the content so the rules page cannot drift.
  const price = (card: string, approach: string) => {
    const a = ENCOUNTER_BY_ID.get(card)?.approaches.find((x) => x.id === approach);
    const e = a?.effects.find((x) => 'time' in x || 'scrutiny' in x);
    if (!e) throw new Error(`tabletop: no price on ${card}.${approach}`);
    return esc(effect(e).cost ?? '');
  };
  const pairs = (list: readonly (readonly [string, string])[]) => list.map(([c, f]) => `"${esc(t(`claim.${c}`))}" with ${esc(t(`fact.${f}`).toLowerCase())}`).join('; ');
  const followUp = `A claim looks odd next to a fact on file (${pairs(INCONSISTENCIES)}): ${esc(t('enc.i_clarify.clarify.label'))} costs ${price('i_clarify', 'clarify')}, or accept it for ${price('i_clarify', 'accept')}. A fact says the opposite (${pairs(CONTRADICTIONS)}): ${esc(t('enc.i_contradiction.apologise.label'))} costs ${price('i_contradiction', 'apologise')}, or "${esc(t('enc.i_contradiction.review.label'))}" costs ${price('i_contradiction', 'review')}. One follow-up per crossing, the contradiction first.`;

  // The called-in hour follows callInsDue() in src/game/engine.ts: never on an inspection,
  // a withdraw or a point already verified. A card marked noCallIns (Departure's d_out) is
  // not printed here.
  const rules = `<div class="rules"><h1>${esc(t('ui.title'))} · tabletop rules</h1>
  <p class="lead">${esc(t('ui.tagline'))} ${esc(t('mission.body'))}</p>
  <h2>Set up</h2>
  <ol>
    <li>Pick a traveler card. Put a marker on ${W.START_TIME} on the time track and on the traveler's starting scrutiny.</li>
    <li>Pack documents: Lena takes ${W.CHARACTERS.lena.evidenceSlots}, Mark ${W.CHARACTERS.mark.evidenceSlots}, of the ${W.EVIDENCE_IDS.length}. Take the medicine token face up.</li>
    <li>Shuffle the ${W.BULLETINS.length} bulletins and turn one over. It holds for the whole crossing.</li>
    <li>Keep a sheet of paper as the record, with three columns: Passport, Customs, Interview. What a desk writes down stays in its column.</li>
  </ol>
  <h2>Each turn</h2>
  <ol>
    <li><b>Deal.</b> The game master reads the next question card: ${QUESTION_CARDS.map((id) => `<code>${id}</code>`).join(', ')}, two per desk in that order. Skip a card whose "Asked only" line does not hold.</li>
    <li><b>Show legal choices.</b> Read out every approach whose "Only" line holds. A document answer needs a packed, unused document that answers that topic. A contact answer needs that person on the traveler card.</li>
    <li><b>Apply cost.</b> Move the time marker down by the hours and the scrutiny marker up. A cost in <i>(brackets)</i> applies only when its condition holds. A used document is turned face down. Once someone has been named and called in, each later answer on a question card about a point they could confirm costs 1 hour more while the desk checks their statement. Not on an inspection card, not for "${esc(t('ui.line.withdraw'))}", and not once that point is verified.</li>
    <li><b>Update records.</b> Write each claim and fact the answer gives in the column of this desk. A document puts on file what its own card says. "Sent on to the next desk" copies those facts into the next column.</li>
    <li><b>Resolve follow-up.</b> At the interview, check the record before its two cards. ${followUp}</li>
    <li><b>Inspection.</b> ${esc(t('ui.scrutinyHelp.max', { max: W.MAX_SCRUTINY, after: W.SCRUTINY_AFTER_INSPECTION }))} On paper: deal the first inspection card whose "Dealt only" line holds.</li>
    <li><b>Advance.</b> After two cards, move to the next desk. After the interview, the crossing ends.</li>
  </ol>
  <h2>Ending</h2>
  <p>${esc(t('ui.line.need.other', { n: W.MISSION_MIN_TIME }))}: with ${W.MISSION_MIN_TIME} or more hours left you make the last bus. At 0 hours, or after "${esc(t('ui.line.withdraw'))}", the crossing is over. Losing the medicine means you get home without it.</p>
  <p class="small">Cut along the dashed lines. Cards are 63 × 88 mm. Printed from the game content; the card id is in each corner.</p>
  </div>`;

  const page = (body: string) => `<section class="sheet">${body}</section>`;
  const sheets: string[] = [];
  for (let i = 0; i < cards.length; i += 9) sheets.push(page(`<div class="grid">${cards.slice(i, i + 9).join('')}</div>`));

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Purpose of Visit tabletop</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;font-size:7.4pt;line-height:1.25}
.sheet{width:210mm;height:297mm;padding:10mm 10.5mm;page-break-after:always;overflow:hidden}
.grid{display:grid;grid-template-columns:repeat(3,63mm);grid-auto-rows:88mm}
.card{border:0.3mm dashed #777;padding:3mm;position:relative;overflow:hidden}
.kind{font-size:6pt;text-transform:uppercase;letter-spacing:.04em;color:#555;margin-bottom:1.2mm}
.qt{font-weight:700;font-size:9pt;margin-bottom:1.2mm}.alt{color:#444;font-style:italic;margin:.4mm 0}
ol{margin:1mm 0 0;padding-left:4mm}li{margin-bottom:1.4mm}.al{font-weight:600}
.cost{color:#7a3e00;margin-top:.4mm}.gives{color:#1f4f7a;margin-top:.4mm}.req{color:#555;font-style:italic;margin-top:.4mm}
p{margin:1mm 0}.small{font-size:6.4pt;color:#555}.id{position:absolute;right:2mm;bottom:1.5mm;font-size:5.5pt;color:#999;font-family:'IBM Plex Mono',monospace}
.card.passport{border-top:2.4mm solid #2a5d8f}.card.customs{border-top:2.4mm solid #7a3e00}.card.interview{border-top:2.4mm solid #6b2d6b}
.card.insp{border-top:2.4mm solid #8f2a2a}.card.doc{border-top:2.4mm solid #3d6b3d}.card.trav{border-top:2.4mm solid #222}
.card.contact{border-top:2.4mm solid #8a7a2a}.card.bull{border-top:2.4mm solid #555}
.tokens{display:flex;gap:6mm;margin:4mm 0}.token{width:30mm;height:30mm;border-radius:50%;border:0.3mm dashed #777;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;padding:3mm}
.token.lost{color:#8f2a2a}.track{margin:4mm 0}.th{font-weight:700;margin-bottom:1.5mm}.cells{display:flex}
.cell{width:20mm;height:20mm;border:0.3mm dashed #777;display:flex;align-items:center;justify-content:center;font-size:16pt;font-weight:700}.cell.max{background:#f6dddd}
.rules{font-size:9.5pt;line-height:1.4}.rules h1{font-size:15pt;margin:0 0 2mm}.rules h2{font-size:11pt;margin:4mm 0 1mm}.rules li{margin-bottom:1.5mm}.lead{color:#444}
</style></head><body>${page(rules)}${sheets.join('')}${page(`<h1 style="font-size:12pt;margin:0 0 3mm">Tokens and tracks</h1>${token}${tracks}`)}</body></html>`;

  return { html, missing, approaches, cards: cards.length, prices };
}
