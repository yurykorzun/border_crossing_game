// Screens. The game state lives in one useState; every change goes through
// playStep() from src/game/play.ts and is autosaved.
// ?autoplay=<style> (honest, liar, cautious, random, situational) instead plays
// one bot run on screen, one step a second, and saves nothing. &seed=<n> picks the run.

import { useEffect, useMemo, useRef, useState } from 'react';
import { has, setStory, t, tn } from './i18n';
import { answerKey, canFinish, canTurnBack, chooseAction, deskIntro, endingFor, endingText, knownLine, newRun, observation, options, setupOf, shownCheckpoint, waitActions, waitKey } from './game/engine';
import { playStep } from './game/play';
import { botAction, botSeed, isBotStyle, setupFor } from './game/bots';
import type { BotStyle } from './game/bots';
import type { Option, RunSetup } from './game/engine';
import { INSPECTION_BY_ID } from './game/content/encounters';
import { PREPARATION_MESSAGE, messagesSoFar, queueBeats } from './game/content/queues';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, FIRST_RUN, beatDelayMs } from './game/content/world';
import { DEFAULT_LEVEL, LEVELS, levelRows, nextLevel, showsLevelList } from './game/content/levels';
import { browserStore, load, save, startOver } from './game/save';
import { defaultFile, ownFile, recordRun } from './game/carry';
import type { SaveData, Settings } from './game/save';
import type { Action, BulletinId, CarriedFile, CharacterId, EndingId, EvidenceId, LevelId, RunState } from './game/types';
import { CHECKPOINTS } from './game/types';
import { ChangeLines, ConsequenceLine, EvidenceContent, ScrutinyContent, SettingsContent, Sheet, StoryContent, StoryRecords, TopStrip, PickOut } from './ui/parts';
import { SEPARATOR, axisLines, caughtLine, consequences, decisive, laterBeat, nextActionKey, packDetail, packedList, protectedRow, questionKey, questionVars, recordLines } from './game/consequence';
import * as sound from './ui/sound';
import { Portrait } from './ui/art/Portrait';
import { CheckpointScene } from './ui/art/CheckpointScene';
import type { SceneState } from './ui/art/CheckpointScene';
import { BorderPost, Desk, EmptyStop, NightBus, PlaneWindow, Ward } from './ui/art/JourneyScenes';
import { CustomsQueueScene, InterviewQueueScene, QueueScene } from './ui/art/QueueScene';
import { Icon } from './ui/art/icons';

const store = browserStore();

export default function App() {
  const style = new URLSearchParams(window.location.search).get('autoplay');
  return isBotStyle(style) ? <Autoplay style={style} /> : <Game />;
}

function Game() {
  const [data, setData] = useState<SaveData>(() => load(store));
  // An unfinished run saved on an earlier visit waits on the title for Resume crossing or
  // New crossing. A finished one opens on its ending, where the next steps are (dap.8).
  const [resumed, setResumed] = useState(() => data.run === null || !!data.run.ending);
  // `same` is set by Retry on the ending: the begin screen for that setup, no picks.
  // `next` is set by "Continue to ...": that level as the same traveler, from their file.
  const [setup, setSetup] = useState<{ bulletin: BulletinId; seed: number; same?: RunSetup; next?: NextLevel } | null>(null);

  useEffect(() => save(store, data), [data]);
  useEffect(() => sound.setMuted(!data.settings.sound), [data.settings.sound]);

  const run = data.run;
  // A run shows in its level's own wording, and so does the title it waits on (a saved
  // Departure run shows the DEPARTURES stamp); setup sets the level it is on (Picks).
  setStory(run ? run.level : undefined);
  const dispatch = (a: Action) => {
    if (!run) return;
    if (a.type === 'choose') sound.stamp();
    const next = playStep(run, a);
    setData((d) => recordRun(d, next));
  };

  const newDay = () => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0;
    return { seed, bulletin: BULLETINS[Math.abs(seed) % BULLETINS.length] };
  };

  const startSetup = () => {
    setResumed(true);
    setSetup(newDay());
    setData(startOver);
  };

  // The next level as the ended run's traveler. The ended run is recorded first (recordRun()
  // leaves an already recorded run as it is), so the saved file is this run's file.
  const startNext = (level: LevelId) => {
    if (!run) return;
    setSetup({ ...newDay(), next: { level, character: run.character } });
    setData((d) => startOver(recordRun(d, run)));
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
      {run && resumed ? (
        <Run s={run} dispatch={dispatch} data={data} setData={setData} onChoose={startSetup} onRetry={startSame} onNext={startNext} onStartOver={startSetup} />
      ) : setup ? (
        <Setup
          bulletin={setup.bulletin}
          same={setup.same}
          next={setup.next}
          endingsSeen={data.endingsSeen}
          levelsFinished={data.levelsFinished}
          savedFile={data.file}
          seed={setup.seed}
          onExit={() => setSetup(null)}
          onStart={(level, character, loadout, file) => {
            setData((d) => ({ ...d, run: newRun({ level, character, loadout, bulletin: setup.bulletin, seed: setup.seed, ...(file ? { file } : {}) }) }));
            setSetup(null);
          }}
        />
      ) : (
        <Title saved={run !== null && !run.ending} onStart={startSetup} onResume={() => setResumed(true)}
          settings={data.settings} onSettings={(settings) => setData((d) => ({ ...d, settings }))} />
      )}
    </div>
  );
}

const AUTOPLAY_STEP_MS = 1000;

interface AutoRun { s: RunState; botRng: number }

function autoRun(index: number): AutoRun {
  setStory(undefined);
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
      <Run s={s} dispatch={dispatch} data={shown} setData={setData} onChoose={() => setAuto(autoRun(randomIndex()))} />
    </div>
  );
}

/**
 * The title, one group: the name, the border post from the traveler screen, the premise,
 * then Begin and a quiet Settings. With a saved run Begin becomes Resume crossing, and
 * New crossing under it drops that run (startOver) and keeps endings and settings.
 */
export function Title({ saved, onStart, onResume, settings, onSettings }: {
  saved: boolean;
  onStart: () => void;
  onResume: () => void;
  settings: Settings;
  onSettings: (next: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <main className="title-screen">
      <div className="paper title-card">
        <p className="mono stamp-line">{t('ui.stamp')}</p>
        <h1>{t('ui.title')}</h1>
        <div className="title-scene"><BorderPost /></div>
        <p className="title-premise">{t('ui.tagline')}</p>
      </div>
      <div className="controls">
        {saved ? (
          <>
            <button className="primary resume" onClick={onResume}>{t('ui.resume')}</button>
            <button className="quiet new-crossing" onClick={onStart}>{t('ui.newCrossing')}</button>
          </>
        ) : (
          <button className="primary begin" onClick={onStart}>{t('ui.start')}</button>
        )}
        <button className="quiet title-settings" aria-haspopup="dialog" onClick={() => setOpen(true)}>{t('ui.settings')}</button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('ui.settings')}>
        <SettingsContent settings={settings} onChange={onSettings} />
      </Sheet>
    </main>
  );
}

// Setup screens, in order. They are presentation state here, not engine phases.
// Back and Continue walk this list, so a new screen (the destination briefing, 70r.3,
// goes between traveler and documents) is one more entry and one more case below.
const SETUP_STEPS = ['level', 'traveler', 'record', 'documents', 'begin'] as const;
type SetupStep = (typeof SETUP_STEPS)[number];

/**
 * The steps this player walks: the level list only when more than one level is open
 * (showsLevelList), and the traveler's record only in a level that reads one (Level.readsFile).
 */
const stepsFor = (levelsFinished: readonly LevelId[], level: LevelId): readonly SetupStep[] =>
  SETUP_STEPS.filter((s) => (s !== 'level' || showsLevelList(levelsFinished)) && (s !== 'record' || !!LEVELS[level].readsFile));

/** Starts a run: the level, traveler and packing, and the file a level that reads one opens with. */
type OnStart = (level: LevelId, c: CharacterId, l: EvidenceId[], file?: CarriedFile) => void;

/** "Continue to ..." from an ending: the next level, as the traveler who just finished. */
interface NextLevel { level: LevelId; character: CharacterId }

/** "2 / 4" on a setup screen, counted over the steps this player walks. */
const stepCount = (steps: readonly SetupStep[], step: SetupStep) =>
  t('ui.progressCount', { n: steps.indexOf(step) + 1, total: steps.length });

// Before the first ending (firstRun) there is no traveler to choose yet: Setup opens on the
// begin screen as FIRST_RUN's traveler and packing in Level 1. Back goes to the title, and
// Change documents opens the packing screen with FIRST_RUN's picks kept.
function Setup({ bulletin, same, next, endingsSeen, levelsFinished, savedFile, seed, onExit, onStart }: {
  bulletin: BulletinId;
  same?: RunSetup;
  next?: NextLevel;
  endingsSeen: readonly EndingId[];
  levelsFinished: readonly LevelId[];
  savedFile: CarriedFile | null;
  seed: number;
  onExit: () => void;
  onStart: OnStart;
}) {
  if (same) {
    const level = same.level ?? DEFAULT_LEVEL;
    setStory(level);
    return <BeginStep level={level} picked={same.loadout} traveler={same.character} bulletin={bulletin}
      onBegin={() => onStart(level, same.character, same.loadout, same.file)} />;
  }
  return <Picks bulletin={bulletin} next={next} endingsSeen={endingsSeen} levelsFinished={levelsFinished} savedFile={savedFile} seed={seed} onExit={onExit} onStart={onStart} />;
}

function Picks({ bulletin, next, endingsSeen, levelsFinished, savedFile, seed, onExit, onStart }: {
  bulletin: BulletinId;
  /** Set from an ending's "Continue to ...": that level and traveler, picked already. */
  next?: NextLevel;
  endingsSeen: readonly EndingId[];
  levelsFinished: readonly LevelId[];
  savedFile: CarriedFile | null;
  seed: number;
  /** Back from the first step: the title. */
  onExit: () => void;
  onStart: OnStart;
}) {
  const firstRun = endingsSeen.length === 0 && !next;
  const [level, setLevel] = useState<LevelId>(next?.level ?? DEFAULT_LEVEL);
  // The file the run opens with, picked on the record step (RecordStep).
  const [file, setFile] = useState<CarriedFile | undefined>(undefined);
  const steps = stepsFor(levelsFinished, level);
  // Continuing opens on the step after the traveler: in Departure, the traveler's file.
  const [at, setAt] = useState<SetupStep>(firstRun ? 'begin' : next ? steps[steps.indexOf('traveler') + 1] : steps[0]);
  setStory(level);
  const [character, setCharacter] = useState<CharacterId | null>(next?.character ?? (firstRun ? FIRST_RUN.character : null));
  const [picked, setPicked] = useState<EvidenceId[]>(firstRun ? [...FIRST_RUN.loadout] : []);
  const move = (delta: number) => setAt(steps[steps.indexOf(at) + delta]);
  const begin = (c: CharacterId) => onStart(level, c, picked, LEVELS[level].readsFile ? file : undefined);

  if (firstRun && character) {
    // No traveler screen yet, so packing goes back and forward to the begin screen.
    if (at === 'documents') {
      return <DocumentsStep count={stepCount(steps, 'documents')} character={character} bulletin={bulletin} picked={picked} setPicked={setPicked} onBack={() => setAt('begin')} onContinue={() => setAt('begin')} />;
    }
    return <BeginStep level={level} picked={picked} traveler={character} onBack={onExit} onChangeDocuments={() => setAt('documents')} onBegin={() => begin(character)} />;
  }
  if (at === 'level') {
    // The next step comes from the level picked, since only some levels have a record step.
    return <LevelStep steps={steps} levelsFinished={levelsFinished} onPick={(id) => { setLevel(id); setAt('traveler'); }} />;
  }
  if (at === 'traveler' || !character) {
    return (
      <TravelerStep
        initial={character}
        count={stepCount(steps, 'traveler')}
        onBack={steps[0] === 'traveler' ? onExit : () => setAt('level')}
        onContinue={(c) => {
          // A traveler with fewer slots keeps only the first picks that still fit.
          setPicked((p) => p.slice(0, CHARACTERS[c].evidenceSlots));
          // Another traveler's file never opens this one's crossing.
          if (c !== character) setFile(undefined);
          setCharacter(c);
          move(1);
        }}
      />
    );
  }
  if (at === 'record' || (steps.includes('record') && !file)) {
    return (
      <RecordStep count={stepCount(steps, 'record')} traveler={character} saved={ownFile(savedFile, character)}
        onBack={() => setAt('traveler')}
        onPick={(f) => { setFile(f ?? defaultFile(seed, character)); setAt('documents'); }} />
    );
  }
  if (at === 'documents') {
    return <DocumentsStep count={stepCount(steps, 'documents')} character={character} bulletin={bulletin} picked={picked} setPicked={setPicked} onBack={() => move(-1)} onContinue={() => move(1)} />;
  }
  // Change documents is the way to packing, so Back goes one screen further, to the traveler.
  return <BeginStep level={level} picked={picked} traveler={character} onBack={() => setAt('traveler')} onChangeDocuments={() => setAt('documents')} onBegin={() => begin(character)} />;
}

/**
 * Departure's record step, after the traveler: a short recap of this traveler's file
 * from their last crossing, then a choice. Continue opens the crossing with that file;
 * Play standalone opens it with a seeded default file (defaultFile()) and leaves the
 * saved file as it is (recordRun()). Only the traveler's own file is offered, so
 * Lena's file never opens Mark's crossing.
 */
function RecordStep({ count, traveler, saved, onBack, onPick }: {
  count: string;
  traveler: CharacterId;
  saved: CarriedFile | null;
  onBack: () => void;
  /** The saved file to continue with, or undefined for a standalone run. */
  onPick: (file: CarriedFile | undefined) => void;
}) {
  const name = t(`char.${traveler}.name`);
  const [title, ...lines] = saved ? recordLines(saved) : [];
  return (
    <main className="setup setup-step record-step">
      <div className="setup-body">
        <p className="setup-title">{t('ui.title')}</p>
        <header className="step-head">
          <div className="step-nav">
            <BackButton onBack={onBack} />
            <p className="stage-label"><PickOut text={t('ui.progress', { count, name: t('ui.record.title') })} part={count} /></p>
          </div>
        </header>
        {saved ? (
          <section className="paper file-record" data-record>
            <h2>{t(title.key)}</h2>
            <ul>{lines.map((l, i) => <li key={i}>{t(l.key, l.vars)}</li>)}</ul>
            {/* What carrying it changes, in one line (dap.8). */}
            <p className="record-carries">{t('ui.record.carries')}</p>
          </section>
        ) : (
          <p className="muted-dark record-none" data-record-none>{t('ui.record.noFile', { traveler: name })}</p>
        )}
      </div>
      <div className="controls stack">
        {saved && <button className="primary record-continue" onClick={() => onPick(saved)}>{t('ui.record.continue', { traveler: name })}</button>}
        <button className={`${saved ? 'quiet' : 'primary'} record-standalone`} onClick={() => onPick(undefined)}>{t('ui.record.standalone')}</button>
        <p className="muted-dark record-note">{t('ui.record.standaloneNote')}</p>
      </div>
    </main>
  );
}

/**
 * Setup 1, once a second level is open: the level list. Each level is one button, so
 * a tap starts it and the traveler screen follows. Level 1 Arrival is today's mission.
 */
function LevelStep({ steps, levelsFinished, onPick }: { steps: readonly SetupStep[]; levelsFinished: readonly LevelId[]; onPick: (id: LevelId) => void }) {
  const count = stepCount(steps, 'level');
  return (
    <main className="setup setup-step level-step">
      <div className="setup-body">
        <p className="setup-title">{t('ui.title')}</p>
        <header className="step-head">
          <p className="stage-label"><PickOut text={t('ui.progress', { count, name: t('ui.level') })} part={count} /></p>
          <h2 className="on-dark">{t('ui.pickLevel')}</h2>
        </header>
        <ul className="levels" aria-label={t('ui.pickLevel')}>
          {levelRows(levelsFinished).map(({ level: l, open, opensAfter }) => (
            <li key={l.id}>
              <button type="button" className="level" data-level={l.id} disabled={!open} onClick={() => onPick(l.id)}>
                <span className="mono level-number">{t('ui.levelNumber', { n: l.number })}</span>
                <strong className="level-name">{t(l.title)}</strong>
                <span className="level-line">{opensAfter ? t(opensAfter.key, { level: t(opensAfter.level.title) }) : t(l.blurb)}</span>
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
export function DocumentsStep({ count, character, bulletin, picked, setPicked, onBack, onContinue }: {
  count: string;
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
          <div className="pack-title">
            <h2 className="on-dark">{t('ui.prepareDocuments')}</h2>
            <p className="pack-count" aria-live="polite">{t('ui.picked', { picked: picked.length, count: slots })}</p>
          </div>
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
 * Setup 4, the final check: the mission in four short lines, who you cross as and what
 * you packed, then Begin the crossing with Change documents and Back beside it.
 * The hours come from the level data. Cash and the phone wait until they matter.
 * A same-setup retry has no Back or Change documents, and shows the day's `bulletin`
 * again, since it is the same day.
 */
export function BeginStep({ level, picked, traveler, bulletin, onBack, onChangeDocuments, onBegin }: {
  level: LevelId;
  picked: EvidenceId[];
  traveler: CharacterId;
  bulletin?: BulletinId;
  onBack?: () => void;
  onChangeDocuments?: () => void;
  onBegin: () => void;
}) {
  const goal = LEVELS[level];
  return (
    <main className={`setup setup-step begin-step ${bulletin ? 'same-setup' : ''}`}>
      <div className="setup-body">
        <header className="step-head">
          <h2 className="on-dark">{t('ui.beforeYouCross')}</h2>
          {bulletin && <p className="muted-dark">{t('ui.sameSetup')}</p>}
        </header>
        {bulletin && <Bulletin bulletin={bulletin} />}
        <section className="paper mission">
          {/* The title says whose care it is, so "his care" in the body reads right. */}
          <h3>{t(goal.goalTitle)}</h3>
          <p>{t(goal.goalBody)}</p>
          <p className="mission-clock">
            <span>{tn('ui.lastBus', goal.startTime)}</span>
            <span>{tn('ui.allowTravel', goal.minTripTime)}</span>
          </p>
        </section>
        <section className="packed-list begin-traveler">
          <p className="begin-who">{t(`char.${traveler}.name`)}{SEPARATOR}{t(`char.${traveler}.role`)}</p>
          <p className="begin-packed">{t('ui.packedList', { list: packedList(picked) })}</p>
        </section>
      </div>
      <div className="controls">
        <button className="primary" onClick={onBegin}>{t('ui.beginCrossing')}</button>
        {(onBack || onChangeDocuments) && (
          <div className="begin-more">
            {onBack && <button type="button" className="quiet back-quiet" onClick={onBack}><span aria-hidden>‹ </span>{t('ui.back')}</button>}
            {onChangeDocuments && <button type="button" className="quiet change-docs" onClick={onChangeDocuments}>{t('ui.changeDocuments')}</button>}
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * Setup 2. The premise is the heading; the cards are a radio group, so a tap
 * selects and only the button moves on. The picked traveler's history waits
 * behind a disclosure, closed until opened.
 */
export function TravelerStep({ initial, count, onBack, onContinue }: { initial: CharacterId | null; count: string; onBack: () => void; onContinue: (c: CharacterId) => void }) {
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

function Run({ s, dispatch, data, setData, onChoose, onRetry, onNext, onStartOver }: {
  s: RunState;
  dispatch: (a: Action) => void;
  data: SaveData;
  setData: React.Dispatch<React.SetStateAction<SaveData>>;
  /** "Choose a crossing" on the ending: the level list. */
  onChoose: () => void;
  /** "Retry ..." on the ending, the same setup again. Unset in autoplay. */
  onRetry?: () => void;
  /** "Continue to ..." on the ending, the next level as this traveler. Unset in autoplay. */
  onNext?: (level: LevelId) => void;
  /** Start over in the settings sheet. Unset in autoplay. */
  onStartOver?: () => void;
}) {
  const [sheet, setSheet] = useState<'story' | 'evidence' | 'scrutiny' | 'settings' | null>(null);
  const [beats, setBeats] = useState({ at: '', n: 1 });
  const usedBefore = useUsedBefore(s);
  const readBefore = useReadBefore(s.seed, data.beatsSeen);
  // The last officer line still shows before the ending card.
  if (s.ending && !s.reaction) return <Ending s={s} onChoose={onChoose} onRetry={onRetry} onNext={onNext} />;

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
 * it, one per change ("Visit verified.", "Customs has your mother's number."),
 * then what it resolves for later ("The prescription is settled."), then a button that says
 * what comes next. Happened, changed and resolves are separate blocks, so what happened in
 * the scene never reads as one paragraph with what it changed.
 */
export function Reaction({ s, dispatch }: { s: RunState; dispatch: (a: Action) => void }) {
  const changes = s.changes ?? [];
  return (
    <>
      <section className="panel paper reaction" aria-live="polite">
        <div className="story-beat" data-line="happened">
          {s.reaction!.map((r, i) => <p key={i} className="said">{t(r.key, r.vars)}</p>)}
        </div>
        <ChangeLines changes={changes.filter((c) => !c.resolves)} />
        <ChangeLines changes={changes.filter((c) => c.resolves)} resolves />
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
  const question = t(questionKey(s, prefix, id), questionVars(s, id));
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
  // The list behind "Show a document" keeps only the question over the documents,
  // and a way back to the other answers under them.
  const list = !!s.documentList;
  return (
    <>
      <section className={`panel ask ${short ? 'ask-short' : 'paper ask-card'} ${sc.kind === 'inspection' ? 'inspection' : ''}`} aria-live="polite">
        {finishing && !list && <p className="priority doomed">{t('ui.doomed')}</p>}
        {desk && !list && <p className="priority">{t(`officer.${desk}.priority`)}</p>}
        {known.length > 0 && !list && <p className="known" data-known>{known.map((k) => t(k.key, k.vars)).join(' ')}</p>}
        <h2 className="question">{question}</h2>
        {caught && <p className="caught">{t(caught.key, caught.vars)}</p>}
      </section>
      <div className="controls stack">
        {options(s).map((o) => (
          <button
            key={o.card ? `${o.approach.id}.${o.card}` : o.approach.id}
            className="choice"
            disabled={!!o.blocked}
            onClick={() => dispatch(chooseAction(o))}
          >
            <span className="choice-label">{optionLabel(s, o)}</span>
            <ConsequenceLine o={o} cardKey={`${prefix}.${id}.${o.approach.id}`} s={s} />
          </button>
        ))}
        {list && (
          <button className="turn-back back-to-answers" onClick={() => dispatch({ type: 'back' })}>{t('ui.backToAnswers')}</button>
        )}
        {finishing && (
          <button className="primary finish" onClick={() => dispatch({ type: 'finish' })}>{t('ui.finishQuickly')}</button>
        )}
      </div>
    </>
  );
}

/** A blocked option has no card or person to name, so it gets a generic label. */
function optionLabel(s: RunState, o: Option): string {
  if (o.blocked === 'noCard' || o.documents) return t('ui.showDocument');
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
  const seen = observation(s);
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
        {/* A check in stages ends on what you notice before the result (observation()). */}
        {seen ? <p className="beat">{t(seen)}</p> : beat !== null && <p key={beat} className="beat">{t(`beat.${cp}.${beat}`)}</p>}
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
            {w.action === 'wait' ? t(waitKey(sc.check, 'wait', 'label')) : (
              <>
                <span className="choice-label">{w.blocked ? t('ui.nameSomeone') : t(waitKey(sc.check, w.action, 'label'), w.contact ? { contact: w.contact } : {})}</span>
                <span className={`consequence ${w.blocked ? 'blocked' : ''}`}>
                  <Icon name={w.action === 'ask' ? 'clock' : 'document'} />
                  <span className="consequence-text">
                    {/* A contact reads like the answer cards: what it shares, red only for the protected one. */}
                    <span className={`part ${w.blocked ? 'plain' : w.contact === protectedContact ? 'red' : w.contact ? 'plain' : 'amber'}`}>
                      {w.blocked ? t(`ui.blocked.${w.blocked}`) : t(w.contact ? `contact.${w.contact}.shares` : waitKey(sc.check, w.action, 'detail'))}
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
 * The ending (Yury's ending review, 2026-11-10), in this order: the outcome and the
 * ending's name, a short arrival scene (the picture and one paragraph), then what
 * happened after, under one time heading ("The following morning"): each cost worst
 * first, and the later beat (laterBeat()) as its own line with the choice that caused it.
 * Then the run summary, where the medicine and the protected contact show (and only
 * there), and the buttons, each a next step that says where it goes (dap.8): "See border
 * records", which opens the records alone, "Retry Arrival" (the same setup, onRetry),
 * "Choose a crossing" (the level list, onChoose) and, when a level follows this one,
 * "Continue to Departure" as the strong one (onNext). With no level after it, Choose a
 * crossing is the strong one.
 */
export function Ending({ s, onChoose, onRetry, onNext }: {
  s: RunState;
  onChoose: () => void;
  onRetry?: () => void;
  onNext?: (level: LevelId) => void;
}) {
  const [story, setStory] = useState(false);
  const level = s.level ?? DEFAULT_LEVEL;
  const next = onNext ? nextLevel(level) : undefined;
  const ending = s.ending ?? endingFor(s);
  const text = endingText(s);
  const cost = consequences(s);
  const later = laterBeat(s);
  const decided = decisive(s);
  return (
    <main className={`ending ending-${ending}`}>
      <p className="setup-title">{t('ui.title')}</p>
      <section className="paper ending-card">
        <p className="mono outcome">{t(ending === 'turnedBack' ? 'ui.crossingRefused' : 'ui.crossingComplete')}</p>
        <h1>{t(`ending.${text}.title`)}</h1>
        <div className="arrival">
          <div className="ending-scene">
            {/* Departure leaves for a flight, so its home endings show the plane, not the ward. */}
            {ending === 'turnedBack' ? <BorderPost closed />
              : text === 'missedBus' ? <EmptyStop medicine={s.medicine} character={s.character} />
              : ending === 'tooLate' ? <NightBus medicine={s.medicine} character={s.character} airport={s.level === 'departure'} />
              : s.level === 'departure' ? <PlaneWindow />
              : <Ward character={s.character} />}
          </div>
          <p className="epilogue">{t(`ending.${text}.body`)}</p>
        </div>
        {(cost.length > 0 || later) && (
          <section className="later">
            {/* One time heading over whatever follows, a cost or only the later beat. */}
            <h2 className="mono later-heading">{t('ending.later.heading')}</h2>
            {cost.length > 0 && (
              <>
                {/* Worst first, a heading and one line each, no severity tag (pfi.13 notes). */}
                <ul className="costs">
                  {cost.map((l, i) => (
                    <li key={i} className={`cost ${l.kind}${i === 0 ? ' worst' : ''}`}>
                      <h3 className="cost-title">{t(`${l.key}.title`, l.vars)}</h3>
                      {/* Why naming them did this (EndingLine.reason), before what it did. */}
                      {l.reason && <p className="cost-reason">{t(l.reason, l.vars)}</p>}
                      <p className="cost-line">{t(l.key, l.vars)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {/* Days later, its own line after the crossing's result, which it never changes. */}
            {later && (
              <div className={`beat beat-${later.id}`}>
                <p className="beat-line"><strong className="beat-when">{t(`later.${later.id}.when`)}:</strong> {t(`later.${later.id}`, later.vars)}</p>
                <p className="beat-reason">{t(`later.${later.id}.reason`, later.vars)}</p>
              </div>
            )}
          </section>
        )}
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
        </div>
        {/* The answers that decided the run, from its own record, then the three axes they moved (dap.7). */}
        <section className="decided">
          <h3 className="mono">{t('ending.decided.heading')}</h3>
          {decided.length > 0 && (
            <ol className="decisive">
              {decided.map((d, i) => (
                <li key={i} className="decisive-answer">
                  <span className="decisive-desk">{t('ending.decided.at', { desk: d.desk })}</span>
                  <span className="decisive-label">{t(d.key, d.vars)}</span>
                  <span className="decisive-cost">
                    {d.costs.map((c, j) => (
                      <span key={j} className={`tone-${c.tone}`}>{j > 0 && SEPARATOR}{c.n === undefined ? t(c.key, c.vars) : tn(c.key, c.n, c.vars)}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <ul className="axes">
            {axisLines(s).map((l) => (
              <li key={l.axis} className={`axis axis-${l.axis}`}><strong>{t(`ending.axis.${l.axis}`)}:</strong> {t(l.key, l.vars)}</li>
            ))}
          </ul>
        </section>
      </section>
      {/* Sticky, so the next steps stay in view however long the story above runs (pfi.9). */}
      <div className="controls">
        {/* The quiet buttons share one row, so the ending still fits the phone with all of them. */}
        <div className="ending-row">
          <button className="choice see-file" aria-haspopup="dialog" onClick={() => setStory(true)}>{t('ui.seeOnFile')}</button>
          {onRetry && <button className="choice retry" onClick={onRetry}>{t('ui.retry', { level: t(LEVELS[level].title) })}</button>}
          {next && <button className="choice choose-crossing" onClick={onChoose}>{t('ui.pickLevel')}</button>}
        </div>
        {next && onNext
          ? <button className="primary continue-next" onClick={() => onNext(next)}>{t('ui.continueTo', { level: t(LEVELS[next].title) })}</button>
          : <button className="primary choose-crossing" onClick={onChoose}>{t('ui.pickLevel')}</button>}
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
    // The label is Yury's (ending review, 2026-11-10); the value reads in hours, as every clock in the game.
    { label: t('ui.timeLeftRow'), value: tn('ui.hours', s.time), tone: 'plain' },
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
