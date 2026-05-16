# W3 follow-up — useAudioRecorder ui-coupling fold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the two imperative JSX→ref mutations in `AudioRecorder` into intent-named `useAudioRecorder` wrappers (`play()`, `applyPlaybackSpeed()`), removing `playbackRetryRef`/`audioPlayerRef` from the hook's public `ui` group, with no observable behaviour change.

**Architecture:** Characterization-first (W4 model): pin the exact observable micro-behaviours on the W3 baseline, then fold. Behaviour-touching (first such in the program) — proof is the unchanged behaviour oracle (`AudioRecorder.test.tsx`), not code-identity.

**Tech Stack:** React 19, TypeScript (strict via `tsc -b`/Biome), MediaRecorder/AudioContext/`new Audio()` Web APIs, Vitest + `@testing-library/react` (`renderHook`).

**Branch:** `chore/code-quality-w3-followup-uicoupling`, **based on `chore/code-quality-wave3-useaudiorecorder`** (its tip; already created; spec committed there). PR diff framed vs the W3 branch; merge order **#179 → this**.

**The real typecheck gate is `cd frontend && npm run type-check` (= `tsc -b`).** Never `npx tsc --noEmit` (false-green).

---

### Task 0: Baseline

**Files:** none modified.

- [ ] **Step 1: Record the green baseline**

Run: `cd frontend && npm run type-check && npx vitest run 2>&1 | grep -E "Test Files|Tests " | tail -2`
Expected: `tsc -b` exit 0; full suite green — **record the exact `Tests N passed | M skipped` line** (behaviour-preservation target for Tasks 2–3).

- [ ] **Step 2: Record the oracle count + confirm consumers**

Run: `cd frontend && npx vitest run src/components/audio/AudioRecorder.test.tsx 2>&1 | tail -3 && grep -rln "components/audio/AudioRecorder" src --include="*.tsx" --include="*.ts" | grep -vE "AudioRecorder\.(tsx|test)"`
Expected: 45 passed; consumers exactly `src/components/postsort/Step1_Feedback.tsx` and `src/components/postsort/Step2_Questionnaire.tsx`. Anything else → STOP, report.

No commit (read-only).

---

### Task 1: Characterization tests (pin behaviour BEFORE the fold)

**Files:**
- Modify: `frontend/src/components/audio/AudioRecorder.test.tsx` (append 1 `describe`, 3 tests; do NOT alter the existing 45)

**Characterization tests: assert what the UNCHANGED W3 component does today. Snapshot reality; do not normalize.**

- [ ] **Step 1: Append the characterization describe block**

Read the existing file's harness first: `global.Audio` is mocked at ~line 108–116 as `vi.fn(function(){ … playbackRate: 1.0 … })`. To assert the live element's `playbackRate`, capture the constructed instance the same way the file captures `capturedMediaRecorder` (a module-scoped `let capturedAudio` assigned inside the mock factory, or read `(global.Audio as unknown as { mock: { results: { value: { playbackRate: number } }[] } }).mock.results.at(-1)?.value`). Mirror the existing tests' setup/`renderWithStore`/`userEvent`/`waitFor`/`act` and the `getUserMedia`+`MediaRecorder` capture pattern (read `'plays audio when play button is clicked'` ~L318 and `'shows speed control buttons in stopped state'` ~L342 and reuse their exact seeding/start-playback steps).

Append:

```tsx
describe('Characterization — ui coupling (W3-followup oracle)', () => {
    it('applies playbackRate to the live audio element when a speed button is clicked WHILE playing', async () => {
        // Render an existing-recording AudioRecorder, start playback so the
        // component is in state 'playing' (reuse the exact steps from
        // 'plays audio when play button is clicked'). Capture the Audio
        // instance the hook constructed (`new Audio()`), then click the 1.5x
        // (or 2.0x) speed button. Assert the captured audio element's
        // .playbackRate === the chosen speed (this is the L173-175 live poke,
        // gated on state === 'playing'). Assert against the ELEMENT, not the
        // button's rendered class.
    });

    it('does NOT imperatively set playbackRate when a speed button is clicked while NOT playing', async () => {
        // Render an existing-recording AudioRecorder in 'stopped' state (do
        // not start playback). Click a speed button. Assert: the displayed
        // selected speed updates (state changed), AND the captured/last Audio
        // element's playbackRate was NOT imperatively mutated by the click
        // (it stays at its constructed default until a fresh playRecording
        // applies it). Snapshot the current state==='playing' guard: when not
        // playing, the click only sets state, no element poke.
    });

    it('user play button resets the retry guard so a load-failed existing recording can be re-played', async () => {
        // Seed an existing recording with sessionToken so the hook's
        // existing-recording retry path is reachable; drive the playback
        // load-failure path that sets playbackRetryRef.current = true (mirror
        // however the file already simulates an audio error / failed load —
        // search the existing tests for an `onerror`/`reject` pattern; if
        // none exists, trigger the audio element's error handler on the
        // captured instance). Then click the user play button. Assert it
        // re-attempts playback (playRecording invoked again / a new Audio
        // constructed) — i.e. the L112 `playbackRetryRef.current = false`
        // reset took effect. This is the observable behaviour the fold must
        // preserve. If the load-failure path genuinely cannot be driven
        // through the harness, STOP and report BLOCKED with what you tried
        // (do not fake it, do not weaken to a tautology).
    });
});
```

Fill the bodies by reading the live component output + existing tests. Assertions target observed current behaviour (the live element's `playbackRate`; a re-attempt after guard reset) — not mock tautologies.

- [ ] **Step 2: Run — characterization green on the unchanged W3 baseline**

Run: `cd frontend && npx vitest run src/components/audio/AudioRecorder.test.tsx`
Expected: 45 + 3 = **48 passed**, against the UNCHANGED component/hook. If a test can't pass against unchanged code, it's a setup bug or discovered real behaviour to encode faithfully — investigate; do NOT modify the hook/component (untouched in Task 1).

- [ ] **Step 3: Lint/format the test file**

Run: `cd frontend && npx @biomejs/biome check --write src/components/audio/AudioRecorder.test.tsx && npx @biomejs/biome check src/components/audio/AudioRecorder.test.tsx`
Expected: formatting normalized; second run 0 errors/0 warnings. Re-run Step 2's vitest to confirm formatting didn't break a test.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/audio/AudioRecorder.test.tsx
git commit -m "test(audio): characterization for ui-coupling (W3-followup oracle)

Pins observable behaviour of the 2 JSX->ref couplings (live playbackRate
while playing; no poke when not playing; retry-guard reset re-enables
play) on the unchanged W3 baseline BEFORE the fold. Existing 45 tests
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The fold (hook wrappers + interface reduction + JSX simplification)

**Files:**
- Modify: `frontend/src/hooks/participant/useAudioRecorder.ts`
- Modify: `frontend/src/components/audio/AudioRecorder.tsx`

- [ ] **Step 1: Add the two wrappers in the hook**

In `useAudioRecorder.ts`, immediately AFTER the `playRecording` definition ends (the `const playRecording = async () => { … };` block starting ~line 600) and after `setPlaybackSpeed` is in scope (the `useState` at ~line 173), add:

```ts
// Public play entry: resets the existing-recording retry guard, then plays.
// Internal callers keep using `playRecording` directly (they must NOT reset
// the guard — that is the guard's purpose).
const play = () => {
    playbackRetryRef.current = false;
    return playRecording();
};

// Public speed setter: sets state, and — only while actually playing —
// applies the rate to the live audio element (closure-safe via stateRef,
// the hook's existing mirror of `state`).
const applyPlaybackSpeed = (s: number) => {
    setPlaybackSpeed(s);
    if (audioPlayerRef.current && stateRef.current === 'playing') {
        audioPlayerRef.current.playbackRate = s;
    }
};
```

Do NOT modify `playRecording`, the raw `setPlaybackSpeed` state setter, or any internal caller of either. (Verify: the only places that must keep raw `playRecording` are the internal retry path ~L703 and any other internal invocation — leave them.)

- [ ] **Step 2: Change the returned bindings**

In the hook's `return { … }` object: change `play: playRecording,` → `play: play,`; change the returned `setPlaybackSpeed,` (the raw setter, ~L821) → `setPlaybackSpeed: applyPlaybackSpeed,`.

- [ ] **Step 3: Remove the two refs from the public interface + return**

In `UseAudioRecorderResult.ui` (interface ~L126), delete the two members:
`playbackRetryRef: MutableRef<boolean>;` (~L131) and
`audioPlayerRef: RefObject<HTMLAudioElement | null>;` (~L132).
In the hook's returned `ui: { … }` object (~L829), delete the `playbackRetryRef,` and `audioPlayerRef,` entries. If `MutableRef`/`RefObject` imports become unused, let `tsc -b`/Biome flag them and remove them.

- [ ] **Step 4: Simplify the two JSX coupling sites in the component**

In `AudioRecorder.tsx`:
- Remove `playbackRetryRef,` and `audioPlayerRef,` from the `ui: { … }` destructure (~lines 34–35).
- **Play button** (~L108–114): the `play` returned is destructured as `play: playRecording`. The onClick currently is:
  ```tsx
  onClick={
      state === 'playing'
          ? pausePlayback
          : () => {
                playbackRetryRef.current = false;
                playRecording();
            }
  }
  ```
  Replace with (the reset is now inside the hook's `play`, which is the destructured `playRecording`):
  ```tsx
  onClick={state === 'playing' ? pausePlayback : playRecording}
  ```
- **Speed buttons** (~L172–177): replace:
  ```tsx
  onClick={() => {
      setPlaybackSpeed(speed);
      if (audioPlayerRef.current && state === 'playing') {
          audioPlayerRef.current.playbackRate = speed;
      }
  }}
  ```
  with:
  ```tsx
  onClick={() => setPlaybackSpeed(speed)}
  ```
  (the live-element poke is now inside the hook's `applyPlaybackSpeed`, which is the destructured `setPlaybackSpeed`).

- [ ] **Step 5: Typecheck + lint**

Run: `cd frontend && npm run type-check && npm run lint 2>&1 | tail -1`
Expected: `tsc -b` exit 0 (fix any now-unused import — `MutableRef`/`RefObject` in the hook if no longer used; nothing in the component should newly need imports). Lint 0 errors; **no new `biome-ignore`**; no `any`. W3's pre-existing keyboard-effect suppression must be untouched.

- [ ] **Step 6: The cardinal gate — oracle byte-unchanged since Task 1 + green**

Run: `cd frontend && git diff --exit-code src/components/audio/AudioRecorder.test.tsx && npx vitest run src/components/audio/AudioRecorder.test.tsx 2>&1 | tail -3`
Expected: `git diff --exit-code` exits 0 (the 48-test oracle is byte-UNMODIFIED since the Task-1 commit) AND all 48 pass. If a test had to change to pass, observable behaviour changed → STOP and escalate; do NOT edit the oracle.

- [ ] **Step 7: Full suite + consumers**

Run: `cd frontend && npx vitest run 2>&1 | grep -E "Tests " | tail -1`
Expected: full suite green at the **Task-0 baseline count + 3** (the Task-1 characterization tests; no other delta yet). `Step1_Feedback.tsx`/`Step2_Questionnaire.tsx` unmodified; `tsc -b` (Step 5) proves their call sites still type-check against the unchanged `AudioRecorderProps`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/participant/useAudioRecorder.ts frontend/src/components/audio/AudioRecorder.tsx
git commit -m "refactor(audio): fold ui coupling into useAudioRecorder wrappers

play() resets the retry guard internally; setPlaybackSpeed applies the
live playbackRate when playing (closure-safe via stateRef). ui no longer
exposes playbackRetryRef/audioPlayerRef. Oracle (48) byte-unchanged and
green — no observable behaviour change. playRecording + raw state setter
+ internal callers untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Hook unit tests for the two wrappers

**Files:**
- Modify: `frontend/src/hooks/participant/useAudioRecorder.test.ts` (append ≥2 tests)

- [ ] **Step 1: Append the wrapper unit tests**

Reuse the Task-1-of-W3 mock pattern already in this file (it mocks `MediaRecorder`/`getUserMedia`/`AudioContext`; add a `new Audio()` mock if the file doesn't already have one — mirror the oracle's `global.Audio` factory). Append via `renderHook`:

```ts
describe('useAudioRecorder — play() wrapper', () => {
    it('resets playbackRetryRef and invokes playback', async () => {
        // renderHook(useAudioRecorder, props with an existingRecording so the
        // retry path is meaningful). Force playbackRetryRef true by driving
        // the retry path OR (if unreachable in unit context) assert the
        // observable: call result.current.playback.play() inside act();
        // assert a new Audio() was constructed (playback attempted) AND that
        // a subsequent play() after a simulated failed-load still re-attempts
        // (guard was reset). Assert behaviour, not the private ref.
    });
});

describe('useAudioRecorder — setPlaybackSpeed wrapper', () => {
    it('always updates state speed but pokes the live element ONLY while playing', async () => {
        // Not playing: act(() => result.current.playback.setPlaybackSpeed(1.5));
        // assert result.current.playback.playbackSpeed === 1.5 AND the
        // constructed audio element's playbackRate was NOT set to 1.5 by the
        // call (no element / not 'playing').
        // Then start playback (state 'playing'); act setPlaybackSpeed(2.0);
        // assert playbackSpeed === 2.0 AND the live audio element's
        // playbackRate === 2.0 (the stateRef==='playing' branch).
    });
});
```

Fill bodies against the real hook surface. Assert real behaviour (state value, constructed-Audio `playbackRate`), not mock tautologies. If a path can't be driven cleanly at the hook unit level, substitute a different genuine assertion of the wrapper's contract and say so.

- [ ] **Step 2: Run the hook test file**

Run: `cd frontend && npx vitest run src/hooks/participant/useAudioRecorder.test.ts`
Expected: all pass (the prior W3 hook tests + ≥2 new).

- [ ] **Step 3: Lint/format**

Run: `cd frontend && npx @biomejs/biome check --write src/hooks/participant/useAudioRecorder.test.ts && npx @biomejs/biome check src/hooks/participant/useAudioRecorder.test.ts`
Expected: formatting normalized; 0 errors/0 warnings. Re-run Step 2's vitest to confirm.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/participant/useAudioRecorder.test.ts
git commit -m "test(audio): unit-cover play()/setPlaybackSpeed wrappers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Final verification against the Definition of Done

**Files:** none (verification only; fix inline if a gate fails).

- [ ] **Step 1: Type + build + lint**

Run: `cd frontend && npm run type-check && npm run build && npm run lint 2>&1 | tail -1`
Expected: `tsc -b` exit 0; `vite build` succeeds; lint 0 errors, no new `biome-ignore`.

- [ ] **Step 2: Oracle unchanged-since-Task-1 + full suite**

Run: `cd frontend && git diff --exit-code <Task-1 commit SHA> -- src/components/audio/AudioRecorder.test.tsx; echo "oracle-vs-task1-exit:$?" && npx vitest run 2>&1 | grep -E "Test Files|Tests " | tail -2`
Expected: `AudioRecorder.test.tsx` identical to its Task-1 committed state (no change in Tasks 2–3). Full suite green at Task-0 baseline + 3 characterization + ≥2 hook tests, no regression.

- [ ] **Step 3: Interface reduction + scope discipline**

Run: `cd frontend && grep -nE "playbackRetryRef|audioPlayerRef" src/components/audio/AudioRecorder.tsx || echo "component: refs gone (ok)"` and `grep -nE "playbackRetryRef:|audioPlayerRef:" src/hooks/participant/useAudioRecorder.ts` and `git diff chore/code-quality-wave3-useaudiorecorder...HEAD --name-only`
Expected: the component no longer references either ref; the hook's interface no longer DECLARES `playbackRetryRef:`/`audioPlayerRef:` in `ui` (internal `const playbackRetryRef`/`audioPlayerRef` still exist — that's correct, only the public surface shrank). Changed files vs the W3 branch = the 2 docs + `useAudioRecorder.ts` + `useAudioRecorder.test.ts` + `AudioRecorder.tsx` + `AudioRecorder.test.tsx` ONLY. No consumers, no other wave's files.

- [ ] **Step 4: No `any`; behaviour invariance restated**

Run: `cd frontend && grep -nE ": any|as any|<any>" src/hooks/participant/useAudioRecorder.ts src/components/audio/AudioRecorder.tsx | grep -v "i18n\|'.*'" || echo "no any"`
Expected: "no any". Behaviour-invariance is proven by Step 2's byte-unchanged 48-test oracle staying green — restate that in the final report.

- [ ] **Step 5: Final commit if inline fixes were made**

```bash
git add -A
git commit -m "chore(audio): w3-followup DoD fixups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(Skip if Steps 1–4 were green with no edits.)

---

## Self-Review

**Spec coverage:**
- Characterization-first, committed before any production change → Task 1 (both production files untouched; Tasks 2 only edits them). ✓
- 3 exact micro-behaviours (live rate while playing / no poke when not playing / retry-guard reset re-enables play) → Task 1 Step 1, one `it` each. ✓
- `play()` wrapper resets guard; internal `playRecording` + retry path untouched → Task 2 Step 1 (explicit "do NOT modify playRecording / internal callers") + Step 2. ✓
- `applyPlaybackSpeed` sets state + pokes live element only when `stateRef.current==='playing'` → Task 2 Step 1. ✓
- `ui` drops both refs (interface + return); component drops both → Task 2 Steps 3–4. ✓
- Oracle byte-unchanged from the characterization commit through the fold → Task 2 Step 6 (`git diff --exit-code`), Task 4 Step 2. ✓
- ≥2 hook unit tests for the wrappers → Task 3. ✓
- DoD (type-check/build/lint/suite/no-any/no-new-biome-ignore/consumers/interface-reduction) → Task 4. ✓
- No LOC-drop target (correctly absent — value = smell resolution + smaller surface). ✓
- Stacked on W3; diff vs W3 branch; merge order #179 → this → header + Task 4 Step 3. ✓

**Placeholder scan:** No TBD/TODO. The two wrapper bodies, the return-binding edits, the interface deletions, and both JSX before/after rewrites are shown in full (this change is small enough for complete code). The characterization + hook-test bodies are intentionally specified by *behaviour to assert + harness to reuse* (characterization tests are written against the live component/hook the engineer reads at impl time; the exact behaviours — element `playbackRate` value, re-attempt after guard reset, no-poke-when-not-playing — are concrete and falsifiable), with explicit STOP-if-unreachable for the one risky path (load-failure simulation).

**Type consistency:** `play` / `applyPlaybackSpeed` are the only new identifiers; returned as `play:` / `setPlaybackSpeed:` (Task 2 Step 2) and consumed by the component via the existing `play: playRecording` / `setPlaybackSpeed` destructure aliases (Task 2 Step 4) — names consistent across hook definition, return, and component. `playbackRetryRef`/`audioPlayerRef` removed from `ui` in interface AND return AND component destructure (Task 2 Steps 3–4) — no dangling reference.

**Open note for the reviewer:** the cardinal risk is the `stateRef.current === 'playing'` substitution for the JSX's `state === 'playing'` — behaviourally identical at click time (the hook keeps `stateRef.current = state` synced each render, ~L184), and the characterization test #1 (poke WHILE playing) + #2 (no poke when not) pin exactly this. The spec-reviewer should independently confirm `stateRef` is the synced mirror of `state` and that no internal `playRecording`/raw-`setPlaybackSpeed` caller was altered (only the *returned* bindings change).
