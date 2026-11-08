// Sparse sound, no files: a stamp thud on each choice, a soft tick per waiting
// beat, a low tone when a check comes back. Pattern from tidewall/src/ui/sound.ts:
// wakeAudio() runs on every tap because iOS only starts audio inside a gesture.

let ctx: AudioContext | null = null;
let muted = false;

export const setMuted = (m: boolean) => { muted = m; };

export function wakeAudio() {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* the next tap tries again */ });
  } catch { /* no audio on this device */ }
}

function tone(hz: number, seconds: number, volume: number, type: OscillatorType = 'sine') {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, hz * 0.5), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds);
  } catch { /* no audio: every sound is also shown on screen */ }
}

function buzz(ms: number) {
  try { navigator.vibrate?.(ms); } catch { /* no vibration API (iOS Safari) */ }
}

export const stamp = () => { tone(140, 0.18, 0.35, 'triangle'); buzz(25); };
export const tick = () => tone(1200, 0.04, 0.04);
export const result = () => tone(220, 0.6, 0.08);
