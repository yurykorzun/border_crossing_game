// The game map: every step, text and option of Purpose of Visit as a PDF for review,
// read from the game's own content, plus the planned levels from bd.
// `npm run map -- [out.pdf]` (default: ~/Desktop/Purpose of Visit game map <date>.pdf).
// Exits 1 if a line of src/i18n/en.ts is left out or a condition prints too long to read.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { en } from '../src/i18n/en';
import { CHALLENGES, CHECKS, CONTRADICTIONS, CORE_CARDS, ENCOUNTERS, INCONSISTENCIES, INSPECTIONS } from '../src/game/content/encounters';
import { LEVELS, LEVEL_IDS, dealsCard } from '../src/game/content/levels';
import * as W from '../src/game/content/world';

/** The longest condition the map prints before it fails: past this a reader cannot follow it. */
const MAX_CONDITION = 300;
const today = new Date().toISOString().slice(0, 10);
const out = process.argv[2] ?? join(homedir(), 'Desktop', `Purpose of Visit game map ${today}.pdf`);
const git = (...a: string[]) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const commit = git('log', '-1', '--format=%h %ad', '--date=short');
const branch = git('branch', '--show-current');

// Any is fine here: this reads content shapes generically and only prints them.
/* eslint-disable @typescript-eslint/no-explicit-any */
const used = new Set<string>();
const conditions: string[] = [];
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const txt = (k: string) => { if (!(k in en)) return ''; used.add(k); return esc(en[k]); };
const levelOf = (k: string) => k.match(/^([a-z]+):/)?.[1];
const bare = (k: string) => k.replace(/^[a-z]+:/, '');
const keysUnder = (p: string) => Object.keys(en).filter((k) => bare(k).startsWith(p));
const LV = LEVEL_IDS.map((id) => LEVELS[id]);
const lvShort = (id: string) => { const s = (en[LEVELS[id as keyof typeof LEVELS]?.title] ?? id).replace(/^The /, ''); return s[0].toUpperCase() + s.slice(1); };
/** One text line: its key without `prefix` (and any level prefix, named instead), then the text. */
const line = (k: string, prefix = '') => {
  const lv = levelOf(k);
  return `<div class="tl"><code>${esc(bare(k).slice(prefix.length))}${lv ? ` · ${esc(lvShort(lv))} wording` : ''}</code> ${txt(k)}</div>`;
};
const lines = (prefix: string, keep: (k: string) => boolean = () => true) => keysUnder(prefix).filter(keep).map((k) => line(k, prefix)).join('');
const badges = (card: string) => LV.map((l) => `<span class="b ${dealsCard({ level: l.id }, card) ? 'on' : 'off'}">${esc(lvShort(l.id))}</span>`).join('');

/** noneOf() in encounters.ts: "no earlier pair in the list is caught", built as nested any of noClaims/noFacts. */
const isNoneOf = (x: any): boolean => !!x.any && x.any.every((b: any) => (b.noClaims || b.noFacts) && Object.keys(b).every((k) => ['noClaims', 'noFacts', 'any'].includes(k)) && (!b.any || isNoneOf(b)));
function cond(c: any): string {
  if (!c) return '';
  const p: string[] = [];
  if (c.character) p.push(`traveler is ${c.character}`);
  if (c.background) p.push(`background: ${c.background}`);
  if (c.bulletin) p.push(`bulletin: ${c.bulletin}`);
  if (c.facts) p.push(`on file here: ${c.facts.join(', ')}`);
  if (c.noFacts) p.push(`not on file: ${c.noFacts.join(', ')}`);
  if (c.claims) p.push(`you said: ${c.claims.join(', ')}`);
  if (c.noClaims) p.push(`you did not say: ${c.noClaims.join(', ')}`);
  if (c.contactFree) p.push(`still unexposed: ${c.contactFree.join('/')}`);
  if (c.lastHours !== undefined) p.push(c.lastHours ? `${W.LAST_HOURS} h or less left` : `more than ${W.LAST_HOURS} h left`);
  if (c.holds) p.push(`you hold a document for ${c.holds}`);
  if (c.used) p.push(`already shown: ${c.used.join(', ')}`);
  if (c.flagged !== undefined) p.push(c.flagged ? 'a fact here is flagged' : 'nothing here flagged');
  if (c.fileSaid) p.push(`your file says: ${c.fileSaid.join('/')}`);
  if (c.fileNamed !== undefined) p.push(c.fileNamed ? 'your file names a contact' : 'your file names nobody');
  if (c.fileDisproved !== undefined) p.push(c.fileDisproved ? 'your file has a disproved claim' : 'nothing disproved on file');
  if (c.fileDeclared) p.push(`customs kept: ${c.fileDeclared.join('/')}`);
  if (c.any && isNoneOf(c)) p.push('the first pair caught');
  else if (c.any) p.push(`one of: ${c.any.map((x: any) => `(${cond(x) || 'always'})`).join(' or ')}`);
  if (c.not) p.push(`not (${cond(c.not)})`);
  const s = p.join('; ');
  conditions.push(s);
  return s;
}
const effText = (e: any): string => {
  if ('time' in e) return e.time < 0 ? `${e.time} h` : `+${e.time} h`;
  if ('scrutiny' in e) return `+${e.scrutiny} scrutiny (${e.reason})`;
  if ('fact' in e) return `on file: ${e.fact}`;
  if ('claim' in e) return `your claim: ${e.claim}`;
  if ('loseMedicine' in e) return 'medicine lost';
  if ('travel' in e) return `trip +${e.travel} h`;
  if ('send' in e) return `${e.send} to next desk${e.facts ? ': ' + e.facts.join(', ') : ''}`;
  return '?';
};
const chip = (e: any, label: string, when: string) => `<span class="e${'scrutiny' in e ? ' s' : 'time' in e ? ' t' : ''}">${esc(label)}${when ? ` <i>if ${esc(when)}</i>` : ''}</span>`;
/**
 * Effects as chips. Effects charged for "the first claim and fact pair caught" (firstCaught() in
 * encounters.ts) are folded into one chip per cost, listing the pairs, instead of one chip per pair.
 */
function effs(list: any[] = []): string {
  if (!list.length) return '<span class="e n">no cost</span>';
  const pairOf = (e: any) => (e.when?.claims?.length === 1 && e.when?.facts?.length === 1 && Object.keys(e.when).every((k) => ['claims', 'facts', 'any'].includes(k)) && (!e.when.any || isNoneOf(e.when)) ? `${e.when.claims[0]} vs ${e.when.facts[0]}` : undefined);
  const groups = new Map<string, { e: any; pairs: string[] }>();
  const plain: string[] = [];
  for (const e of list) {
    const pair = pairOf(e);
    if (!pair) { plain.push(chip(e, effText(e), e.when ? cond(e.when) : '')); continue; }
    const key = 'scrutiny' in e ? `+${e.scrutiny} scrutiny` : effText(e);
    const g = groups.get(key) ?? { e, pairs: [] };
    g.pairs.push(pair); groups.set(key, g);
  }
  const folded = [...groups].map(([label, g]) => chip(g.e, `${label} for the first pair caught`, g.pairs.join(', ')));
  return [...plain, ...folded].join(' ');
}
const kindName: Record<string, string> = { evidence: 'show a document', verify: 'let them check', contact: 'name a person', say: 'just say it', perk: 'traveler perk', withdraw: 'turn back' };

/** A card's text keys, split by answer id: the id can sit at any segment (`mark.family.label`, `hotelStay.hostStatement.review.label`). */
function cardText(prefix: string, approaches: any[]) {
  const ids = approaches.map((a) => a.id);
  const own: string[] = []; const by: Record<string, string[]> = {};
  for (const k of keysUnder(prefix)) {
    const rest = bare(k).slice(prefix.length).split('.');
    const a = rest.find((seg) => ids.includes(seg));
    (a ? (by[a] ??= []) : own).push(k);
  }
  return { own: own.map((k) => line(k, prefix)).join(''), ans: (id: string) => (by[id] ?? []).map((k) => line(k, prefix)).join('') };
}
function cardBox(id: string, title: string, meta: string, approaches: any[], prefix: string) {
  const ct = cardText(prefix, approaches);
  return `<div class="card"><div class="ch"><b>${esc(title)}</b> <code>${id}</code> ${badges(id)}</div>
  ${meta ? `<div class="meta">${meta}</div>` : ''}
  <div class="q">${ct.own}</div>
  <ol class="ans">${approaches.map((a) => `<li><div class="ah">${esc(kindName[a.kind] ?? a.kind)}${a.topic ? ` (${a.topic})` : ''}${a.contacts ? ` (${a.contacts.join(' / ')})` : ''}${a.check ? ` → opens check <b>${a.check}</b>` : ''}${a.reacts ? ` · officer reads it as <b>${a.reacts}</b>` : ''}</div>
    ${a.requires ? `<div class="meta">shown only if ${esc(cond(a.requires))}</div>` : ''}
    ${ct.ans(a.id)}<div class="fx">${effs(a.effects)}${a.ifVerified ? ` <i>· if already verified:</i> ${effs(a.ifVerified)}` : ''}</div></li>`).join('')}</ol></div>`;
}

// ── 1. Flow
const box = (h: string, b: string, cls = '') => `<div class="fb ${cls}"><div class="fh">${h}</div><div class="fbody">${b}</div></div>`;
const arrow = (l = '') => `<div class="ar">↓ ${esc(l)}</div>`;
const flow = `
<h1>1. How one crossing flows</h1>
<p class="lead">Every level uses the same screens and the same three desks. What changes per level is the goal text, which cards the desks deal, and a level rule. Words in <code>{braces}</code> are filled in during play.</p>
<div class="flow">
${box('Title screen', `${txt('ui.stamp')}<br><b>${txt('ui.title')}</b><br>${txt('ui.tagline')}<br>Buttons: [${txt('ui.start')}] · with a save: [${txt('ui.resume')}] [${txt('ui.newCrossing')}]`)}
${arrow('Begin')}
${box('Choose a crossing (level list)', `Shown only once more than one level is open. “${txt('ui.pickLevel')}”: ${LV.map((l) => `<b>${txt(l.title)}</b>: ${txt(l.blurb)}`).join(' · ')} Locked rows say “${txt('ui.levelOpensAfter')}”.`, 'opt')}
${arrow()}
${box('Departure only: Your file', `“${txt('ui.record.title')}”: what you said on Arrival, who you named, what customs kept. [${txt('ui.record.continue')}] or [${txt('ui.record.standalone')}] (${txt('ui.record.standaloneNote')}).`, 'opt')}
${arrow()}
${box('Setup 1: Choose your traveler', `Premise: “${txt('ui.premise')}” · “${txt('ui.pickCharacter')}”: ${W.CHARACTER_IDS.map((c) => `<b>${txt(`char.${c}.name`)}</b> (${txt(`char.${c}.role`)}): ${txt(`char.${c}.blurb`)} Advantage: ${txt(`char.${c}.advantage`)} Complication: ${txt(`char.${c}.complication`)}`).join(' · ')}<br>[${txt('ui.continueAs')}]`)}
${arrow()}
${box('Setup 2: Pack your documents', `“${txt('ui.prepareDocuments')}”: ${W.CHARACTER_IDS.map((c) => `${en[`char.${c}.name`]} packs ${W.CHARACTERS[c].evidenceSlots}`).join(', ')} of ${W.EVIDENCE_IDS.length} documents. Today's bulletin warns what the desks check today (one of ${W.BULLETINS.join(', ')}).`)}
${arrow()}
${box('Setup 3: Before you cross', `“${txt('ui.beforeYouCross')}”: ${txt('ui.lastBus.other')} ${txt('ui.allowTravel.other')} [${txt('ui.beginCrossing')}] or [${txt('ui.changeDocuments')}]`)}
${arrow('queue scene, phone messages, then up to the desk')}
${box('Desk 1: Passport control', 'Two core cards always, then at most one follow-up on an open issue. A caught lie deals a challenge card before you leave the desk. You may turn back while in the passport queue.', 'desk')}
${arrow()}
${box('Desk 2: Customs', 'Same pattern: two core cards, then a follow-up or a breather.', 'desk')}
${arrow()}
${box('Desk 3: Interview', 'Same pattern. Some answers open a check: you wait in the waiting room while the result comes back, and it can deal a follow-up card.', 'desk')}
${arrow(`at Scrutiny ${W.MAX_SCRUTINY}/${W.MAX_SCRUTINY} at any point`)}
${box('Secondary inspection', `A supervisor takes you aside. Each answer costs something different: time, the medicine, a document, a person. Scrutiny drops back to ${W.SCRUTINY_AFTER_INSPECTION} after.`, 'opt')}
${arrow()}
${box('Admission and spot-check', `Before you are let through, a spot-check can test one thing you said. Then “${txt('finish.reaction')}”`)}
${arrow()}
${box('Ending', 'Whether you made the last bus with time to spare, who you exposed, what happened to the medicine. Then a later beat: what the file you left behind did afterwards. Finishing a level opens the next one.')}
</div>
<h2>The two numbers that decide a run</h2>
<p><b>Time:</b> you start with ${W.START_TIME} hours until the last bus and need ${W.MISSION_MIN_TIME} hours left for the trip after the border. Checks, calls and waits spend hours. <b>Scrutiny:</b> starts at 0 (Mark at ${W.CHARACTERS.mark.startScrutiny}), max ${W.MAX_SCRUTINY}. ${txt('ui.scrutinyHelp.what')} ${txt('ui.scrutinyHelp.max')}</p>
<p><b>Lies:</b> what you say becomes a claim. If a fact on file speaks against it, a challenge card catches it before you leave the desk.</p>
<p><b>Contradictions</b> (challenge card i_contradiction), claim vs fact: ${CONTRADICTIONS.map(([c, f]) => `${c} vs ${f}`).join(', ')}.</p>
<p><b>Inconsistencies</b> (i_clarify, cheaper to explain): ${INCONSISTENCIES.map(([c, f]) => `${c} vs ${f}`).join(', ')}.</p>`;

// ── 2. Levels
const deskIds = ['passport', 'customs', 'interview', 'followup'] as const;
const levels = `<h1>2. The levels</h1>
<table><tr><th>Level</th><th>Story</th><th>Mission on screen</th><th>Desk openers</th><th>Rule</th></tr>
${LV.map((l) => `<tr><td><b>${l.number}. ${txt(l.title)}</b></td><td>${txt(l.blurb)}</td><td><b>${txt(l.goalTitle)}</b><br>${txt(l.goalBody)}</td>
<td>${Object.entries(l.core ?? CORE_CARDS).map(([d, c]) => `${d}: ${c.join(', ')}`).join('<br>')}</td>
<td>${l.rules.length ? l.rules.map((r) => r.id).join(', ') : 'none'}${l.readsFile ? '<br>desks read your Arrival file' : ''}${l.statements ? `<br>a contact statement on file: ${l.statements.join(' or ')}` : ''}</td></tr>`).join('')}</table>
<h3>Every card each level can deal</h3>
<table><tr><th>Level</th>${deskIds.map((d) => `<th>${d}</th>`).join('')}<th>inspections</th></tr>
${LV.map((l) => `<tr><td><b>${txt(l.title)}</b></td>${deskIds.map((d) => `<td>${ENCOUNTERS.filter((e) => e.checkpoint === d && dealsCard({ level: l.id }, e.id)).map((e) => e.id).join(', ')}</td>`).join('')}<td>${INSPECTIONS.filter((i) => dealsCard({ level: l.id }, i.id)).map((i) => i.id).join(', ')}</td></tr>`).join('')}</table>
${LV.filter((l) => Object.keys(en).some((k) => levelOf(k) === l.id)).map((l) => `<h3>${txt(l.title)}: its own wording</h3>${Object.keys(en).filter((k) => levelOf(k) === l.id).map((k) => `<div class="tl"><code>${esc(bare(k))}</code> ${txt(k)}</div>`).join('')}`).join('')}`;

// ── 3. Desks
const deskName: Record<string, string> = { passport: 'Passport control', customs: 'Customs', interview: 'Interview', followup: 'Follow-ups after a check' };
const order = (e: any) => (e.opening ? 0 : e.kind === 'routine' ? 1 : e.kind === 'related' ? 2 : 3);
const challengeMeta: Record<string, string> = { i_contradiction: 'dealt when any contradiction from section 1 is open', i_clarify: 'dealt when any inconsistency from section 1 is open' };
const desks = deskIds.map((d, i) => {
  const cards = ENCOUNTERS.filter((e) => e.checkpoint === d).sort((a, b) => order(a) - order(b) || (b.priority ?? 0) - (a.priority ?? 0));
  const officer = d === 'followup' ? undefined : W.OFFICERS[d];
  const core = d === 'followup' ? undefined : CORE_CARDS[d];
  const lane = core ? `<div class="lane">${[`core 1: ${core[0]}`, `core 2: ${core[1]}`, 'one follow-up (highest priority whose issue is open) or a calm breather', 'challenge card if a lie is caught'].map((x) => `<span>${esc(x)}</span>`).join('<b>→</b>')}</div>` : '';
  return `<h1 class="${i === 3 ? '' : 'pb'}">3${'abcd'[i]}. ${deskName[d]}</h1>
  ${officer ? `<p class="lead">${txt(`officer.${d}`)}: ${txt(`officer.${d}.priority`)} · writes down: ${officer.writesDown.join(', ') || 'nothing'}</p>` : ''}${lane}
  ${cards.map((e) => cardBox(e.id, `${e.kind}${e.calm ? ' (calm)' : ''}${e.opening ? ' · opens the desk' : ''}`,
    [e.topic && `topic: ${e.topic}`, e.priority && `priority ${e.priority}`,
      (CHALLENGES as readonly string[]).includes(e.id) ? challengeMeta[e.id] : e.when && `dealt only if ${cond(e.when)}`,
      !(CHALLENGES as readonly string[]).includes(e.id) && e.issue && `about the open issue: ${cond(e.issue)}`].filter(Boolean).map((x) => esc(String(x))).join(' · '),
    e.approaches, `enc.${e.id}.`)).join('')}`;
}).join('');

// ── 4-5. Checks and inspections
const checks = `<h1 class="pb">4. Checks (the waiting room)</h1><p class="lead">An answer that opens a check sends you to wait. The first matching case decides the result.</p>
${Object.values(CHECKS).map((c) => `<div class="card"><div class="ch"><b>${c.id}</b> ${c.topic ? `· a contact who can confirm ${c.topic} may vouch` : '· nobody can vouch'}</div>
<ol class="ans">${c.cases.map((x) => `<li><div class="ah">${x.when ? 'if ' + esc(cond(x.when)) : 'otherwise'} → result <b>${x.result}</b>${x.followUp ? ` → follow-up card <b>${x.followUp}</b>` : ''}</div><div class="fx">${effs(x.effects)}</div></li>`).join('')}</ol>
${c.explain ? `<div class="meta">Explain first: ${effs(c.explain)}</div>` : ''}
<div class="q">${lines(`check.${c.id}.`)}</div></div>`).join('')}
<h1>5. Secondary inspections</h1><p class="lead">Dealt at Scrutiny ${W.MAX_SCRUTINY}/${W.MAX_SCRUTINY}, in the supervisor's order. Each is about one open point on your file.</p>
${INSPECTIONS.map((i) => cardBox(i.id, `${i.kind} inspection`, esc([`about: ${i.issue}`, i.when && `dealt only if ${cond(i.when)}`].filter(Boolean).join(' · ')), i.approaches, `insp.${i.id}.`)).join('')}`;

// ── 6. Setup content and the glossary of ids
const setup = `<h1 class="pb">6. Travelers, documents and the glossary</h1>
<table><tr><th>Traveler</th><th>Text</th><th>Rules</th></tr>${W.CHARACTER_IDS.map((c) => { const ch = W.CHARACTERS[c]; return `<tr><td><b>${txt(`char.${c}.name`)}</b></td><td>${lines(`char.${c}.`)}</td>
<td>${ch.evidenceSlots} documents · start scrutiny ${ch.startScrutiny} · backgrounds: ${ch.background.join(', ')} · contacts: ${ch.contacts.join(', ')} (protect ${ch.protectedContact}) · perk: ${ch.perkTopics.join(', ') || '-'} · weak: ${ch.weakTopics.join(', ') || '-'}${ch.onFile ? ` · on file from the start: ${ch.onFile.join(', ')}` : ''}</td></tr>`; }).join('')}</table>
<h3>Documents</h3><table><tr><th>Document</th><th>Text</th><th>Covers</th></tr>${W.EVIDENCE_IDS.map((id) => { const ev = W.EVIDENCE[id]; return `<tr><td><b>${id}</b></td><td>${lines(`ev.${id}.`)}</td><td>${ev.topics.join(', ')}<br>${effs(ev.onUse)}${ev.blockedBy ? `<br><i>not usable if ${esc(cond(ev.blockedBy))}</i>` : ''}</td></tr>`; }).join('')}</table>
<p class="lead">The ids used on every card (familyAddress, stayingWithFamily, ...) are listed below with the words the player sees for them.</p>
${['fact.', 'claim.', 'said.', 'bg.', 'contact.', 'bulletin.', 'topic.', 'reading.', 'known.'].map((p) => `<h3>${p.slice(0, -1)}</h3>${lines(p)}`).join('')}`;

// ── 7. Story text: queues, messages, endings, later
const story = `<h1 class="pb">7. Queues, messages, endings and what happens later</h1>
${['queue.', 'msg.', 'beat.', 'wait.', 'scene.', 'spot.', 'caught.', 'calledIn.', 'turnBack.', 'finish.', 'exposure.', 'ending.', 'later.', 'change.', 'file.', 'mission.', 'level.', 'desk.', 'checkpoint.', 'weak.'].map((p) => { const ks = lines(p, (k) => !used.has(k)); return ks ? `<h3>${p.slice(0, -1)}</h3>${ks}` : ''; }).join('')}`;

// ── 8. All remaining text
const rest = Object.keys(en).filter((k) => !used.has(k));
const remaining = `<h1>8. All other screen text</h1><p class="lead">Buttons, labels and help text not shown above (${rest.length} lines).</p>${rest.map((k) => line(k)).join('')}`;

// ── 9. Planned levels, from bd: the deferred children of the levels plan.
const LEVEL_PLAN = 'border_crossing_game-rwf';
function plannedLevels(): string {
  const bd = (...a: string[]) => JSON.parse(execFileSync('bd', [...a, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  try {
    const kids = (bd('list', '--parent', LEVEL_PLAN, '--status', 'deferred', '--limit', '0') as any[]);
    const md = (s: string) => esc(s || '').replace(/^## (.*)$/gm, '<h4>$1</h4>').replace(/\n\n/g, '<br><br>');
    return kids.map((k) => { const b = bd('show', k.id)[0]; return `<div class="card"><div class="ch"><b>${esc(b.title)}</b> <code>${esc(b.id.replace('border_crossing_game-', ''))}</code> <span class="b off">${esc(b.status)}</span></div><div class="q">${md(b.description)}</div></div>`; }).join('') || '<p>No deferred levels in bd.</p>';
  } catch {
    return `<p>bd was not available when this map was built, so the planned levels (deferred children of ${LEVEL_PLAN}) are not listed.</p>`;
  }
}
const planned = `<h1 class="pb">9. Levels still to come</h1><p class="lead">The deferred beads of the levels plan in bd, with their descriptions. Order is not decided yet.</p>${plannedLevels()}`;

const total = Object.keys(en).length;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Purpose of Visit game map</title><style>
@page{size:A4}body{font:9.5pt/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#1c1c1c}
h1{font-size:17pt;margin:14px 0 6px;color:#7a3e00}h2{font-size:12pt;margin:14px 0 4px}h3{font-size:10.5pt;margin:12px 0 3px;color:#7a3e00}h4{margin:6px 0 2px;font-size:9.5pt}
.pb{page-break-before:always}h1,h2,h3,h4,.lead,.lane{break-after:avoid}.lead{color:#444}code{font:8pt Menlo,monospace;color:#6b6b6b}
.cover{height:250mm;display:flex;flex-direction:column;justify-content:center}.cover h1{font-size:30pt}
.flow{display:flex;flex-direction:column;align-items:center}.fb{width:82%;border:1.5px solid #333;border-radius:6px;padding:5px 9px;page-break-inside:avoid;background:#fffaf2}
.fb.opt{border-style:dashed;background:#fff}.fb.desk{background:#eef4fb;border-color:#2a5d8f}.fh{font-weight:700;margin-bottom:2px}.ar{color:#7a3e00;font-weight:700;margin:2px 0}
.lane{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:6px 0 10px}.lane span{border:1px solid #2a5d8f;background:#eef4fb;border-radius:4px;padding:3px 6px}.lane b{color:#2a5d8f}
.card{border:1px solid #bbb;border-radius:6px;padding:6px 9px;margin:8px 0;page-break-inside:avoid}.ch{border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:3px}
.meta{color:#555;font-size:8.5pt;margin:2px 0}.q .tl{font-weight:600}.ans{margin:4px 0 0 16px;padding:0}.ans li{margin:4px 0}.ah{font-size:8.5pt;color:#2a5d8f;font-weight:600}
.tl{margin:1px 0}.fx{margin-top:2px}.e{display:inline-block;font-size:8pt;border-radius:3px;padding:0 4px;margin:1px 2px 1px 0;background:#eee}.e.s{background:#fde2e2}.e.t{background:#fff0c8}.e.n{background:#e3f5e1}
.b{font-size:7.5pt;border-radius:3px;padding:0 4px;margin-left:2px}.b.on{background:#2a5d8f;color:#fff}.b.off{background:#eee;color:#999;text-decoration:line-through}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top;text-align:left;font-size:8.5pt}th{background:#f3efe8}tr{page-break-inside:avoid}
</style></head><body>
<div class="cover"><h1>Purpose of Visit</h1><h2>Game map: every step, text and option</h2>
<p>Built ${today} from the game's own content files, branch ${esc(branch)}, commit ${esc(commit)}. The live game is https://yurykorzun.github.io/border_crossing_game/</p>
<p>${ENCOUNTERS.length} desk cards, ${INSPECTIONS.length} inspections, ${Object.keys(CHECKS).length} checks, ${LV.length} levels, ${total} lines of English text, all of them in this map.</p>
<p><b>Legend:</b> <span class="b on">Arrival</span> the card is dealt in that level, <span class="b off">Departure</span> not dealt there. <span class="e t">-1 h</span> time cost, <span class="e s">+1 scrutiny</span> scrutiny with its reason, <span class="e n">no cost</span>. Grey code before a line is its text key.</p>
<p><b>Reading the keys:</b> <code>q</code> the question, <code>label</code> the answer button, <code>reaction</code> what the officer does, <code>event</code> what the hours are spent on, <code>detail</code> a longer line under the answer. A name in the key replaces the default line in that case: <code>mark.</code> for Mark, <code>bulletin.records.</code> on that bulletin's day, <code>verified.</code> when the point was already verified, <code>unsaid.</code> / <code>phoned.</code> for that situation, a claim and fact pair (<code>hotelStay.hostStatement.</code>) for that lie. “Departure wording” replaces the default in that level. Ids like familyAddress are explained in section 6.</p>
<p><b>Contents:</b> 1 Flow · 2 Levels · 3 The three desks and follow-ups · 4 Checks · 5 Inspections · 6 Travelers, documents, glossary · 7 Queues, messages, endings · 8 Other screen text · 9 Levels still to come</p></div>
<div class="pb">${flow}</div><div class="pb">${levels}</div>${desks}${checks}${setup}${story}${remaining}${planned}</body></html>`;

const left = Object.keys(en).filter((k) => !used.has(k));
const long = conditions.filter((c) => c.length > MAX_CONDITION);
const dir = mkdtempSync(join(tmpdir(), 'game-map-'));
writeFileSync(join(dir, 'map.html'), html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + join(dir, 'map.html'));
await page.pdf({
  path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:7pt;width:100%;text-align:center;color:#888">Purpose of Visit game map · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
});
await browser.close();
const pages = (readFileSync(out).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log(`map: ${out}\n  ${pages} pages, ${total} text lines, ${left.length} left out, longest condition ${Math.max(0, ...conditions.map((c) => c.length))} chars, html ${join(dir, 'map.html')}`);
if (left.length) console.error(`map: FAIL ${left.length} lines of en.ts not in the map: ${left.slice(0, 10).join(', ')}`);
if (long.length) console.error(`map: FAIL ${long.length} conditions over ${MAX_CONDITION} chars, first: ${long[0].slice(0, 200)}...`);
process.exit(left.length || long.length ? 1 : 0);
