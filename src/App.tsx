// Screens. The game state lives in one useState; every change goes through
// playStep() from src/game/play.ts and is autosaved.
// ?autoplay=<style> (honest, liar, cautious, random, situational) instead plays
// one bot run on screen, one step a second, and saves nothing. &seed=<n> picks the run.

import { useEffect, useMemo, useRef, useState } from 'react';
import { own, t, tn } from './i18n';
import { canFinish, deskIntro, endingFor, endingText, newRun, options, shownCheckpoint, waitActions } from './game/engine';
import { playStep } from './game/play';
import { botAction, botSeed, isBotStyle, setupFor } from './game/bots';
import type { BotStyle } from './game/bots';
import type { Option } from './game/engine';
import { INSPECTION_BY_ID } from './game/content/encounters';
import { queueBeats } from './game/content/queues';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, MISSION_MIN_TIME, START_TIME, beatDelayMs } from './game/content/world';
import { browserStore, load, save } from './game/save';
import type { SaveData } from './game/save';
import type { Action, BulletinId, CharacterId, EvidenceId, RunState } from './game/types';
import { CHECKPOINTS } from './game/types';
import { ChangeLines, ConsequenceLine, EvidenceContent, ScrutinyContent, SettingsContent, Sheet, StoryContent, TopStrip, PickOut } from './ui/parts';
import { SEPARATOR, consequences, nextActionKey, packDetail, severityTone } from './game/consequence';
import * as sound from './ui/sound';
import { Portrait } from './ui/art/Portrait';
import { CheckpointScene } from './ui/art/CheckpointScene';
import type { SceneState } from './ui/art/CheckpointScene';
import { BorderPost, Desk, NightBus } from './ui/art/JourneyScenes';
import { CustomsQueueScene, InterviewQueueScene, QueueScene } from './ui/art/QueueScene';
import { Icon } from './ui/art/icons';

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
    const next = playStep(run, a);
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
      if (a.s.ending) return a.s.reaction ? { ...a, s: playStep(a.s, { type: 'ack' }) } : a;
      const pick = botAction(style, a.s, a.botRng);
      return pick ? { s: playStep(a.s, pick.action), botRng: pick.botRng } : a;
    }), AUTOPLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [s, style]);

  const dispatch = (a: Action) => setAuto((x) => ({ ...x, s: playStep(x.s, a) }));
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
        <p className="mono stamp-line">{t('ui.stamp')}</p>
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

// Setup screens, in order. They are presentation state here, not engine phases.
// Back and Continue walk this list, so a new screen (the destination briefing, 70r.3,
// goes between traveler and documents) is one more entry and one more case below.
const SETUP_STEPS = ['traveler', 'documents', 'begin'] as const;
type SetupStep = (typeof SETUP_STEPS)[number];

function Setup({ bulletin, onStart }: { bulletin: BulletinId; onStart: (c: CharacterId, l: EvidenceId[]) => void }) {
  const [at, setAt] = useState<SetupStep>('traveler');
  const [character, setCharacter] = useState<CharacterId | null>(null);
  const [picked, setPicked] = useState<EvidenceId[]>([]);
  const move = (delta: number) => setAt(SETUP_STEPS[SETUP_STEPS.indexOf(at) + delta]);

  if (at === 'traveler' || !character) {
    return (
      <TravelerStep
        initial={character}
        onContinue={(c) => {
          // A traveler with fewer slots keeps only the first picks that still fit.
          setPicked((p) => p.slice(0, CHARACTERS[c].evidenceSlots));
          setCharacter(c);
          move(1);
        }}
      />
    );
  }
  if (at === 'documents') {
    return <DocumentsStep character={character} bulletin={bulletin} picked={picked} setPicked={setPicked} onBack={() => move(-1)} onContinue={() => move(1)} />;
  }
  return <BeginStep picked={picked} onBack={() => move(-1)} onBegin={() => onStart(character, picked)} />;
}

/** Back on setup screens: a quiet control, so only the forward action reads as primary. */
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="back" onClick={onBack}>
      <span aria-hidden>‹ </span>{t('ui.back')}
    </button>
  );
}

/** Setup 2. Packing is where hours and scrutiny first matter, so both are explained here. */
function DocumentsStep({ character, bulletin, picked, setPicked, onBack, onContinue }: {
  character: CharacterId;
  bulletin: BulletinId;
  picked: EvidenceId[];
  setPicked: React.Dispatch<React.SetStateAction<EvidenceId[]>>;
  onBack: () => void;
  onContinue: () => void;
}) {
  const slots = CHARACTERS[character].evidenceSlots;
  const toggle = (id: EvidenceId) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < slots ? [...p, id] : p));
  const count = t('ui.progressCount', { n: SETUP_STEPS.indexOf('documents') + 1, total: SETUP_STEPS.length });
  const { ref: bodyRef, more, onScroll } = useMoreBelow();

  return (
    <main className="setup setup-step documents-step">
      <div className="setup-body" ref={bodyRef} onScroll={onScroll}>
        <div className="pack-scene"><Desk /></div>
        <header className="step-head">
          <div className="step-nav">
            <BackButton onBack={onBack} />
            <p className="stage-label"><PickOut text={t('ui.progress', { count, name: t('ui.preparation') })} part={count} /></p>
          </div>
          <h2 className="on-dark">{t('ui.prepareDocuments')}</h2>
          <p className="pack-count" aria-live="polite">{t('ui.picked', { picked: picked.length, count: slots })}</p>
        </header>
        <p className="bulletin" role="note" aria-label={t('ui.bulletin')}>
          <Icon name="alert" />
          <span className="bulletin-text">{t(`bulletin.${bulletin}`)}</span>
        </p>
        <ul className="cards pick" aria-label={t('ui.prepareDocuments')}>
          {EVIDENCE_IDS.map((id) => (
            <li key={id}>
              <button className={`doc ${picked.includes(id) ? 'picked' : ''}`} aria-pressed={picked.includes(id)} onClick={() => toggle(id)}>
                <span className="checkbox" aria-hidden>{picked.includes(id) && <Icon name="check" />}</span>
                <span className="doc-text">
                  <strong>{t(`ev.${id}.label`)}</strong>
                  {packDetail(id).map((line, n) => (
                    <span key={n} className={n ? 'doc-detail doc-reveals' : 'doc-detail doc-topics'}>{line.map((k) => t(k)).join(SEPARATOR)}</span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="controls">
        {more && <p className="more-below" aria-hidden>{t('ui.moreBelow')} <span>↓</span></p>}
        <button className="primary" disabled={picked.length !== slots} onClick={onContinue}>
          {t('ui.continue')}
        </button>
      </div>
    </main>
  );
}

/** True while a scroll box has content below its fold: on at large text, off once scrolled to the end. */
function useMoreBelow() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const check = () => {
    const el = ref.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  };
  useEffect(() => {
    check();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, []);
  return { ref, more, onScroll: check };
}

/** Setup 3. The mission, the rest of the premise and what you packed, then the one strong button. */
function BeginStep({ picked, onBack, onBegin }: { picked: EvidenceId[]; onBack: () => void; onBegin: () => void }) {
  const packed = EVIDENCE_IDS.filter((id) => picked.includes(id));
  return (
    <main className="setup setup-step begin-step">
      <div className="setup-body">
        <header className="step-head">
          <BackButton onBack={onBack} />
          <h2 className="on-dark">{t('ui.beginCrossing')}</h2>
        </header>
        <section className="paper mission">
          <p className="mono">{t('ui.mission')}</p>
          {/* The title says whose care it is, so "his care" in the body reads right. */}
          <h3>{t('mission.title')}</h3>
          <p>{t('mission.body', { hours: START_TIME, travel: MISSION_MIN_TIME })}</p>
          <p className="rule">{t('ui.missionRule', { n: MISSION_MIN_TIME })}</p>
        </section>
        <section className="packed-list">
          <h3 className="mono">{t('ui.yourDocuments')}</h3>
          <ul>{packed.map((id) => <li key={id}>{t(`ev.${id}.name`)}</li>)}</ul>
        </section>
      </div>
      <div className="controls">
        <button className="primary" onClick={onBegin}>{t('ui.beginCrossing')}</button>
      </div>
    </main>
  );
}

/**
 * Setup 1. The premise is the heading; the cards are a radio group, so a tap
 * selects and only the button moves on. The picked traveler's history waits
 * behind a disclosure, closed until opened.
 */
function TravelerStep({ initial, onContinue }: { initial: CharacterId | null; onContinue: (c: CharacterId) => void }) {
  const [chosen, setChosen] = useState<CharacterId | null>(initial);
  const [historyOpen, setHistoryOpen] = useState(false);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  // A new pick starts with its history closed.
  const pick = (id: CharacterId) => {
    if (id !== chosen) setHistoryOpen(false);
    setChosen(id);
  };

  // Arrow keys move the selection, as in a native radio group.
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + CHARACTER_IDS.length) % CHARACTER_IDS.length;
    pick(CHARACTER_IDS[next]);
    cards.current[next]?.focus();
  };
  const focusable = chosen ?? CHARACTER_IDS[0];
  const count = t('ui.progressCount', { n: SETUP_STEPS.indexOf('traveler') + 1, total: SETUP_STEPS.length });

  return (
    <main className="setup traveler-step">
      <div className="setup-body">
        <p className="setup-title">{t('ui.title')}</p>
        <div className="traveler-scene"><BorderPost /></div>
        <header className="step-head">
          <p className="stage-label"><PickOut text={t('ui.progress', { count, name: t('ui.traveler') })} part={count} /></p>
          <h2 className="premise">{t('ui.premise')}</h2>
        </header>
        <div className="travelers" role="radiogroup" aria-label={t('ui.pickCharacter')}>
          {CHARACTER_IDS.map((id, i) => (
            <button
              key={id}
              ref={(el) => { cards.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={chosen === id}
              tabIndex={id === focusable ? 0 : -1}
              className="traveler"
              onClick={() => pick(id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <Portrait id={id} className="portrait" />
              <span className="traveler-text">
                <strong className="traveler-name">{t(`char.${id}.name`)}{SEPARATOR}{t(`char.${id}.role`)}</strong>
                <span className="traveler-line">{t(`char.${id}.card`)}</span>
              </span>
              <span className="radio" aria-hidden>{chosen === id && <Icon name="check" />}</span>
            </button>
          ))}
        </div>
        {chosen && (
          <section className="history">
            <button
              type="button"
              className="history-toggle"
              aria-expanded={historyOpen}
              aria-controls="traveler-history"
              onClick={() => setHistoryOpen((o) => !o)}
            >
              {t('ui.readHistory', { name: t(`char.${chosen}.name`) })}
            </button>
            <ul id="traveler-history" className="history-detail" hidden={!historyOpen}>
              {CHARACTERS[chosen].background.map((b) => <li key={b}>{t(`bg.${b}`)}</li>)}
            </ul>
          </section>
        )}
      </div>
      <div className="controls">
        <button className="primary" disabled={!chosen} onClick={() => chosen && onContinue(chosen)}>
          {chosen ? t('ui.continueAs', { name: t(`char.${chosen}.name`) }) : t('ui.continue')}
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
  const usedBefore = useUsedBefore(s);
  // The last officer line still shows before the ending card.
  if (s.ending && !s.reaction) return <Ending s={s} seen={data.endingsSeen.length} onRestart={onRestart} />;

  // The last reaction at a checkpoint shows with the next queue already set; its officer is the one just left.
  const sceneAt = shownCheckpoint(s);
  const officerKey = s.screen.kind === 'inspection' ? 'inspection' : CHECKPOINTS[sceneAt];
  const close = () => setSheet(null);
  const queue = s.screen.kind === 'between' && !s.reaction ? s.screen.next : null;
  const sceneState: SceneState = {
    handedOver: s.used.length > (usedBefore[sceneAt] ?? s.used.length),
    writing: !!s.reaction && (s.changes ?? []).some((c) => c.key.startsWith('change.fact.')),
    away: s.screen.kind === 'wait',
    medicine: s.medicine,
    inspection: s.screen.kind === 'inspection' ? INSPECTION_BY_ID.get(s.screen.id)?.kind ?? null : null,
  };
  return (
    <main className="run">
      <TopStrip s={s} onScrutiny={() => setSheet('scrutiny')} />
      {queue !== null ? (
        // Keyed by run and checkpoint, so each queue starts again from its first beat.
        <Queue key={`${s.seed}.${queue}`} next={queue} character={s.character} still={data.settings.reduceMotion} onDone={() => dispatch({ type: 'ack' })} />
      ) : (
        <>
          <div className={`scene scene-${CHECKPOINTS[sceneAt]} ${data.settings.reduceMotion ? 'still' : ''}`}>
            <div className="officer">
              <CheckpointScene checkpoint={CHECKPOINTS[sceneAt]} character={s.character} state={sceneState} />
              {s.screen.kind === 'wait' ? (
                <span className="mono officer-label" aria-hidden>{t('ui.waiting')}</span>
              ) : (
                <span className="mono officer-label" aria-hidden>{t(`officer.${officerKey}`)}</span>
              )}
            </div>
            <div className="flicker" aria-hidden />
          </div>
          <Panel s={s} dispatch={dispatch} reduceWait={data.settings.reduceWait} />
        </>
      )}
      {/* The tray stays on every run screen, so story, evidence and settings are always one tap away. */}
      <nav className="tools">
        <button aria-haspopup="dialog" onClick={() => setSheet('story')}><Icon name="document" />{t('ui.myStory')}</button>
        <button aria-haspopup="dialog" onClick={() => setSheet('evidence')}>
          <Icon name="folder" />{t('ui.evidence')} · {s.loadout.length - s.used.length}
        </button>
        {/* Gear only: the name is for screen readers, and the sheet's title says it again. */}
        <button className="tool-settings" aria-haspopup="dialog" aria-label={t('ui.settings')} onClick={() => setSheet('settings')}>
          <Icon name="gear" />
        </button>
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

/**
 * How many documents were already used when each checkpoint began, so the scene shows
 * only the ones handed over at this counter. Nothing is used before the first one; after
 * a reload the count starts from what is used by then.
 */
function useUsedBefore(s: RunState): Record<number, number> {
  const [seen, setSeen] = useState<{ seed: number; at: Record<number, number> }>(() => ({ seed: s.seed, at: { 0: 0 } }));
  const cp = Math.min(s.checkpoint, 2);
  let now = seen.seed === s.seed ? seen : { seed: s.seed, at: { 0: 0 } };
  if (!(cp in now.at)) now = { ...now, at: { ...now.at, [cp]: s.used.length } };
  // Adjusting state while rendering, as React allows for values derived from earlier renders.
  if (now !== seen) setSeen(now);
  return now.at;
}

/** The officer's line, then one line per change, then a button that says what comes next. */
function Reaction({ s, dispatch }: { s: RunState; dispatch: (a: Action) => void }) {
  return (
    <>
      <section className="panel paper reaction" aria-live="polite">
        {s.reaction!.map((r, i) => <p key={i} className="said">{t(r.key, r.vars)}</p>)}
        <ChangeLines changes={s.changes ?? []} />
      </section>
      <div className="controls">
        <button className="primary" autoFocus onClick={() => dispatch({ type: 'ack' })}>{t(nextActionKey(s))}</button>
      </div>
    </>
  );
}

/**
 * The queue before a checkpoint, one beat per tap (on the scene, the phone or the button).
 * Phone messages stack in the phone panel joined to the scene's lower edge; said and seen
 * beats are a caption over the scene. The strip already says "In the queue", so the scene does not.
 * The last beat swaps Continue for the walk up to the officer, which is the engine's ack.
 */
function Queue({ next, character, still, onDone }: { next: number; character: CharacterId; still: boolean; onDone: () => void }) {
  const beats = queueBeats(next, character);
  const [shown, setShown] = useState(1);
  const done = shown >= beats.length;
  const seen = beats.slice(0, shown);
  const current = seen[seen.length - 1];
  const caption = seen.findLast((b) => b.kind !== 'phone');
  const advance = () => { if (!done) setShown((n) => n + 1); };
  // In the passport queue the booth light turns green on the clerk's "Next.".
  const art = next === 0 ? <QueueScene light={seen.some((b) => b.light === 'green') ? 'green' : 'red'} character={character} />
    : next === 1 ? <CustomsQueueScene character={character} />
    : <InterviewQueueScene character={character} />;

  return (
    <>
      <div className={`scene scene-${CHECKPOINTS[next]} queue-scene ${still ? 'still' : ''}`} onClick={advance}>
        {art}
        <div className="flicker" aria-hidden />
        <div className="caption-area" aria-live="polite">
          {caption && <p key={caption.key} className={`caption ${caption.kind}`}>{t(caption.key)}</p>}
        </div>
      </div>
      <section className={`panel phone ${current.kind === 'phone' ? '' : 'lowered'}`} aria-live="polite" onClick={advance}>
        {seen.filter((b) => b.kind === 'phone').map((b) => (
          <p key={b.key} className="msg">
            {b.from && <span className="msg-from">{t(`msg.from.${b.from}`)}</span>}
            {t(b.key)}
          </p>
        ))}
      </section>
      <div className="controls">
        <button className="primary" autoFocus onClick={done ? onDone : advance}>
          {done ? t(`queue.${next}.go`) : t('ui.continue')}
        </button>
      </div>
    </>
  );
}

/** Questions up to this many characters ("Purpose of your visit?") show as a heading with no card. */
const SHORT_QUESTION = 40;

function Panel({ s, dispatch, reduceWait }: { s: RunState; dispatch: (a: Action) => void; reduceWait: boolean }) {
  if (s.reaction) return <Reaction s={s} dispatch={dispatch} />;
  const sc = s.screen;

  // Queue renders the between screen; Run only gets here with an officer line still showing.
  if (sc.kind === 'between') return null;

  if (sc.kind === 'wait') return <Waiting s={s} dispatch={dispatch} reduceWait={reduceWait} />;

  const id = sc.kind === 'encounter' || sc.kind === 'inspection' ? sc.id : '';
  const prefix = sc.kind === 'inspection' ? 'insp' : 'enc';
  const question = t(own(`${prefix}.${id}.q`, s.character));
  // The question sits right on top of the answers: a short one is a big heading on its
  // own, a longer one goes in a light card so it still reads as the officer speaking.
  const short = question.length <= SHORT_QUESTION;
  // On reaching a desk, one line says what this officer cares about.
  const desk = deskIntro(s);
  // Once the bus is out of reach, say so plainly and offer to finish instead of more clicking.
  const finishing = canFinish(s);
  return (
    <>
      <section className={`panel ask ${short ? 'ask-short' : 'paper ask-card'} ${sc.kind === 'inspection' ? 'inspection' : ''}`} aria-live="polite">
        {finishing && <p className="priority doomed">{t('ui.doomed')}</p>}
        {desk && <p className="priority">{t(`officer.${desk}.priority`)}</p>}
        <h2 className="question">{question}</h2>
      </section>
      <div className="controls stack">
        {options(s).map((o) => (
          <button
            key={o.approach.id}
            className="choice"
            disabled={!!o.blocked}
            onClick={() => dispatch({ type: 'choose', approach: o.approach.id })}
          >
            <span className="choice-label">{optionLabel(prefix, id, o, s.character)}</span>
            <ConsequenceLine o={o} cardKey={`${prefix}.${id}.${o.approach.id}`} s={s} />
          </button>
        ))}
        {finishing && (
          <button className="primary finish" onClick={() => dispatch({ type: 'finish' })}>{t('ui.finishQuickly')}</button>
        )}
      </div>
    </>
  );
}

/** A blocked option has no card or person to name, so it gets a generic label. */
function optionLabel(prefix: string, id: string, o: Option, traveler: CharacterId): string {
  if (o.blocked === 'noCard') return t('ui.showDocument');
  if (o.blocked === 'noContact') return t('ui.nameSomeone');
  const vars: Record<string, string> = {};
  if (o.card) vars.card = vars.cardThe = o.card;
  if (o.contact) vars.contact = vars.contactMine = o.contact;
  return t(own(`${prefix}.${id}.${o.approach.id}.label`, traveler), vars);
}

/** How many dots "Verification in progress" shows; the current one is amber. */
const VERIFY_DOTS = 3;

/**
 * A check, as in the customs mockup: its name, what is happening, "Verification in
 * progress" with three dots, then the actions. Beats play on their own (2-5 s, or
 * 0.6 s with shorter waits) and a tap skips ahead; the buttons show once they are done.
 */
function Waiting({ s, dispatch, reduceWait }: { s: RunState; dispatch: (a: Action) => void; reduceWait: boolean }) {
  const sc = s.screen as Extract<RunState['screen'], { kind: 'wait' }>;
  const done = sc.shown >= sc.beats.length;
  const cp = CHECKPOINTS[Math.min(s.checkpoint, 2)];
  const delay = useMemo(() => beatDelayMs(sc.beats[sc.shown] ?? 0, reduceWait), [reduceWait, sc.shown, sc.beats]);
  const at = Math.min(VERIFY_DOTS - 1, Math.floor((sc.shown / sc.beats.length) * VERIFY_DOTS));
  const beat = sc.shown > 0 ? sc.beats[sc.shown - 1] : null;
  const protectedContact = CHARACTERS[s.character].protectedContact;

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
        <h2 className="question">{t(`check.${sc.check}.name`)}</h2>
        <p className="happening">{t(`check.${sc.check}.title`)}</p>
        <p className="verifying">
          <span className="dots" aria-hidden>
            {Array.from({ length: VERIFY_DOTS }, (_, i) => <i key={i} className={i < at ? 'past' : i === at ? 'now' : ''} />)}
          </span>
          {t('ui.verifying')}
        </p>
        {beat !== null && <p key={beat} className="beat">{t(`beat.${cp}.${beat}`)}</p>}
        {!done && <p className="muted skip">{t('ui.tapToSkip')}</p>}
      </section>
      <div className="controls stack">
        {done && waitActions(s).map((w) => (
          <button
            key={w.action}
            className={w.action === 'wait' ? 'primary wait-go' : 'choice'}
            disabled={!!w.blocked}
            onClick={() => { sound.result(); dispatch({ type: 'waitAction', action: w.action }); }}
          >
            {w.action === 'wait' ? t('wait.wait.label') : (
              <>
                <span className="choice-label">{w.blocked ? t('ui.nameSomeone') : t(`wait.${w.action}.label`, w.contact ? { contact: w.contact } : {})}</span>
                <span className={`consequence ${w.blocked ? 'blocked' : ''}`}>
                  <Icon name={w.action === 'ask' ? 'clock' : 'document'} />
                  <span className="consequence-text">
                    <span className={`part ${w.blocked ? 'plain' : w.contact === protectedContact ? 'red' : 'amber'}`}>
                      {w.blocked ? t(`ui.blocked.${w.blocked}`) : t(`wait.${w.action}.detail`)}
                    </span>
                    {/* After the guaranteed cost, the possible gain: "May confirm the address". */}
                    {!w.blocked && w.contact && w.vouches && (
                      <>{SEPARATOR}<span className="part plain">{t(`contact.${w.contact}.can.${w.vouches}`)}</span></>
                    )}
                  </span>
                </span>
              </>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The ending as a short result card (Yury's mockup, 2026-11-09): the title, the scene,
 * the outcome and the ending's name in amber, one sentence, three summary rows, then
 * "See what's on file" and "Play again". The longer text and who was called in sit
 * behind "See what's on file", above My story, so nothing is lost.
 */
function Ending({ s, seen, onRestart }: { s: RunState; seen: number; onRestart: () => void }) {
  const [story, setStory] = useState(false);
  const ending = s.ending ?? endingFor(s);
  const text = endingText(s);
  const cost = consequences(s);
  return (
    <main className={`ending ending-${ending}`}>
      <p className="setup-title">{t('ui.title')}</p>
      <div className="ending-scene">
        {ending === 'turnedBack' ? <BorderPost closed /> : <NightBus medicine={s.medicine} character={s.character} />}
      </div>
      <section className="paper ending-card">
        <p className="mono outcome">{t(ending === 'turnedBack' ? 'ui.crossingRefused' : 'ui.crossingComplete')}</p>
        <h1>{t(`ending.${text}.title`)}</h1>
        <p className="summary">{t(`ending.${text}.summary`)}</p>
        <dl className="result-rows">
          {resultRows(s).map((r) => (
            <div key={r.label} className="result-row">
              <dt>{r.label}</dt>
              <dd className={r.tone}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="controls">
        <button className="choice see-file" aria-haspopup="dialog" onClick={() => setStory(true)}>{t('ui.seeOnFile')}</button>
        <button className="primary play-again" onClick={onRestart}>{t('ui.playAgain')}</button>
      </div>
      <Sheet open={story} onClose={() => setStory(false)} title={t('ui.myStory')}>
        <div className="ending-record">
          <p>{t(`ending.${text}.body`)}</p>
          {cost.length > 0 && (
            <>
              <h3 className="mono what-it-cost">{t('ui.whatItCost')}</h3>
              <ul className="record costs">
                {cost.map((l, i) => (
                  <li key={i} className={`cost ${l.kind}`}>
                    <span className={`tag severity ${severityTone(l)}`}>{t(`ending.severity.${l.severity}`)}</span>{' '}
                    {l.n === undefined ? t(l.key, l.vars) : tn(l.key, l.n, l.vars)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mono muted">{t('ui.endingsSeen', { n: seen })}</p>
        </div>
        <StoryContent s={s} />
      </Sheet>
    </main>
  );
}

/** The three summary rows: hours left, the medicine, the contact the traveler was asked to protect. */
function resultRows(s: RunState): { label: string; value: string; tone: 'plain' | 'red' }[] {
  const ch = CHARACTERS[s.character];
  const calledIn = s.exposed.includes(ch.protectedContact);
  return [
    // "Hours left", not the mockup's "Time remaining": time is counted in hours (src/i18n/terms.test.ts).
    { label: t('ui.hoursLeftRow'), value: String(s.time), tone: 'plain' },
    // Red only for a confirmed serious consequence (docs/plan.md "UI rules").
    { label: t('ui.medicineRow'), value: t(s.medicine ? 'ui.kept' : 'ui.lost'), tone: s.medicine ? 'plain' : 'red' },
    {
      label: capitalize(t(`contact.${ch.protectedContact}`)),
      value: t(calledIn ? 'ui.calledIn' : 'ui.notNamed'),
      tone: calledIn ? 'red' : 'plain',
    },
  ];
}

/** Contact names start lowercase ("your brother Tom") so they read mid-sentence. */
function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
