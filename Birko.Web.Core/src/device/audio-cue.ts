// iOS-safe audio cue: a shared, gesture-unlocked AudioContext that plays a short tone (+ optional
// vibration). Encapsulates the iOS gotchas — a context must be resumed inside a user gesture, and a
// fresh `new AudioContext()` created inside a later timer callback stays muted — so the tone is
// audible when it fires from a timer. Opting into the `playback` audio session (Safari 16.4+) keeps
// it audible even with the ring/silent switch on.

export interface AudioCueOptions {
  /** Tone frequency in Hz. Default 880. */
  frequency?: number;
  /** Tone length in milliseconds. Default 350. */
  durationMs?: number;
  /** Peak gain, 0–1. Default 0.18. */
  gain?: number;
  /** Vibration pattern passed to `navigator.vibrate`. Omit to skip vibration. */
  vibrate?: number | number[];
}

export interface AudioCue {
  /**
   * Unlock audio from within a user gesture: resumes the shared context and opts into the
   * `playback` audio session. Call from a tap that reliably precedes the first cue.
   */
  prime(): void;
  /** Play a short tone (+ optional vibration). Best-effort; a no-op when audio is unsupported. */
  beep(options?: AudioCueOptions): void;
}

/**
 * Creates an {@link AudioCue} backed by a single shared, warm {@link AudioContext}. The context is
 * created lazily and reused (never closed) so it does not revert to a suspended state on iOS. All
 * effects are best-effort — unsupported APIs (no Web Audio, no Vibration) degrade silently.
 */
/**
 * True when the page is running as an installed app rather than in browser chrome. Checks the standard
 * media query and iOS's legacy `navigator.standalone`, because Safari shipped the latter years before it
 * shipped the former and an old iOS would otherwise read as a tab.
 */
function isStandalone(): boolean {
  try {
    if (typeof navigator !== 'undefined'
      && (navigator as unknown as { standalone?: boolean }).standalone === true) return true;
    return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false; // treat an unknown context as a tab — the pre-2026-09-08 behaviour
  }
}

export function createAudioCue(): AudioCue {
  let ctx: AudioContext | null = null;

  function getCtx(): AudioContext | null {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  }

  return {
    prime(): void {
      try {
        const c = getCtx();
        if (c && c.state === 'suspended') void c.resume();
        // Opt into the `playback` audio session so the cue is audible with the ring/silent switch on —
        // **but only outside an installed (standalone) app.** In standalone iOS, `playback` selects a session
        // the app does not hold and the tone is silenced **entirely**, on ring as well as on silent.
        //
        // Measured on device 2026-09-08 (WorkoutTracker TASK-178), installed app, one variable at a time:
        //
        //   | `playback` set | ring   | silent |
        //   |----------------|--------|--------|
        //   | yes            | SILENT | SILENT |
        //   | no             | beeps  | silent |
        //
        // So the line that buys silent-switch override in a browser tab costs the cue *altogether* once the
        // app is installed — which is the context the app actually ships in. Hence the guard, and hence the
        // trade it records: an installed app beeps on ring and not on silent. That is a limitation of the API
        // rather than of this code — `playback` is the only session type that ignores the silent switch
        // (`ambient` and `transient` respect it by design), so "audible on silent while installed" is not
        // reachable this way. If it is ever needed, the next thing to try is an `<audio>` element with a
        // data-URI rather than Web Audio, which routes differently.
        const session = (navigator as unknown as { audioSession?: { type?: string } }).audioSession;
        if (session && 'type' in session && !isStandalone()) session.type = 'playback';
      } catch {
        /* audio unsupported / blocked — degrade silently */
      }
    },

    beep(options?: AudioCueOptions): void {
      const { frequency = 880, durationMs = 350, gain = 0.18, vibrate } = options ?? {};

      if (vibrate !== undefined) {
        try { navigator.vibrate?.(vibrate); } catch { /* Vibration API absent (e.g. iOS Safari) */ }
      }

      try {
        const c = getCtx();
        if (!c) return;
        if (c.state === 'suspended') void c.resume(); // last-ditch if prime() didn't run
        const dur = durationMs / 1000;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        g.gain.setValueAtTime(gain, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
        osc.connect(g);
        g.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + dur);
        // Reuse the shared context — do NOT close it, or the next cue is born suspended on iOS.
      } catch {
        /* audio unsupported / blocked */
      }
    },
  };
}
