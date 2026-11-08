// Screens. The game state lives in one useState; every change goes through
// step() from src/game/engine.ts and is autosaved.
// ?autoplay=<style> (honest, liar, cautious, random, situational) instead plays
// one bot run on screen, one step a second, and saves nothing. &seed=<n> picks the run.

import { useEffect, useMemo, useState } from 'react';
import { has, t } from './i18n';
import { endingFor, newRun, options, step, waitActions } from './game/engine';
import { botAction, botSeed, isBotStyle, setupFor } from './game/bots';
import type { BotStyle } from './game/bots';
import type { Option } from './game/engine';
import { CHECKS } from './game/content/encounters';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, MISSION_MIN_TIME, START_TIME } from './game/content/world';
import { browserStore, load, save } from './game/save';
import type { SaveData } from './game/save';
import type { Action, BulletinId, CharacterId, EvidenceId, RunState } from './game/types';
import { CHECKPOINTS } from './game/types';
import { CostChips, EvidenceContent, ScrutinyContent, SettingsContent, Sheet, StoryContent, TopStrip } from './ui/parts';
import * as sound from './ui/sound';

const store = browserStore();

export default function App() {
  const style = new URLSearchParams(window.location.search).get('autoplay');
  return isBotStyle(style) ? <Autoplay style={style} /> : <Game />;
}

function Game() {
  const [data, setData] = useState<SaveData>(() => load(store));
  const [setup, setSetup] = useState<{ bulletin: BulletinId; seed: number } | null>(null);

  useEffect(() => save(store, data), [data]);
  useEffect(() => sound.setMuted(!data.settings.sound), [data.settings.sound]);

  const run = data.run;
  const dispatch = (a: Action) => {
    if (!run) return;
    if (a.type === 'choose') sound.stamp();
    const next = step(run, a);
    setData((d) => ({
      ...d,
      run: next,
      endingsSeen: next.ending && !d.endingsSeen.includes(next.ending) ? [...d.endingsSeen, next.ending] : d.endingsSeen,
    }));
  };

  const startSetup = () => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0;
    setSetup({ seed, bulletin: BULLETINS[Math.abs(seed) % BULLETINS.length] });
    setData((d) => ({ ...d, run: null }));
  };

  return (
    <div className="shell" onPointerDown={() => sound.wakeAudio()}>
      {run ? (
        <Run s={run} dispatch={dispatch} data={data} setData={setData} onRestart={startSetup} />
      ) : setup ? (
        <Setup
          bulletin={setup.bulletin}
          onStart={(character, loadout) => {
            setData((d) => ({ ...d, run: newRun({ character, loadout, bulletin: setup.bulletin, seed: setup.seed }) }));
            setSetup(null);
          }}
        />
      ) : (
        <Title onStart={startSetup} seen={data.endingsSeen.length} />
      )}
    </div>
  );
}

const AUTOPLAY_STEP_MS = 1000;

interface AutoRun { s: RunState; botRng: number }

function autoRun(index: number): AutoRun {
  const setup = setupFor(index);
  return { s: newRun(setup), botRng: botSeed(setup.seed) };
}

const randomIndex = () => Math.floor(Math.random() * 1e6);

/** One bot run on screen. Taps still work; the bot just carries on from wherever the run is. */
function Autoplay({ style }: { style: BotStyle }) {
  const [auto, setAuto] = useState<AutoRun>(() => {
    const seed = Number(new URLSearchParams(window.location.search).get('seed'));
    return autoRun(Number.isInteger(seed) && seed > 0 ? seed - 1 : randomIndex());
  });
  // Settings come from the save so shorter waits and sound carry over, but nothing is written back.
  const [data, setData] = useState<SaveData>(() => ({ ...load(store), run: null }));
  const s = auto.s;

  useEffect(() => sound.setMuted(!data.settings.sound), [data.settings.sound]);
  useEffect(() => {
    if (s.ending && !s.reaction) return;
    const timer = setTimeout(() => setAuto((a) => {
      // The officer's last line is dismissed like a player would, then the ending card shows.
      if (a.s.ending) return a.s.reaction ? { ...a, s: step(a.s, { type: 'ack' }) } : a;
      const pick = botAction(style, a.s, a.botRng);
      return pick ? { s: step(a.s, pick.action), botRng: pick.botRng } : a;
    }), AUTOPLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [s, style]);

  const dispatch = (a: Action) => setAuto((x) => ({ ...x, s: step(x.s, a) }));
  const shown = { ...data, endingsSeen: s.ending && !data.endingsSeen.includes(s.ending) ? [...data.endingsSeen, s.ending] : data.endingsSeen };
  return (
    <div className="shell" data-autoplay={style}>
      <Run s={s} dispatch={dispatch} data={shown} setData={setData} onRestart={() => setAuto(autoRun(randomIndex()))} />
    </div>
  );
}

function Title({ onStart, seen }: { onStart: () => void; seen: number }) {
  return (
    <main className="title-screen">
      <div className="paper title-card">
        <p className="mono stamp-line">HALDEN CENTRAL · ARRIVALS</p>
        <h1>{t('ui.title')}</h1>
        <p>{t('ui.tagline')}</p>
      </div>
      <div className="controls">
        {seen > 0 && <p className="muted-dark">{t('ui.endingsSeen', { n: seen })}</p>}
        <button className="primary" onClick={onStart}>{t('ui.start')}</button>
      </div>
    </main>
  );
}

function Setup({ bulletin, onStart }: { bulletin: BulletinId; onStart: (c: CharacterId, l: EvidenceId[]) => void }) {
  const [character, setCharacter] = useState<CharacterId | null>(null);
  const [picked, setPicked] = useState<EvidenceId[]>([]);
  const slots = character ? CHARACTERS[character].evidenceSlots : 0;

  if (!character) {
    return (
      <main className="setup">
        <section className="paper">
          <p className="mono">{t('ui.mission')}</p>
          <h2>{t('mission.title')}</h2>
          <p>{t('mission.body', { hours: START_TIME, travel: MISSION_MIN_TIME })}</p>
          <p className="rule">{t('ui.missionRule', { n: MISSION_MIN_TIME })}</p>
        </section>
        <h2 className="on-dark">{t('ui.pickCharacter')}</h2>
        <div className="controls stack">
          {CHARACTER_IDS.map((id) => (
            <button key={id} className="choice" onClick={() => setCharacter(id)}>
              <span className="choice-label">{t(`char.${id}.name`)}</span>
              <span className="choice-sub">{t(`char.${id}.blurb`)}</span>
              <span className="chips">
                <span className="chip info">+ {t(`char.${id}.strength`)}</span>
                <span className="chip risk">- {t(`char.${id}.weakness`)}</span>
              </span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const toggle = (id: EvidenceId) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < slots ? [...p, id] : p));

  return (
    <main className="setup">
      <section className="bulletin mono" role="note">
        <strong>{t('ui.bulletin')}:</strong> {t(`bulletin.${bulletin}`)}
      </section>
      <h2 className="on-dark">{t('ui.pickEvidence', { count: slots })}</h2>
      <ul className="cards pick">
        {EVIDENCE_IDS.map((id) => (
          <li key={id}>
            <button className={`doc ${picked.includes(id) ? 'picked' : ''}`} aria-pressed={picked.includes(id)} onClick={() => toggle(id)}>
              <strong>{t(`ev.${id}.name`)}</strong>
              {picked.includes(id) && <span className="tag packed">{t('ui.packed')}</span>}
              <p>{t(`ev.${id}.desc`)}</p>
            </button>
          </li>
        ))}
      </ul>
      <div className="controls sticky">
        <p className="muted-dark">{t('ui.picked', { picked: picked.length, count: slots })}</p>
        <button className="primary" disabled={picked.length !== slots} onClick={() => onStart(character, picked)}>
          {t('ui.continue')}
        </button>
      </div>
    </main>
  );
}

function Run({ s, dispatch, data, setData, onRestart }: {
  s: RunState;
  dispatch: (a: Action) => void;
  data: SaveData;
  setData: React.Dispatch<React.SetStateAction<SaveData>>;
  onRestart: () => void;
}) {
  const [sheet, setSheet] = useState<'story' | 'evidence' | 'scrutiny' | 'settings' | null>(null);
  // The last officer line still shows before the ending card.
  if (s.ending && !s.reaction) return <Ending s={s} seen={data.endingsSeen.length} onRestart={onRestart} />;

  const officerKey = s.screen.kind === 'inspection' ? 'inspection' : CHECKPOINTS[Math.min(s.checkpoint, 2)];
  const close = () => setSheet(null);
  return (
    <main className="run">
      <TopStrip s={s} onScrutiny={() => setSheet('scrutiny')} />
      <div className={`scene scene-${CHECKPOINTS[Math.min(s.checkpoint, 2)]} ${data.settings.reduceMotion ? 'still' : ''}`} aria-hidden>
        <div className="flicker" />
        {s.screen.kind === 'wait' ? (
          <div className="tray"><span className="mono">{t('ui.waiting')}</span></div>
        ) : s.screen.kind !== 'between' ? (
          <div className="officer"><span className="mono">{t(`officer.${officerKey}`)}</span></div>
        ) : null}
      </div>
      <Panel s={s} dispatch={dispatch} reduceWait={data.settings.reduceWait} />
      {/* The tray stays on every run screen, so story, evidence and settings are always one tap away. */}
      <nav className="tools">
        <button aria-haspopup="dialog" onClick={() => setSheet('story')}>{t('ui.myStory')}</button>
        <button aria-haspopup="dialog" onClick={() => setSheet('evidence')}>
          {t('ui.evidence')} · {s.loadout.length - s.used.length}
        </button>
        <button aria-haspopup="dialog" onClick={() => setSheet('settings')}>{t('ui.settings')}</button>
      </nav>
      <Sheet open={sheet === 'story'} onClose={close} title={t('ui.myStory')}><StoryContent s={s} /></Sheet>
      <Sheet open={sheet === 'evidence'} onClose={close} title={t('ui.evidence')}><EvidenceContent s={s} /></Sheet>
      <Sheet open={sheet === 'scrutiny'} onClose={close} title={t('ui.scrutiny')}><ScrutinyContent s={s} /></Sheet>
      <Sheet open={sheet === 'settings'} onClose={close} title={t('ui.settings')}>
        <SettingsContent settings={data.settings} onChange={(settings) => setData((d) => ({ ...d, settings }))} />
      </Sheet>
    </main>
  );
}

function Reaction({ s, dispatch }: { s: RunState; dispatch: (a: Action) => void }) {
  return (
    <>
      <section className="panel paper reaction" aria-live="polite">
        {s.reaction!.map((r, i) => <p key={i}>{t(r.key, r.vars)}</p>)}
      </section>
      <div className="controls">
        <button className="primary" autoFocus onClick={() => dispatch({ type: 'ack' })}>{t('ui.continue')}</button>
      </div>
    </>
  );
}

function Panel({ s, dispatch, reduceWait }: { s: RunState; dispatch: (a: Action) => void; reduceWait: boolean }) {
  if (s.reaction) return <Reaction s={s} dispatch={dispatch} />;
  const sc = s.screen;

  if (sc.kind === 'between') {
    const msgs = [0, 1, 2, 3].map((n) => `msg.${sc.next}.${n}`).filter(has);
    return (
      <>
        <section className="panel phone" aria-live="polite">
          <h2 className="checkpoint-name">{t(`checkpoint.${CHECKPOINTS[sc.next]}`)}</h2>
          {msgs.map((k) => <p key={k} className="msg">{t(k)}</p>)}
        </section>
        <div className="controls">
          <button className="primary" autoFocus onClick={() => dispatch({ type: 'ack' })}>{t('ui.continue')}</button>
        </div>
      </>
    );
  }

  if (sc.kind === 'wait') return <Waiting s={s} dispatch={dispatch} reduceWait={reduceWait} />;

  const id = sc.kind === 'encounter' || sc.kind === 'inspection' ? sc.id : '';
  const prefix = sc.kind === 'inspection' ? 'insp' : 'enc';
  return (
    <>
      <section className={`panel paper ${sc.kind === 'inspection' ? 'inspection' : ''}`} aria-live="polite">
        <p className="question">{t(`${prefix}.${id}.q`)}</p>
      </section>
      <div className="controls stack">
        {options(s).map((o) => (
          <button
            key={o.approach.id}
            className="choice"
            disabled={!!o.blocked}
            onClick={() => dispatch({ type: 'choose', approach: o.approach.id })}
          >
            <span className="choice-label">{optionLabel(prefix, id, o)}</span>
            <CostChips o={o} />
          </button>
        ))}
      </div>
    </>
  );
}

/** A blocked option has no card or person to name, so it gets a generic label. */
function optionLabel(prefix: string, id: string, o: Option): string {
  if (o.blocked === 'noCard') return t('ui.showDocument');
  if (o.blocked === 'noContact') return t('ui.nameSomeone');
  const vars: Record<string, string> = {};
  if (o.card) vars.card = o.card;
  if (o.contact) vars.contact = o.contact;
  return t(`${prefix}.${id}.${o.approach.id}.label`, vars);
}

/** Beats play on their own (2-5 s, or 0.6 s with shorter waits); a tap skips ahead. */
function Waiting({ s, dispatch, reduceWait }: { s: RunState; dispatch: (a: Action) => void; reduceWait: boolean }) {
  const sc = s.screen as Extract<RunState['screen'], { kind: 'wait' }>;
  const done = sc.shown >= sc.beats.length;
  const cp = CHECKPOINTS[Math.min(s.checkpoint, 2)];
  const delay = useMemo(() => (reduceWait ? 600 : 2000 + ((sc.beats[sc.shown] ?? 0) * 613) % 3000), [reduceWait, sc.shown, sc.beats]);

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => { sound.tick(); dispatch({ type: 'beat' }); }, delay);
    return () => clearTimeout(timer);
  }, [done, delay, dispatch, sc.shown]);

  return (
    <>
      <section
        className="panel paper waiting"
        aria-live="polite"
        onClick={() => { if (!done) dispatch({ type: 'beat' }); }}
      >
        <p className="question">{t(`check.${sc.check}.title`)}</p>
        {sc.beats.slice(0, sc.shown).map((b) => <p key={b} className="beat">{t(`beat.${cp}.${b}`)}</p>)}
        {!done && <p className="muted skip">{t('ui.tapToSkip')}</p>}
      </section>
      <div className="controls stack">
        {done && waitActions(s).map((w) => (
          <button
            key={w.action}
            className={CHECKS[sc.check].important ? 'choice' : 'primary'}
            disabled={!!w.blocked}
            onClick={() => { sound.result(); dispatch({ type: 'waitAction', action: w.action }); }}
          >
            {CHECKS[sc.check].important ? (
              <>
                <span className="choice-label">{w.blocked ? t('ui.nameSomeone') : t(`wait.${w.action}.label`, w.contact ? { contact: w.contact } : {})}</span>
                <span className="chips"><span className={`chip ${w.action === 'assist' ? 'person' : 'info'}`}>{w.blocked ? t(`ui.blocked.${w.blocked}`) : t(`wait.${w.action}.detail`)}</span></span>
              </>
            ) : t('ui.continue')}
          </button>
        ))}
      </div>
    </>
  );
}

function Ending({ s, seen, onRestart }: { s: RunState; seen: number; onRestart: () => void }) {
  const ending = s.ending ?? endingFor(s);
  const ch = CHARACTERS[s.character];
  const lines: string[] = [];
  if (!s.medicine) lines.push(t('ending.line.medicineLost'));
  for (const c of s.exposed) {
    lines.push(t('ending.line.exposed', { contact: c }));
    if (c === ch.protectedContact) lines.push(t('ending.line.protectedExposed', { contact: c }));
  }
  return (
    <main className={`ending ending-${ending}`}>
      <section className="paper ending-card">
        <p className="mono">{t('ui.timeLeft', { n: s.time })}</p>
        <h1>{t(`ending.${ending}.title`)}</h1>
        <p>{t(`ending.${ending}.body`)}</p>
        {lines.length > 0 && <ul className="record">{lines.map((l, i) => <li key={i}>{capitalize(l)}</li>)}</ul>}
        {s.facts.length > 0 && (
          <>
            <h3 className="mono muted">{t('ui.onFileNow')}</h3>
            <ul className="record">{s.facts.map((f) => <li key={f}>{t(`fact.${f}`)}</li>)}</ul>
          </>
        )}
      </section>
      <div className="controls">
        <p className="muted-dark">{t('ui.endingsSeen', { n: seen })}</p>
        <button className="primary" onClick={onRestart}>{t('ui.newRun')}</button>
      </div>
    </main>
  );
}

/** Contact names start lowercase ("your brother Tom") so they read mid-sentence. */
function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
