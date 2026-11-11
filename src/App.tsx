// Screens. The game state lives in one useState; every change goes through
// playStep() from src/game/play.ts and is autosaved.
// ?autoplay=<style> (honest, liar, cautious, random, situational) instead plays
// one bot run on screen, one step a second, and saves nothing. &seed=<n> picks the run.

import { useEffect, useMemo, useRef, useState } from 'react';
import { has, t, tn } from './i18n';
import { answerKey, canFinish, canTurnBack, deskIntro, endingFor, endingText, knownLine, newRun, options, setupOf, shownCheckpoint, waitActions } from './game/engine';
import { playStep } from './game/play';
import { botAction, botSeed, isBotStyle, setupFor } from './game/bots';
import type { BotStyle } from './game/bots';
import type { Option, RunSetup } from './game/engine';
import { INSPECTION_BY_ID } from './game/content/encounters';
import { PREPARATION_MESSAGE, messagesSoFar, queueBeats } from './game/content/queues';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, FIRST_RUN, beatDelayMs } from './game/content/world';
import { DEFAULT_LEVEL, LEVELS, levelRows } from './game/content/levels';
import { browserStore, load, openQuestions, save, startOver } from './game/save';
import { recordRun } from './game/carry';
import type { SaveData } from './game/save';
import type { Action, BulletinId, CharacterId, EndingId, EvidenceId, LevelId, RunState } from './game/types';
import { CHECKPOINTS } from './game/types';
import { ChangeLines, ConsequenceLine, EvidenceContent, ScrutinyContent, SettingsContent, Sheet, StoryContent, StoryRecords, TopStrip, PickOut } from './ui/parts';
import { SEPARATOR, caughtLine, consequences, keptLines, nextActionKey, packDetail, protectedRow, questionKey } from './game/consequence';
import * as sound from './ui/sound';
import { Portrait } from './ui/art/Portrait';
import { CheckpointScene } from './ui/art/CheckpointScene';
import type { SceneState } from './ui/art/CheckpointScene';
import { BorderPost, Desk, EmptyStop, NightBus } from './ui/art/JourneyScenes';
import { CustomsQueueScene, InterviewQueueScene, QueueScene } from './ui/art/QueueScene';
import { Icon } from './ui/art/icons';

const store = browserStore();

export default function App() {
  const style = new URLSearchParams(window.location.search).get('autoplay');
  return isBotStyle(style) ? <Autoplay style={style} /> : <Game />;
}

function Game() {
  const [data, setData] = useState<SaveData>(() => load(store));
  // `same` is set by "Play again with the same setup": the begin screen for that setup, no picks.
  const [setup, setSetup] = useState<{ bulletin: BulletinId; seed: number; same?: RunSetup } | null>(null);

  useEffect(() => save(store, data), [data]);
  useEffect(() => sound.setMuted(!data.settings.sound), [data.settings.sound]);

  const run = data.run;
  const dispatch = (a: Action) => {
    if (!run) return;
    if (a.type === 'choose') sound.stamp();
    const next = playStep(run, a);
    setData((d) => recordRun(d, next));
  };

  const startSetup = () => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0;
    setSetup({ seed, bulletin: BULLETINS[Math.abs(seed) % BULLETINS.length] });
    setData(startOver);
  };

  // The ended run's traveler, packing, bulletin and seed, so the deal comes out the same.
  const startSame = () => {
    if (!run) return;
    const same = setupOf(run);
    setSetup({ seed: same.seed, bulletin: same.bulletin, same });
    setData(startOver);
  };

  return (
    <div className="shell" onPointerDown={() => sound.wakeAudio()}>
      {run ? (
        <Run s={run} dispatch={dispatch} data={data} setData={setData} onRestart={startSetup} onSame={startSame} onStartOver={startSetup} />
      ) : setup ? (
        <Setup
          bulletin={setup.bulletin}
          same={setup.same}
          endingsSeen={data.endingsSeen}
          onStart={(level, character, loadout) => {
            setData((d) => ({ ...d, run: newRun({ level, character, loadout, bulletin: setup.bulletin, seed: setup.seed }) }));
            setSetup(null);
          }}
        />
      ) : (
        <Title onStart={startSetup} questions={openQuestions(data)} />
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

function Title({ onStart, questions }: { onStart: () => void; questions: string[] }) {
  return (
    <main className="title-screen">
      <div className="paper title-card">
        <p className="mono stamp-line">{t('ui.stamp')}</p>
        <h1>{t('ui.title')}</h1>
        <p>{t('ui.tagline')}</p>
      </div>
      <div className="controls">
        <OpenQuestions questions={questions} />
        <button className="primary" onClick={onStart}>{t('ui.start')}</button>
      </div>
    </main>
  );
}

/** What the player has not found out yet, one question per ending not seen (openQuestions). Nothing once all are seen. */
function OpenQuestions({ questions }: { questions: string[] }) {
  if (questions.length === 0) return null;
  return (
    <section className="open-questions" aria-labelledby="open-questions-title">
      <h2 id="open-questions-title" className="mono">{t('ui.openQuestions')}</h2>
      <ul>
        {questions.map((q) => <li key={q}>{t(q)}</li>)}
      </ul>
    </section>
  );
}

// Setup screens, in order. They are presentation state here, not engine phases.
// Back and Continue walk this list, so a new screen (the destination briefing, 70r.3,
// goes between traveler and documents) is one more entry and one more case below.
const SETUP_STEPS = ['level', 'traveler', 'documents', 'begin'] as const;
type SetupStep = (typeof SETUP_STEPS)[number];

// Before the first ending (firstRun) there are no choices yet: Setup opens on the
// begin screen as FIRST_RUN's traveler and packing in Level 1, with no way back to the picks.
function Setup({ bulletin, same, endingsSeen, onStart }: {
  bulletin: BulletinId;
  same?: RunSetup;
  endingsSeen: readonly EndingId[];
  onStart: (level: LevelId, c: CharacterId, l: EvidenceId[]) => void;
}) {
  if (same) {
    const level = same.level ?? DEFAULT_LEVEL;
    return <BeginStep level={level} picked={same.loadout} traveler={same.character} bulletin={bulletin}
      onBegin={() => onStart(level, same.character, same.loadout)} />;
  }
  return <Picks bulletin={bulletin} endingsSeen={endingsSeen} onStart={onStart} />;
}

function Picks({ bulletin, endingsSeen, onStart }: {
  bulletin: BulletinId;
  endingsSeen: readonly EndingId[];
  onStart: (level: LevelId, c: CharacterId, l: EvidenceId[]) => void;
}) {
  const firstRun = endingsSeen.length === 0;
  const [at, setAt] = useState<SetupStep>(firstRun ? 'begin' : 'level');
  const [level, setLevel] = useState<LevelId>(DEFAULT_LEVEL);
  const [character, setCharacter] = useState<CharacterId | null>(firstRun ? FIRST_RUN.character : null);
  const [picked, setPicked] = useState<EvidenceId[]>(firstRun ? [...FIRST_RUN.loadout] : []);
  const move = (delta: number) => setAt(SETUP_STEPS[SETUP_STEPS.indexOf(at) + delta]);

  if (firstRun && character) {
    return <BeginStep level={level} picked={picked} traveler={character} onBegin={() => onStart(level, character, picked)} />;
  }
  if (at === 'level') {
    return <LevelStep endingsSeen={endingsSeen} onPick={(id) => { setLevel(id); move(1); }} />;
  }
  if (at === 'traveler' || !character) {
    return (
      <TravelerStep
        initial={character}
        onBack={() => setAt('level')}
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
  return <BeginStep level={level} picked={picked} onBack={() => move(-1)} onBegin={() => onStart(level, character, picked)} />;
}

/**
 * Setup 1, once an ending is seen: the level list. Each level is one button, so
 * a tap starts it and the traveler screen follows. Level 1 Arrival is today's mission.
 */
function LevelStep({ endingsSeen, onPick }: { endingsSeen: readonly EndingId[]; onPick: (id: LevelId) => void }) {
  const count = t('ui.progressCount', { n: SETUP_STEPS.indexOf('level') + 1, total: SETUP_STEPS.length });
  return (
    <main className="setup setup-step level-step">
      <div className="setup-body">
        <p className="setup-title">{t('ui.title')}</p>
        <header className="step-head">
          <p className="stage-label"><PickOut text={t('ui.progress', { count, name: t('ui.level') })} part={count} /></p>
          <h2 className="on-dark">{t('ui.pickLevel')}</h2>
        </header>
        <ul className="levels" aria-label={t('ui.pickLevel')}>
          {levelRows(endingsSeen).map(({ level: l, open, opensAt }) => (
            <li key={l.id}>
              <button type="button" className="level" data-level={l.id} disabled={!open} onClick={() => onPick(l.id)}>
                <span className="mono level-number">{t('ui.levelNumber', { n: l.number })}</span>
                <strong className="level-name">{t(l.title)}</strong>
                <span className="level-line">{opensAt ? tn(opensAt.key, opensAt.n) : t(l.blurb)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

/** Back on setup screens: a quiet control, so only the forward action reads as primary. */
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="back" onClick={onBack}>
      <span aria-hidden>‹ </span>{t('ui.back')}
    </button>
  );
}

/** Setup 3. Packing is where hours and scrutiny first matter, so both are explained here. */
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
        <div className="pack-scene">
          <Desk />
          {/* One message before you choose what to carry, on the phone on the desk: work wants a return date (PREPARATION_MESSAGE). */}
          <p className="msg prep-message" data-msg={PREPARATION_MESSAGE.key}>
            <span className="msg-from">{t(`msg.from.${PREPARATION_MESSAGE.from}`)}</span>
            {t(PREPARATION_MESSAGE.key)}
          </p>
        </div>
        <header className="step-head">
          <div className="step-nav">
            <BackButton onBack={onBack} />
            <p className="stage-label"><PickOut text={t('ui.progress', { count, name: t('ui.preparation') })} part={count} /></p>
          </div>
          <h2 className="on-dark">{t('ui.prepareDocuments')}</h2>
          <p className="pack-count" aria-live="polite">{t('ui.picked', { picked: picked.length, count: slots })}</p>
        </header>
        <Bulletin bulletin={bulletin} />
        {/* One cue for the whole list, in place of a tag on each row: what officers are doing today. */}
        <p className="pack-cue">{t(`bulletin.${bulletin}.cue`)}</p>
        <ul className="cards pick" aria-label={t('ui.prepareDocuments')}>
          {EVIDENCE_IDS.map((id) => (
            <li key={id}>
              <button className={`doc ${picked.includes(id) ? 'picked' : ''}`} aria-pressed={picked.includes(id)} onClick={() => toggle(id)}>
                <span className="checkbox" aria-hidden>{picked.includes(id) && <Icon name="check" />}</span>
                <span className="doc-text">
                  <strong className="doc-name">{t(`ev.${id}.label`)}</strong>
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

/** The day's bulletin bar: what officers are watching for today. */
function Bulletin({ bulletin }: { bulletin: BulletinId }) {
  return (
    <p className="bulletin" role="note" aria-label={t('ui.bulletin')}>
      <Icon name="alert" />
      <span className="bulletin-text">
        <span className="bulletin-line">{t(`bulletin.${bulletin}`)}</span>
        {/* A day with a second warning (cash on a customs day) gives it its own line in the same bar. */}
        {has(`bulletin.${bulletin}.also`) && <span className="bulletin-line">{t(`bulletin.${bulletin}.also`)}</span>}
      </span>
    </p>
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

/**
 * Setup 4. The mission, the rest of the premise and what you packed, then the one strong button.
 * On the first run there is no Back, and `traveler` names who you cross as, since nobody picked.
 * A same-setup retry also has no Back, and shows the day's `bulletin` again, since it is the same day.
 */
function BeginStep({ level, picked, traveler, bulletin, onBack, onBegin }: {
  level: LevelId;
  picked: EvidenceId[];
  traveler?: CharacterId;
  bulletin?: BulletinId;
  onBack?: () => void;
  onBegin: () => void;
}) {
  const packed = EVIDENCE_IDS.filter((id) => picked.includes(id));
  const goal = LEVELS[level];
  return (
    <main className={`setup setup-step begin-step ${bulletin ? 'same-setup' : ''}`}>
      <div className="setup-body">
        <header className="step-head">
          {onBack && <BackButton onBack={onBack} />}
          <h2 className="on-dark">{t('ui.beginCrossing')}</h2>
          {bulletin && <p className="muted-dark">{t('ui.sameSetup')}</p>}
        </header>
        {bulletin && <Bulletin bulletin={bulletin} />}
        {traveler && (
          <section className="packed-list begin-traveler">
            <h3 className="mono">{t('ui.yourTraveler')}</h3>
            <p>{t(`char.${traveler}.name`)}{SEPARATOR}{t(`char.${traveler}.role`)}</p>
          </section>
        )}
        <section className="paper mission">
          <p className="mono">{t('ui.mission')}</p>
          {/* The title says whose care it is, so "his care" in the body reads right. */}
          <h3>{t(goal.goalTitle)}</h3>
          <p>{t(goal.goalBody, { hours: goal.startTime, travel: goal.minTripTime })}</p>
          <p className="rule">{t('ui.missionRule', { n: goal.minTripTime })}</p>
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
 * Setup 2. The premise is the heading; the cards are a radio group, so a tap
 * selects and only the button moves on. The picked traveler's history waits
 * behind a disclosure, closed until opened.
 */
function TravelerStep({ initial, onBack, onContinue }: { initial: CharacterId | null; onBack: () => void; onContinue: (c: CharacterId) => void }) {
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
          <div className="step-nav">
            <BackButton onBack={onBack} />
            <p className="stage-label"><PickOut text={t('ui.progress', { count, name: t('ui.traveler') })} part={count} /></p>
          </div>
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

function Run({ s, dispatch, data, setData, onRestart, onSame, onStartOver }: {
  s: RunState;
  dispatch: (a: Action) => void;
  data: SaveData;
  setData: React.Dispatch<React.SetStateAction<SaveData>>;
  onRestart: () => void;
  /** "Play again with the same setup" on the ending. Unset in autoplay. */
  onSame?: () => void;
  /** Start over in the settings sheet. Unset in autoplay. */
  onStartOver?: () => void;
}) {
  const [sheet, setSheet] = useState<'story' | 'evidence' | 'scrutiny' | 'settings' | null>(null);
  const [beats, setBeats] = useState({ at: '', n: 1 });
  const usedBefore = useUsedBefore(s);
  const readBefore = useReadBefore(s.seed, data.beatsSeen);
  // The last officer line still shows before the ending card.
  if (s.ending && !s.reaction) return <Ending s={s} questions={openQuestions(data)} onRestart={onRestart} onSame={onSame} />;

  // The last reaction at a checkpoint shows with the next queue already set; its officer is the one just left.
  const sceneAt = shownCheckpoint(s);
  const officerKey = s.screen.kind === 'inspection' ? 'inspection' : CHECKPOINTS[sceneAt];
  const close = () => setSheet(null);
  const queue = s.screen.kind === 'between' && !s.reaction ? s.screen.next : null;
  // How many beats of this queue are up. It lives here so My story lists the messages seen
  // so far; a new run or checkpoint starts again from the first beat.
  const queueAt = `${s.seed}.${queue}`;
  const queueShown = beats.at === queueAt ? beats.n : 1;
  const sceneState: SceneState = {
    handedOver: s.used.length > (usedBefore[sceneAt] ?? s.used.length),
    writing: !!s.reaction && (s.changes ?? []).some((c) => c.key.startsWith('change.onFile.')),
    away: s.screen.kind === 'wait',
    medicine: s.medicine,
    inspection: s.screen.kind === 'inspection' ? INSPECTION_BY_ID.get(s.screen.id)?.kind ?? null : null,
  };
  return (
    <main className="run">
      <TopStrip s={s} onScrutiny={() => setSheet('scrutiny')} />
      {queue !== null ? (
        // Keyed by run and checkpoint, so each queue starts again from its first beat.
        <Queue key={queueAt} next={queue} s={s} still={data.settings.reduceMotion} readBefore={readBefore}
          onRead={(key) => setData((d) => (d.beatsSeen.includes(key) ? d : { ...d, beatsSeen: [...d.beatsSeen, key] }))}
          shown={queueShown} setShown={(n) => setBeats({ at: queueAt, n })} onDone={() => dispatch({ type: 'ack' })}
          onTurnBack={canTurnBack(s) ? () => dispatch({ type: 'turnBack' }) : undefined} />
      ) : (
        <>
          <div className={`scene scene-${CHECKPOINTS[sceneAt]} ${data.settings.reduceMotion ? 'still' : ''}`}>
            <div className="officer">
              <CheckpointScene checkpoint={CHECKPOINTS[sceneAt]} character={s.character} state={sceneState} />
              <span className="mono officer-label" aria-hidden>{t(`officer.${officerKey}`)}</span>
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
      <Sheet open={sheet === 'story'} onClose={close} title={t('ui.myStory')}><StoryContent s={s} messages={messagesSoFar(s, queueShown)} /></Sheet>
      <Sheet open={sheet === 'evidence'} onClose={close} title={t('ui.evidence')}><EvidenceContent s={s} /></Sheet>
      <Sheet open={sheet === 'scrutiny'} onClose={close} title={t('ui.scrutiny')}><ScrutinyContent s={s} /></Sheet>
      <Sheet open={sheet === 'settings'} onClose={close} title={t('ui.settings')}>
        <SettingsContent settings={data.settings} onChange={(settings) => setData((d) => ({ ...d, settings }))}
          onStartOver={onStartOver && (() => { close(); onStartOver(); })} />
      </Sheet>
    </main>
  );
}

/**
 * The queue beats read in earlier runs: the save's list as it was when this run
 * began, so a beat first read on this run is not offered as skippable on it.
 */
function useReadBefore(seed: number, beatsSeen: readonly string[]): ReadonlySet<string> {
  const [read, setRead] = useState<{ seed: number; keys: ReadonlySet<string> }>(() => ({ seed, keys: new Set(beatsSeen) }));
  // Adjusting state while rendering, as React allows for values derived from earlier renders.
  if (read.seed !== seed) {
    const next = { seed, keys: new Set(beatsSeen) };
    setRead(next);
    return next.keys;
  }
  return read.keys;
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

/**
 * The story beat ("Your mother answers on the second ring."), then the result rows under
 * it, one per change ("Visit verified.", "On file at Customs: your mother's number."),
 * then a button that says what comes next. The beat and the rows are separate blocks, so
 * what happened in the scene never reads as one paragraph with what it changed.
 */
function Reaction({ s, dispatch }: { s: RunState; dispatch: (a: Action) => void }) {
  return (
    <>
      <section className="panel paper reaction" aria-live="polite">
        <div className="story-beat">
          {s.reaction!.map((r, i) => <p key={i} className="said">{t(r.key, r.vars)}</p>)}
        </div>
        <ChangeLines changes={s.changes ?? []} />
      </section>
      <div className="controls">
        <button className="primary" autoFocus onClick={() => dispatch({ type: 'ack' })}>{t(nextActionKey(s))}</button>
      </div>
    </>
  );
}

/**
 * The queue before a checkpoint, one beat per tap (on the scene, the message or the button).
 * A short scene cropped around the booth, then the current beat alone under it: a phone
 * message with its sender, or what is said or seen. Earlier messages stay in My story.
 * The strip already says "In the queue", so the scene does not.
 * The last beat (the clerk's "Next.") swaps Continue for the walk up to the officer, which is the engine's ack.
 * In the passport queue the last beat also offers to leave the queue (onTurnBack), the one
 * early point to turn back before any desk decides (canTurnBack() in src/game/engine.ts).
 * A beat read in an earlier run (readBefore) offers one tap past every read beat in a row,
 * up to the next new one or the last.
 */
function Queue({ next, s, still, readBefore, onRead, shown, setShown, onDone, onTurnBack }: {
  next: number; s: RunState; still: boolean; readBefore: ReadonlySet<string>; onRead: (key: string) => void;
  shown: number; setShown: (n: number) => void; onDone: () => void; onTurnBack?: () => void;
}) {
  const character = s.character;
  const beats = queueBeats(next, s);
  const done = shown >= beats.length;
  const seen = beats.slice(0, shown);
  const current = seen[seen.length - 1];
  const advance = () => { if (!done) setShown(shown + 1); };
  useEffect(() => onRead(current.key), [current.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Past the read beats in a row after this one: to the next new beat, or the last.
  const fresh = beats.findIndex((b, i) => i >= shown && !readBefore.has(b.key));
  const skipTo = fresh === -1 ? beats.length : fresh + 1;
  const canSkip = !done && readBefore.has(current.key) && skipTo > shown + 1;
  // In the passport queue the booth light turns green on the clerk's "Next.".
  const art = next === 0 ? <QueueScene light={seen.some((b) => b.light === 'green') ? 'green' : 'red'} character={character} />
    : next === 1 ? <CustomsQueueScene character={character} />
    : <InterviewQueueScene character={character} />;

  return (
    <>
      <div className={`scene scene-${CHECKPOINTS[next]} queue-scene ${still ? 'still' : ''}`} onClick={advance}>
        {art}
        <div className="flicker" aria-hidden />
      </div>
      <section className={`panel queue-beat ${current.kind}`} aria-live="polite" onClick={advance}>
        <p key={current.key} className="msg" data-kind={current.kind}>
          {current.from && <span className="msg-from">{t(`msg.from.${current.from}`)}</span>}
          {t(current.key)}
        </p>
      </section>
      <div className="controls">
        <button className="primary" autoFocus onClick={done ? onDone : advance}>
          {done ? t(`queue.${next}.go`) : t('ui.continue')}
        </button>
        {canSkip && <button className="turn-back skip-read" onClick={() => setShown(skipTo)}>{t('ui.skipRead')}</button>}
        {done && onTurnBack && <button className="turn-back" onClick={onTurnBack}>{t(`queue.${next}.turnBack`)}</button>}
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
  const question = t(questionKey(s, prefix, id));
  // The question sits right on top of the answers: a short one is a big heading on its
  // own, a longer one goes in a light card so it still reads as the officer speaking.
  // A challenge card quotes what you said and the fact that catches it, so it always gets the card.
  const caught = sc.kind === 'encounter' ? caughtLine(s, id) : undefined;
  const short = !caught && question.length <= SHORT_QUESTION;
  // On reaching a desk, one line says what this officer cares about.
  const desk = deskIntro(s);
  // On every desk card, one line of what this officer already knows, from the file.
  const known = knownLine(s);
  // Once the bus is out of reach, say so plainly and offer to finish instead of more clicking.
  const finishing = canFinish(s);
  return (
    <>
      <section className={`panel ask ${short ? 'ask-short' : 'paper ask-card'} ${sc.kind === 'inspection' ? 'inspection' : ''}`} aria-live="polite">
        {finishing && <p className="priority doomed">{t('ui.doomed')}</p>}
        {desk && <p className="priority">{t(`officer.${desk}.priority`)}</p>}
        {known.length > 0 && <p className="known" data-known>{known.map((k) => t(k.key, k.vars)).join(' ')}</p>}
        <h2 className="question">{question}</h2>
        {caught && <p className="caught">{t(caught.key, caught.vars)}</p>}
      </section>
      <div className="controls stack">
        {options(s).map((o) => (
          <button
            key={o.approach.id}
            className="choice"
            disabled={!!o.blocked}
            onClick={() => dispatch({ type: 'choose', approach: o.approach.id })}
          >
            <span className="choice-label">{optionLabel(s, o)}</span>
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
function optionLabel(s: RunState, o: Option): string {
  if (o.blocked === 'noCard') return t('ui.showDocument');
  if (o.blocked === 'noContact') return t('ui.nameSomeone');
  const vars: Record<string, string> = {};
  if (o.card) vars.card = vars.cardThe = o.card;
  if (o.contact) vars.contact = vars.contactMine = o.contact;
  return t(answerKey(s, o.approach.id, 'label'), vars);
}

/**
 * A check: one plain line saying what they are doing ("They're checking your passport."),
 * the latest observation under it, then the actions. Beats play on their own (2-5 s, or
 * 0.6 s with shorter waits) and a tap skips ahead; the buttons show once they are done.
 */
function Waiting({ s, dispatch, reduceWait }: { s: RunState; dispatch: (a: Action) => void; reduceWait: boolean }) {
  const sc = s.screen as Extract<RunState['screen'], { kind: 'wait' }>;
  const done = sc.shown >= sc.beats.length;
  const cp = CHECKPOINTS[Math.min(s.checkpoint, 2)];
  const delay = useMemo(() => beatDelayMs(sc.beats[sc.shown] ?? 0, reduceWait), [reduceWait, sc.shown, sc.beats]);
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
        <h2 className="question">{t(`check.${sc.check}.title`)}</h2>
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
                    {/* A contact reads like the answer cards: what it shares, red only for the protected one. */}
                    <span className={`part ${w.blocked ? 'plain' : w.contact === protectedContact ? 'red' : w.contact ? 'plain' : 'amber'}`}>
                      {w.blocked ? t(`ui.blocked.${w.blocked}`) : t(w.contact ? `contact.${w.contact}.shares` : `wait.${w.action}.detail`)}
                    </span>
                    {/* After the guaranteed cost, the possible gain: "May verify your address". */}
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
 * The ending as a result card (Yury's design review, 2026-11-09): the scene, the outcome
 * and the ending's name in amber, one line on what you kept, the worst consequence as a
 * heading and a line (then any others), the epilogue, and a run summary with hours left
 * and the other stats. Then "See border records", which opens the records alone, and
 * "Play again", with "Play again with the same setup" under it (onSame).
 */
function Ending({ s, questions, onRestart, onSame }: { s: RunState; questions: string[]; onRestart: () => void; onSame?: () => void }) {
  const [story, setStory] = useState(false);
  const ending = s.ending ?? endingFor(s);
  const text = endingText(s);
  const cost = consequences(s);
  return (
    <main className={`ending ending-${ending}`}>
      <p className="setup-title">{t('ui.title')}</p>
      <div className="ending-scene">
        {ending === 'turnedBack' ? <BorderPost closed />
          : text === 'missedBus' ? <EmptyStop medicine={s.medicine} character={s.character} />
          : <NightBus medicine={s.medicine} character={s.character} />}
      </div>
      <section className="paper ending-card">
        <p className="mono outcome">{t(ending === 'turnedBack' ? 'ui.crossingRefused' : 'ui.crossingComplete')}</p>
        <h1>{t(`ending.${text}.title`)}</h1>
        <p className="kept">{keptLines(s).map((k) => t(k.key, k.vars)).join(' ')}</p>
        {/* Worst first, a heading and one line each, no severity tag (pfi.13 notes). */}
        {cost.length > 0 && (
          <ul className="costs">
            {cost.map((l, i) => (
              <li key={i} className={`cost ${l.kind}${i === 0 ? ' worst' : ''}`}>
                <h2 className="cost-title">{t(`${l.key}.title`, l.vars)}</h2>
                {/* Why naming them did this (EndingLine.reason), before what it did. */}
                {l.reason && <p className="cost-reason">{t(l.reason, l.vars)}</p>}
                <p className="cost-line">{t(l.key, l.vars)}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="epilogue">{t(`ending.${text}.body`)}</p>
        <div className="run-summary">
          <h3 className="mono">{t('ui.runSummary')}</h3>
          <dl className="result-rows">
            {resultRows(s).map((r) => (
              <div key={r.label} className="result-row">
                <dt>{r.label}</dt>
                <dd className={r.tone}>{r.value}</dd>
              </div>
            ))}
          </dl>
          <OpenQuestions questions={questions} />
        </div>
      </section>
      {/* Sticky, so Play again stays in view however long the story above runs (pfi.9). */}
      <div className="controls">
        {/* The two quiet buttons share one row, so the ending still fits the phone with all three. */}
        <div className="ending-row">
          <button className="choice see-file" aria-haspopup="dialog" onClick={() => setStory(true)}>{t('ui.seeOnFile')}</button>
          {onSame && <button className="choice play-same" onClick={onSame}>{t('ui.playSameSetup')}</button>}
        </div>
        <button className="primary play-again" onClick={onRestart}>{t('ui.playAgain')}</button>
      </div>
      {/* The records alone: the epilogue and the consequences stay on the ending screen above. */}
      <Sheet open={story} onClose={() => setStory(false)} title={t('ui.borderRecords')}>
        <StoryRecords s={s} />
      </Sheet>
    </main>
  );
}

/** The run summary under the story: hours left, the medicine, the contact the traveler was asked to protect. */
function resultRows(s: RunState): { label: string; value: string; tone: 'plain' | 'red' }[] {
  const ch = CHARACTERS[s.character];
  // The exact result ("Added to watch list"), from the same consequence heading.
  const contact = protectedRow(s);
  return [
    // "Hours left", not the mockup's "Time remaining": time is counted in hours (src/i18n/terms.test.ts).
    { label: t('ui.hoursLeftRow'), value: String(s.time), tone: 'plain' },
    // Red only for a confirmed serious consequence (docs/plan.md "UI rules").
    { label: t('ui.medicineRow'), value: t(s.medicine ? 'ui.kept' : 'ui.lost'), tone: s.medicine ? 'plain' : 'red' },
    {
      label: capitalize(t(`contact.${ch.protectedContact}`)),
      value: t(contact.key),
      tone: contact.tone,
    },
  ];
}

/** Contact names start lowercase ("your brother Tom") so they read mid-sentence. */
function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
