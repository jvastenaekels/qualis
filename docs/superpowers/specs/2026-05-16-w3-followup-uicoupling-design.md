# W3 follow-up — useAudioRecorder ui-coupling fold — design

**Date:** 2026-05-16
**Status:** Approved (design)
**Scope:** Code-quality program — the deferred Wave-3 follow-up (not a new wave;
the audit's true-monolith list is exhausted).

## Background

Wave 3 (`useAudioRecorder`, PR #179) was a strict verbatim relocation, so it
could not fold the JSX→imperative coupling into the hook (that is a
behaviour-touching change, forbidden in a verbatim wave). The W3 T1 review and
final review flagged the residual coupling as a legitimate, explicitly-deferred
follow-up. This spec is that follow-up.

The W3 component still mutates two hook-internal refs directly from JSX
(`AudioRecorder.tsx` on the W3 branch):
- **L112–113** (play button): `playbackRetryRef.current = false; playRecording();`
- **L173–175** (speed button): `setPlaybackSpeed(speed); if (audioPlayerRef.current
  && state === 'playing') audioPlayerRef.current.playbackRate = speed;`

These are the **only** two consumers of the hook's `ui.playbackRetryRef` and
`ui.audioPlayerRef`. Folding them into intent-named hook methods removes both
raw refs from the public surface, fully resolving the boundary smell.

This is the program's **first behaviour-touching refactor** (W1/W3/W4 were
verbatim relocations; W2 was type-only). Observable behaviour must be
preserved, but the proof cannot be code-identity (JSX changes, hook gains
logic) — it is the **unchanged behaviour oracle**.

Decisions taken at brainstorm:
- **Characterization-first** (W4 model): pin the exact observable
  micro-behaviours on the W3 baseline before the fold.
- Stacked on the W3 branch; merge order **#179 → this**.

## Goal

Move the two imperative JSX mutations into intent-named `useAudioRecorder`
methods, remove `playbackRetryRef`/`audioPlayerRef` from the hook's public
`ui` group, with **no observable behaviour change**.

## Architecture & boundary

Stacked on `chore/code-quality-wave3-useaudiorecorder` (base = its tip).
Modifies only `frontend/src/hooks/participant/useAudioRecorder.ts` and
`frontend/src/components/audio/AudioRecorder.tsx`.

**Two folds (behaviour-preserving):**

1. **`play()` wrapper.** Add `const play = () => { playbackRetryRef.current =
   false; return playRecording(); };`. Return `play: play` instead of
   `play: playRecording`. **Invariant:** `playRecording` is unchanged and all
   internal callers keep calling it directly — in particular the
   existing-recording retry path (hook ~L703) must NOT reset the guard (that
   is the guard's purpose). Only the public entry resets it — exactly what the
   JSX did at L112–113.
2. **`applyPlaybackSpeed(s)` wrapper.** Add `const applyPlaybackSpeed = (s:
   number) => { setPlaybackSpeed(s); if (audioPlayerRef.current &&
   stateRef.current === 'playing') audioPlayerRef.current.playbackRate = s; };`.
   Return `setPlaybackSpeed: applyPlaybackSpeed` instead of the raw state
   setter. The raw `setPlaybackSpeed` state setter stays internal-only;
   `playRecording`'s existing `audio.playbackRate = playbackSpeed` (~L618,
   fresh-play applies current speed) is unaffected. **Closure nuance:** the JSX
   read `state === 'playing'` (render state); the behaviourally-identical
   closure-safe equivalent inside the hook is the existing `stateRef.current`
   mirror — use that, not `state`.

**Interface change:** `UseAudioRecorderResult.ui` **drops**
`playbackRetryRef` and `audioPlayerRef` (no remaining consumers). This is a
*reduction* of the public surface — no fabrication; the W3-flagged smell is
eliminated.

**Component:** drop both refs from the `ui` destructure; L112–113 → call the
play handler (which is now `play()` with the reset folded in); L173–175 →
`setPlaybackSpeed(speed)`. JSX edits are minimal and targeted (remove 2
mutation lines + 1 conditional) — *not* byte-identical; the oracle is the
proof, not JSX-identity.

## Characterization phase (first, before the fold)

Append to `AudioRecorder.test.tsx` (the W3 948-LOC oracle; the existing 45
tests untouched), green on the **unchanged W3 baseline**, committed first:

1. **Live playbackRate while playing** — playback active (`state==='playing'`),
   click a speed button → the live `<audio>` element's `playbackRate` equals
   the chosen speed (assert the element/mock `playbackRate`, not button
   render).
2. **No live poke when not playing** — in `stopped` state, click a speed
   button → state speed updates but the element's `playbackRate` is *not*
   imperatively set (snapshots the `state==='playing'` guard).
3. **Retry-guard reset re-enables play** — drive the existing-recording
   load-failure path that sets `playbackRetryRef.current = true`, then click
   the user play button → it resets the guard and re-attempts (the L112
   behaviour), distinct from the internal retry path which does NOT reset.

If any of these cannot be expressed against the unchanged W3 component, that is
a test-setup problem or a discovered real behaviour to encode faithfully — do
not modify the component in the characterization task; do not weaken to a
tautology.

## Testing

Phase order: characterization green on W3 baseline (committed first, both
production files untouched) → fold → the existing 45 + the 3 characterization
tests stay green **unchanged** through the fold (oracle; enforced via
`git diff --exit-code` since the characterization commit). Plus ≥2 hook unit
tests via `renderHook`: `play()` resets `playbackRetryRef` then invokes
playback; `applyPlaybackSpeed` always sets state but pokes the live element's
`playbackRate` **only** when `stateRef.current === 'playing'`.

## Definition of done

- Characterization tests green on the W3 baseline **before** any production
  change (committed as the first task).
- `cd frontend && npm run type-check` (`tsc -b`, the real gate — never
  `tsc --noEmit`) → exit 0.
- `cd frontend && npm run build` → succeeds.
- `cd frontend && npm run lint` → 0 errors; **no new `biome-ignore`** (W3's
  relocated keyboard-effect suppression stays untouched); no `any`.
- `cd frontend && npx vitest run` → full suite green; the existing 45 + the 3
  characterization tests **byte-unchanged from the characterization commit
  through the fold** + ≥2 new hook unit tests.
- `useAudioRecorder.ts` `ui` no longer exposes `playbackRetryRef`/
  `audioPlayerRef`; `AudioRecorder.tsx` no longer references them; `play` and
  `setPlaybackSpeed` returned are the new wrappers; `playRecording` and the raw
  state setter are unchanged and still used internally.
- Consumers `Step1_Feedback.tsx`/`Step2_Questionnaire.tsx` untouched, still
  type-checking; `AudioRecorderProps` unchanged.
- **No observable behaviour change** — proof is the unchanged oracle, not
  code-identity.
- Stacked on `chore/code-quality-wave3-useaudiorecorder`; PR diff framed vs
  that branch; merge order **#179 → this**.

## Non-goals

- Any observable behaviour, UX, or media-pipeline change.
- Modifying the existing 45 `AudioRecorder.test.tsx` tests (oracle).
- Touching `playRecording`, the raw `setPlaybackSpeed` state setter, or any
  internal caller of either (only the *returned* bindings change).
- Changing `AudioRecorderProps` or the consumers.
- Re-relocating or otherwise altering W3's verbatim-moved lifecycle beyond the
  two named wrappers + the interface reduction.
- Removing/relocating W3's pre-existing keyboard-effect suppression.
- Any other deferred backlog item (QSortEditor JSX decomposition; the
  designer-draft-model refactor) or any other wave's files.
