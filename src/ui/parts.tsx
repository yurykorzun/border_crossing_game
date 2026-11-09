// Shared pieces: top strip, cost chips, the bottom sheets (story, evidence, scrutiny, settings).
// Everything reads RunState; nothing here changes it.

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { t, tn } from '../i18n';
import type { Option } from '../game/engine';
import type { RunState } from '../game/types';
import type { Settings } from '../game/save';
import { CHECKPOINTS } from '../game/types';
import { CHARACTERS, MAX_SCRUTINY, SCRUTINY_AFTER_INSPECTION, START_TIME } from '../game/content/world';
import { Portrait } from './art/Portrait';
import { Icon } from './art/icons';

export function TopStrip({ s, onScrutiny }: { s: RunState; onScrutiny: () => void }) {
  const level = Math.min(s.scrutiny, MAX_SCRUTINY);
  const now = Math.min(s.checkpoint, CHECKPOINTS.length - 1);
  const hours = tn('ui.hours', s.time);
  const count = t('ui.progressCount', { n: now + 1, total: CHECKPOINTS.length });
  const left = Math.max(0, Math.min(s.time, START_TIME)) / START_TIME;
  return (
    <header className="strip" aria-label={t('ui.yourCrossing')}>
      <p className="goal">{t('ui.goal')}</p>
      <div className="strip-stats">
        <span className="stat time">
          <Icon name="clock" />
          <span className="stat-label hours">{pickOut(t('ui.hoursLeft', { hours }), hours)}</span>
        </span>
        <span className="strip-divider" aria-hidden />
        {/* A button, not a readout: the word "Noticed" never said what scrutiny does, the sheet does. */}
        <button className={`scrutiny lvl-${level}`} aria-haspopup="dialog" onClick={onScrutiny}>
          <Icon name="flag" />
          <span className="scrutiny-text">{t('ui.scrutinyCount', { n: level, max: MAX_SCRUTINY })}</span>
        </button>
      </div>
      <div className="time-bar" aria-hidden><i style={{ width: `${left * 100}%` }} /></div>
      {/* In the queue the checkpoint is not named yet: it shows once you reach the officer. */}
      <p className="progress-label">{pickOut(t('ui.progress', { count, name: progressName(s) }), count)}</p>
    </header>
  );
}

/** The text with its first `part` in amber, so the number reads first and the words stay one t() string. */
function pickOut(text: string, part: string): ReactNode {
  const at = text.indexOf(part);
  if (at < 0) return text;
  return <>{text.slice(0, at)}<span className="amber">{part}</span>{text.slice(at + part.length)}</>;
}

/** The name after "1 / 3 ·" in the strip. chromeLines() in src/game/transcript.ts mirrors it. */
function progressName(s: RunState): string {
  return s.screen.kind === 'between' && !s.reaction
    ? t('ui.inQueue')
    : t(`checkpoint.${CHECKPOINTS[Math.min(s.checkpoint, CHECKPOINTS.length - 1)]}`);
}

export function ScrutinyContent({ s }: { s: RunState }) {
  return (
    <>
      <p className="sheet-lead">{t('ui.scrutinyCount', { n: Math.min(s.scrutiny, MAX_SCRUTINY), max: MAX_SCRUTINY })}</p>
      <p>{t('ui.scrutinyHelp.what')}</p>
      <p>{t('ui.scrutinyHelp.rise')}</p>
      <p>{t('ui.scrutinyHelp.max', { max: MAX_SCRUTINY, after: SCRUTINY_AFTER_INSPECTION })}</p>
    </>
  );
}

export function SettingsContent({ settings, onChange }: { settings: Settings; onChange: (next: Settings) => void }) {
  const row = (key: keyof Settings, label: string) => (
    <label className="setting">
      <input type="checkbox" checked={settings[key]} onChange={(e) => onChange({ ...settings, [key]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <div className="settings">
      {row('reduceWait', t('ui.reduceWait'))}
      {row('sound', t('ui.sound'))}
      {row('reduceMotion', t('ui.reduceMotion'))}
    </div>
  );
}

export function CostChips({ o }: { o: Option }) {
  const chips: { text: string; tone: 'time' | 'risk' | 'info' | 'person' }[] = [];
  const a = o.approach;
  if (a.kind === 'perk') chips.push({ text: t('ui.cost.perk'), tone: 'info' });
  if (o.card) chips.push({ text: t('ui.cost.uses', { card: o.card }), tone: 'info' });
  if (o.contact) chips.push({ text: t('ui.cost.exposes', { contact: o.contact }), tone: 'person' });
  // Time and scrutiny are summed, so a weakness reads "-2 hours", not "-1 hour -1 hour".
  let time = 0;
  let scrutiny = 0;
  for (const e of o.effects) {
    if ('time' in e) time += e.time;
    else if ('scrutiny' in e) scrutiny += e.scrutiny;
  }
  if (time) chips.push({ text: tn('ui.cost.time', time), tone: 'time' });
  if (scrutiny) chips.push({ text: t('ui.cost.scrutiny', { n: scrutiny }), tone: 'risk' });
  for (const e of o.effects) {
    if ('loseMedicine' in e) chips.push({ text: t('ui.cost.medicine'), tone: 'risk' });
    else if ('fact' in e) chips.push({ text: t('ui.cost.fact', { fact: e.fact }), tone: 'info' });
    else if ('claim' in e) chips.push({ text: t('ui.cost.claim', { claim: e.claim }), tone: 'info' });
  }
  if (a.check) chips.push({ text: t('ui.cost.check'), tone: 'info' });
  if (a.kind === 'withdraw') chips.push({ text: t('ui.cost.withdraw'), tone: 'risk' });
  if (o.blocked) return <span className="chips"><span className="chip blocked">{t(`ui.blocked.${o.blocked}`)}</span></span>;
  if (!chips.length) chips.push({ text: t('ui.cost.free'), tone: 'info' });
  return (
    <span className="chips">
      {chips.map((c, i) => <span key={i} className={`chip ${c.tone}`}>{c.text}</span>)}
    </span>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="sheet-body">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="close" onClick={onClose}>{t('ui.close')}</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function StoryContent({ s }: { s: RunState }) {
  const ch = CHARACTERS[s.character];
  return (
    <>
      <div className="who">
        <Portrait id={ch.id} className="portrait-small" />
        <p><strong>{t(`char.${ch.id}.name`)}</strong> · {t(`char.${ch.id}.blurb`)}</p>
      </div>
      <h3>{t('ui.background')}</h3>
      <ul className="facts">{ch.background.map((b) => <li key={b}>{t(`bg.${b}`)}</li>)}</ul>
      <h3>{t('ui.contacts')}</h3>
      <ul className="people">
        {ch.contacts.map((c) => (
          <li key={c} className={s.exposed.includes(c) ? 'exposed' : ''}>
            <span>{t(`contact.${c}`)}</span>
            {c === ch.protectedContact && <span className="tag">{t('ui.protected')}</span>}
            {s.exposed.includes(c) && <span className="tag risk">{t('ui.exposed')}</span>}
            <small>{t(`contact.${c}.note`)}</small>
          </li>
        ))}
      </ul>
      {/* Side by side on purpose: Pope's phone port lost this overview in a carousel. */}
      <div className="two-col">
        <section>
          <h3>{t('ui.claims')}</h3>
          {s.claims.length ? <ul className="record">{s.claims.map((c) => <li key={c}>{t(`claim.${c}`)}</li>)}</ul> : <p className="muted">{t('ui.nothingYet')}</p>}
        </section>
        <section>
          <h3>{t('ui.onFile')}</h3>
          {s.facts.length ? <ul className="record">{s.facts.map((f) => <li key={f}>{t(`fact.${f}`)}</li>)}</ul> : <p className="muted">{t('ui.nothingYet')}</p>}
        </section>
      </div>
    </>
  );
}

export function EvidenceContent({ s }: { s: RunState }) {
  return (
    <ul className="cards">
      {s.loadout.map((id) => (
        <li key={id} className={`doc ${s.used.includes(id) ? 'used' : ''}`}>
          <strong>{t(`ev.${id}.name`)}</strong>
          {s.used.includes(id) && <span className="tag">{t('ui.used')}</span>}
          <p>{t(`ev.${id}.desc`)}</p>
        </li>
      ))}
      <li className={`doc mission-item ${s.medicine ? '' : 'used'}`}>
        <strong>{t(s.medicine ? 'ui.medicine' : 'ui.medicineLost')}</strong>
      </li>
    </ul>
  );
}
