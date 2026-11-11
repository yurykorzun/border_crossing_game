// Shared pieces: top strip, consequence line, the bottom sheets (story, evidence, scrutiny, settings).
// Everything reads RunState; nothing here changes it.

import { Fragment, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { andList, own, t, tn } from '../i18n';
import { deskOf, factIds, factTier, loggedAt, shownCheckpoint, travelOf } from '../game/engine';
import type { Option } from '../game/engine';
import { SEPARATOR, consequence } from '../game/consequence';
import type { Part } from '../game/consequence';
import type { ChangeLine, RunState } from '../game/types';
import type { Settings } from '../game/save';
import { CHECKPOINTS } from '../game/types';
import { CHARACTERS, MAX_SCRUTINY, SCRUTINY_AFTER_INSPECTION } from '../game/content/world';
import { levelOf } from '../game/content/levels';
import { messagesSoFar } from '../game/content/queues';
import type { QueueBeat } from '../game/content/queues';
import { Portrait } from './art/Portrait';
import { Icon } from './art/icons';

export function TopStrip({ s, onScrutiny }: { s: RunState; onScrutiny: () => void }) {
  const level = Math.min(s.scrutiny, MAX_SCRUTINY);
  const now = shownCheckpoint(s);
  const hours = tn('ui.hours', s.time);
  const count = t('ui.progressCount', { n: now + 1, total: CHECKPOINTS.length });
  const start = levelOf(s).startTime;
  const left = Math.max(0, Math.min(s.time, start)) / start;
  // The hours the trip to the bus needs: once the bar runs past this mark, the last bus is gone.
  const travel = Math.max(0, Math.min(travelOf(s), start));
  const reserve = travel / start;
  return (
    <header className="strip" aria-label={t('ui.yourCrossing')}>
      <p className="goal">{t('ui.goal')}</p>
      {/* Checkpoint and phase on one line. In the queue the checkpoint is not named yet: it shows once you reach the officer. */}
      <p className="progress-label">{pickOut(t('ui.progress', { count, name: progressName(s) }), count)}</p>
      <div className="strip-stats">
        {/* The time bar belongs to the clock, so it reads as hours to the bus and not as progress. */}
        <span className="stat time">
          <span className="clock-line">
            <Icon name="clock" />
            <span className="stat-label hours">{pickOut(t('ui.untilLastBus', { hours }), hours)}</span>
          </span>
          <span className="time-bar" aria-hidden>
            <i style={{ width: `${left * 100}%` }} />
            <b className="reserve" style={{ left: `${reserve * 100}%` }} />
          </span>
          {/* The white mark's label. It slides with the mark but stays inside the bar's width. */}
          <span className="reserve-label" style={{ left: `${reserve * 100}%`, transform: `translateX(-${reserve * 100}%)` }}>
            {t('ui.travelReserve', { hours: tn('ui.hours', travel) })}
          </span>
        </span>
        {/* An outlined button with an info icon: it opens the scrutiny sheet, which says what scrutiny does. */}
        <button className={`scrutiny lvl-${level}`} aria-haspopup="dialog" onClick={onScrutiny}>
          <Icon name="info" />
          <span className="scrutiny-text">{t('ui.scrutinyCount', { n: level, max: MAX_SCRUTINY })}</span>
        </button>
      </div>
    </header>
  );
}

/** The text with its first `part` in amber, so the number reads first and the words stay one t() string. */
/** pickOut() as a component, for the setup screens' "2 / 3 · Preparation". */
export function PickOut({ text, part }: { text: string; part: string }) {
  return <>{pickOut(text, part)}</>;
}

function pickOut(text: string, part: string): ReactNode {
  const at = text.indexOf(part);
  if (at < 0) return text;
  return <>{text.slice(0, at)}<span className="amber">{part}</span>{text.slice(at + part.length)}</>;
}

/** The name after "1 / 3 ·" in the strip. chromeLines() in src/game/transcript.ts mirrors it. */
function progressName(s: RunState): string {
  if (s.screen.kind === 'between' && !s.reaction) return t('ui.inQueue');
  const name = t(`checkpoint.${CHECKPOINTS[shownCheckpoint(s)]}`);
  return s.screen.kind === 'inspection' ? t('ui.inInspection', { name }) : name;
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

/** The settings toggles, then Start over when a run is going: it drops the run and keeps endings and settings (startOver() in src/game/save.ts). */
export function SettingsContent({ settings, onChange, onStartOver }: { settings: Settings; onChange: (next: Settings) => void; onStartOver?: () => void }) {
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
      {onStartOver && (
        <div className="start-over">
          <button type="button" className="choice start-over-button" onClick={onStartOver}>{t('ui.startOver')}</button>
          <p className="muted">{t('ui.startOverNote')}</p>
        </div>
      )}
    </div>
  );
}

/** One icon and one plain line under an answer: what it costs now or puts at risk. */
export function ConsequenceLine({ o, cardKey, s }: { o: Option; cardKey: string; s: RunState }) {
  const c = consequence(o, cardKey, CHARACTERS[s.character].protectedContact, deskOf(s), s);
  return (
    <span className={`consequence ${o.blocked ? 'blocked' : ''}`}>
      <Icon name={c.icon} />
      <span className="consequence-text">
        {c.parts.map((p, i) => (
          <Fragment key={p.kind + i}>
            {i > 0 && SEPARATOR}
            <span className={`part ${p.tone}`}>{partText(p)}</span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}

const partText = (p: Part) => (p.n === undefined ? t(p.key, p.vars) : tn(p.key, p.n, p.vars));

/** Under the officer's reaction: one plain line per thing that changed ("1 hour lost."). */
export function ChangeLines({ changes }: { changes: ChangeLine[] }) {
  if (!changes.length) return null;
  return (
    <ul className="changes">
      {changes.map((c, i) => (
        <li key={c.key + i} className={`change ${c.tone}`}>{c.n === undefined ? t(c.key, c.vars) : tn(c.key, c.n, c.vars)}</li>
      ))}
    </ul>
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

/**
 * My story during a crossing: the records first (what you said, what is on file), then the
 * people, then the traveler's biography. Every section is one full-width column, because two
 * columns wrapped every line at 390 px (2026-11-09 screenshot review). Nothing is in a
 * carousel: Pope's phone port lost this overview that way.
 */
export function StoryContent({ s, messages = messagesSoFar(s) }: { s: RunState; messages?: readonly QueueBeat[] }) {
  const ch = CHARACTERS[s.character];
  return (
    <>
      <StoryRecords s={s} />
      {/* The queue shows one message at a time, so the earlier ones (the warning about the protected contact) are kept here. */}
      <section className="story-section">
        <h3>{t('ui.messages')}</h3>
        {messages.length ? (
          <ul className="messages">
            {messages.map((b) => (
              <li key={b.key} className="msg" data-msg={b.key}>
                {b.from && <span className="msg-from">{t(`msg.from.${b.from}`)}</span>}
                {t(b.key)}
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('ui.nothingYet')}</p>}
      </section>
      <section className="story-section">
        <h3>{t('ui.contacts')}</h3>
        <ul className="people">
          {ch.contacts.map((c) => (
            <li key={c} className={s.exposed.includes(c) ? 'exposed' : ''}>
              <span>{t(`contact.${c}`)}</span>
              {c === ch.protectedContact && <span className="tag">{t('ui.protected')}</span>}
              {s.exposed.includes(c) && <span className="tag risk">{t('ui.exposed')}</span>}
              <small>{t(`contact.${c}.note`)}</small>
              <small className="can">{t(`contact.${c}.can`)}</small>
            </li>
          ))}
        </ul>
      </section>
      <section className="story-section">
        <h3>{t('ui.background')}</h3>
        <div className="who">
          <Portrait id={ch.id} className="portrait-small" />
          <p><strong>{t(`char.${ch.id}.name`)}</strong> · {t(`char.${ch.id}.blurb`)}</p>
        </div>
        <ul className="facts">{ch.background.map((b) => <li key={b}>{t(`bg.${b}`)}</li>)}</ul>
      </section>
    </>
  );
}

/**
 * Your answers, then Information recorded, each item with a line naming the desks that have it,
 * so the player can scan who knows what. The ending's Border records sheet shows only these.
 */
export function StoryRecords({ s }: { s: RunState }) {
  const desks = (ds: readonly string[]) => andList(ds.map((d) => t(`checkpoint.${d}`)));
  return (
    <>
      <section className="story-section">
        <h3>{t('ui.claims')}</h3>
        {/* A claim an officer wrote down names the desks that have it, so a later contradiction is fair. */}
        {s.claims.length ? (
          <ul className="record">
            {s.claims.map((c) => {
              const at = loggedAt(s, c);
              return (
                <li key={c} data-claim={c} className={at.length ? 'logged' : 'said'}>
                  <span>{t(own(`claim.${c}`, s.character))}</span>
                  <small className="desks">{at.length ? t('ui.recordedAt', { desks: desks(at) }) : t('ui.saidAloud')}</small>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">{t('ui.nothingYet')}</p>}
      </section>
      <section className="story-section">
        <h3>{t('ui.onFile')}</h3>
        {/* Each fact with the desks that know it: officials share only through a channel. */}
        {factIds(s).length ? (
          <ul className="record">
            {factIds(s).map((f) => {
              const at = s.facts[f] ?? [];
              return (
                <li key={f} data-fact={f} data-tier={factTier(s, f)}>
                  <span>{t(`fact.${f}`)}</span>
                  <small className="tier">{t(`ui.tier.${factTier(s, f)}`)}</small>
                  <small className="desks">{tn('ui.haveOnFile', at.length, { desks: desks(at) })}</small>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">{t('ui.nothingYet')}</p>}
      </section>
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
