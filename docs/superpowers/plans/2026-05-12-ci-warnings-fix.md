# CI Warnings Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the current CI warning gates to a clean, actionable state by fixing the frontend Biome failure, the unallowlisted npm audit advisory, and the two remaining AudioRecorder cognitive-complexity warnings.

**Architecture:** Keep this remediation narrow. Fix mechanical Biome issues first, refresh only the vulnerable transitive npm lock entry second, then reduce AudioRecorder complexity by extracting resource-cleanup and playback helpers without changing recorder behavior.

**Tech Stack:** React 19, TypeScript, Vite, Biome, Vitest, npm audit, GitHub Actions.

---

## File Map

- Modify: `frontend/src/components/SortingAnimation.tsx`
  - Biome formatting only.
- Modify: `frontend/src/layouts/StudyLayout.tsx`
  - Biome formatting only.
- Modify: `frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts`
  - Remove one unused-parameter warning and five literal-key infos.
- Modify: `frontend/src/components/admin/designer/ProcessStepEditor.test.tsx`
  - Remove one unused suppression.
- Modify: `frontend/package-lock.json`
  - Refresh `fast-uri` from `3.1.0` to `3.1.2` through npm.
- Modify: `frontend/src/components/audio/AudioRecorder.tsx`
  - Extract cleanup/playback helpers to reduce Biome cognitive complexity.
- Test: `frontend/src/components/audio/AudioRecorder.test.tsx`
  - Existing coverage is the characterization suite for recorder behavior.

---

## Task 1: Restore Biome Lint Gate

**Files:**
- Modify: `frontend/src/components/SortingAnimation.tsx`
- Modify: `frontend/src/layouts/StudyLayout.tsx`
- Modify: `frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts`
- Modify: `frontend/src/components/admin/designer/ProcessStepEditor.test.tsx`

- [ ] **Step 1: Reproduce the current lint failure**

Run:

```bash
cd frontend
npm run lint
```

Expected: FAIL with formatter errors in `SortingAnimation.tsx` and `StudyLayout.tsx`, plus warnings/infos in the two test files.

- [ ] **Step 2: Apply Biome formatting to the two format-failing files**

Run:

```bash
cd frontend
npx biome format --write src/components/SortingAnimation.tsx src/layouts/StudyLayout.tsx
```

Expected: only formatting changes in those two files.

- [ ] **Step 3: Fix the unused mock parameter**

In `frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts`, replace:

```ts
const t = vi.fn((key: string, fallback: string) => fallback) as unknown as TFunction;
```

with:

```ts
const t = vi.fn((_key: string, fallback: string) => fallback) as unknown as TFunction;
```

- [ ] **Step 4: Fix the literal-key infos**

In `frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts`, replace:

```ts
expect(map['q1']).toEqual({ id: 'q1', label: 'L1' });
expect(map['q2']).toEqual({ id: 'q2', label: 'L2' });
expect(map['f1']).toEqual({ id: 'f1', label: 'F1' });
expect(map['q1']).toMatchObject({ id: 'q1', label: 'L1' });
expect(map['a1']).toEqual({ id: 'a1', label: 'A1' });
```

with:

```ts
expect(map.q1).toEqual({ id: 'q1', label: 'L1' });
expect(map.q2).toEqual({ id: 'q2', label: 'L2' });
expect(map.f1).toEqual({ id: 'f1', label: 'F1' });
expect(map.q1).toMatchObject({ id: 'q1', label: 'L1' });
expect(map.a1).toEqual({ id: 'a1', label: 'A1' });
```

- [ ] **Step 5: Remove the unused suppression**

In `frontend/src/components/admin/designer/ProcessStepEditor.test.tsx`, remove this line:

```ts
// biome-ignore lint/suspicious/noExplicitAny: convenient partial mock for the StudyUpdate draft
```

Keep the suppressions on the `steps: any[]` parameter and return type; those are still active.

- [ ] **Step 6: Verify Task 1**

Run:

```bash
cd frontend
npm run lint
```

Expected: the formatter errors, unused parameter warning, unused suppression warning, and literal-key infos are gone. The command may still print the two `AudioRecorder.tsx` cognitive-complexity warnings until Task 3 is complete.

- [ ] **Step 7: Commit Task 1**

```bash
git add frontend/src/components/SortingAnimation.tsx frontend/src/layouts/StudyLayout.tsx frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts frontend/src/components/admin/designer/ProcessStepEditor.test.tsx
git commit -m "chore(frontend): restore biome lint formatting"
```

---

## Task 2: Fix The Unallowlisted npm Audit Advisory

**Files:**
- Modify: `frontend/package-lock.json`

- [ ] **Step 1: Reproduce the GitHub Actions audit filter failure**

Run:

```bash
cd frontend
set -e
audit_json=$(npm audit --json) || true
accepted='GHSA-4r6h-8v6p-xvw6|GHSA-5pgg-2g8v-p4x9'
unknown=$(echo "$audit_json" | jq -r --arg a "$accepted" '
  [.vulnerabilities | to_entries[].value
   | select(.severity == "high" or .severity == "critical")
   | .via[] | objects
   | select((.url // "") | test($a) | not)
   | .url] | unique | join("\n")
')
if [ -n "$unknown" ]; then
  echo "Unhandled high/critical advisories:"
  echo "$unknown"
  exit 1
fi
echo "All high+ advisories are within the SECURITY.md allowlist."
```

Expected: FAIL and print:

```text
Unhandled high/critical advisories:
https://github.com/advisories/GHSA-q3j6-qgpj-74h6
https://github.com/advisories/GHSA-v39h-62p7-jpjc
```

- [ ] **Step 2: Refresh only the vulnerable transitive lock entry**

Run:

```bash
cd frontend
npm update fast-uri --package-lock-only
```

Expected: `frontend/package-lock.json` changes `node_modules/fast-uri` from `3.1.0` to `3.1.2`. Do not change `frontend/package.json`.

- [ ] **Step 3: Verify the installed dependency path**

Run:

```bash
cd frontend
npm ci
npm ls fast-uri
```

Expected: `fast-uri@3.1.2` under `orval -> @apidevtools/swagger-parser -> ajv`.

- [ ] **Step 4: Verify the CI audit filter now passes**

Run the same filter command from Step 1.

Expected:

```text
All high+ advisories are within the SECURITY.md allowlist.
```

The two accepted `xlsx` advisories may remain in raw `npm audit --json`; do not add a new allowlist for `fast-uri`.

- [ ] **Step 5: Verify API generation still works with the refreshed lock**

Run:

```bash
cd frontend
npm run check:api
```

Expected: PASS with no diff in `frontend/src/api/generated.ts` or `frontend/src/api/model`.

- [ ] **Step 6: Commit Task 2**

```bash
git add frontend/package-lock.json
git commit -m "fix(frontend): refresh fast-uri transitive audit floor"
```

---

## Task 3: Reduce AudioRecorder Cognitive Complexity

**Files:**
- Modify: `frontend/src/components/audio/AudioRecorder.tsx`
- Test: `frontend/src/components/audio/AudioRecorder.test.tsx`

- [ ] **Step 1: Run the existing characterization suite**

Run:

```bash
cd frontend
npx vitest run src/components/audio/AudioRecorder.test.tsx
```

Expected: PASS before refactoring. If it fails before code changes, stop and diagnose the pre-existing failure first.

- [ ] **Step 2: Extract resource cleanup helpers near the top of `AudioRecorder.tsx`**

Add these helpers after `type RecorderState = ...`:

```ts
type MutableRef<T> = { current: T };

const emptyAudioLevels = [0, 0, 0, 0, 0];

function clearIntervalRef(ref: MutableRef<NodeJS.Timeout | null>): void {
    if (!ref.current) return;
    clearInterval(ref.current);
    ref.current = null;
}

function cancelAnimationFrameRef(ref: MutableRef<number | null>): void {
    if (!ref.current) return;
    cancelAnimationFrame(ref.current);
    ref.current = null;
}

function closeAudioContextRef(ref: MutableRef<AudioContext | null>): void {
    if (!ref.current || ref.current.state === 'closed') return;
    ref.current.close();
    ref.current = null;
}

function stopStreamRef(ref: MutableRef<MediaStream | null>): void {
    if (!ref.current) return;
    ref.current.getTracks().forEach((track) => {
        track.stop();
    });
    ref.current = null;
}

function detachAudioPlayer(audio: HTMLAudioElement | null): void {
    if (!audio) return;
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    audio.ontimeupdate = null;
}

function revokeBlobPlayerSource(audio: HTMLAudioElement | null): void {
    if (audio?.src?.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
    }
}
```

- [ ] **Step 3: Replace repeated cleanup blocks**

In the unmount `useEffect`, replace the returned callback body with:

```ts
clearIntervalRef(timerRef);
clearIntervalRef(permissionCheckIntervalRef);
cancelAnimationFrameRef(animationFrameRef);
closeAudioContextRef(audioContextRef);
stopStreamRef(streamRef);
revokeBlobPlayerSource(audioPlayerRef.current);
```

In `stopRecording`, replace the resource cleanup portion with:

```ts
mediaRecorderRef.current.stop();
clearIntervalRef(timerRef);
clearIntervalRef(permissionCheckIntervalRef);
cancelAnimationFrameRef(animationFrameRef);
closeAudioContextRef(audioContextRef);
setAudioLevels(emptyAudioLevels);
```

In `pausePlayback`, replace the nested cleanup with:

```ts
audioPlayerRef.current.pause();
setState('stopped');
setAudioLevels(emptyAudioLevels);
cancelAnimationFrameRef(animationFrameRef);
closeAudioContextRef(audioContextRef);
```

In `deleteRecording`, replace timer/frame/context cleanup with:

```ts
clearIntervalRef(timerRef);
cancelAnimationFrameRef(animationFrameRef);
closeAudioContextRef(audioContextRef);
```

- [ ] **Step 4: Extract the pre-playback refresh helper inside the component**

Add this callback before `playRecording`:

```ts
const refreshUrlBeforePlayback = async (): Promise<boolean> => {
    if (!urlExpiresAt || Date.now() <= urlExpiresAt - 60 * 1000) {
        return true;
    }

    try {
        await refreshPresignedUrl();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return true;
    } catch (error) {
        console.error('Failed to refresh URL before playback:', error);
        toast.error(
            t('audio.refresh_failed', 'Could not refresh audio. Your recording is still saved.')
        );
        return false;
    }
};
```

- [ ] **Step 5: Extract playback state helpers inside the component**

Add these functions before `playRecording`:

```ts
const resetPlaybackAfterFailure = () => {
    setState('stopped');
    setAudioLevels(emptyAudioLevels);
};

const cleanupPreviousPlayer = () => {
    detachAudioPlayer(audioPlayerRef.current);
};

const finishPlayback = () => {
    setState('stopped');
    setAudioLevels(emptyAudioLevels);
    setPlaybackPosition(0);
    cancelAnimationFrameRef(animationFrameRef);
    closeAudioContextRef(audioContextRef);
};
```

- [ ] **Step 6: Simplify `playRecording` with the new helpers**

In `playRecording`, replace the proactive refresh block with:

```ts
const canPlay = await refreshUrlBeforePlayback();
if (!canPlay) return;
```

Replace the previous audio element cleanup block with:

```ts
cleanupPreviousPlayer();
```

Replace repeated playback failure state resets with:

```ts
resetPlaybackAfterFailure();
```

Replace `audio.onended` with:

```ts
audio.onended = finishPlayback;
```

- [ ] **Step 7: Replace literal empty-level arrays touched by this task**

Within cleanup/playback paths modified above, use:

```ts
setAudioLevels(emptyAudioLevels);
```

Do not bulk-rewrite unrelated arrays in the JSX or recorder setup unless Biome forces it.

- [ ] **Step 8: Verify the AudioRecorder warning is gone**

Run:

```bash
cd frontend
npx biome check src/components/audio/AudioRecorder.tsx --max-diagnostics=100
```

Expected: PASS with no `lint/complexity/noExcessiveCognitiveComplexity` diagnostics for lines 199 or 476.

- [ ] **Step 9: Verify behavior with focused tests**

Run:

```bash
cd frontend
npx vitest run src/components/audio/AudioRecorder.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit Task 3**

```bash
git add frontend/src/components/audio/AudioRecorder.tsx
git commit -m "refactor(audio): reduce recorder cleanup complexity"
```

---

## Task 4: Final CI Warning Audit

**Files:**
- No expected source edits.

- [ ] **Step 1: Run the frontend lint gate**

Run:

```bash
cd frontend
npm run lint
```

Expected: PASS. No Biome errors. No Biome warnings from the files touched in Tasks 1 and 3.

- [ ] **Step 2: Run frontend type-check and focused tests**

Run:

```bash
cd frontend
npm run type-check
npx vitest run src/components/audio/AudioRecorder.test.tsx src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts src/components/admin/designer/ProcessStepEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the frontend quality commands that produced warnings during audit**

Run:

```bash
cd frontend
npm run lint:architecture
npm run lint:deadcode
npm run lint:duplication
npm run i18n-check
npm run build
```

Expected: all commands exit 0. `lint:architecture` may still print existing `no-orphans` warnings, `lint:duplication` may still print existing clone reports, and `build` may still print Rolldown/Babel warnings; capture them in the PR notes as non-blocking residual noise.

- [ ] **Step 4: Run the npm audit filter**

Run the Task 2 Step 1 filter command.

Expected: PASS with only the documented `xlsx` raw advisories remaining.

- [ ] **Step 5: Run the local fast CI gate**

Run:

```bash
make ci-fast
```

Expected: PASS.

- [ ] **Step 6: Document residual warnings in the PR description**

Use this PR note:

```markdown
Residual non-blocking warning noise after this fix:

- `npm run build`: Rolldown reports ineffective dynamic imports for modules that are also statically imported; build exits 0.
- `npm run lint:architecture`: existing `no-orphans` warnings remain; dependency-cruiser exits 0.
- `npm run lint:duplication`: existing clone reports remain; jscpd exits 0.
- Raw `npm audit --json`: accepted `xlsx` advisories remain, documented in SECURITY.md and filtered by CI.
```

- [ ] **Step 7: Commit any final verification metadata only if files changed**

Run:

```bash
git status --short
```

Expected: clean except for intended commits. If no files changed during Task 4, do not commit.

---

## Rollback Notes

- If `npm update fast-uri --package-lock-only` changes more than `fast-uri`, inspect the diff before committing. Prefer a lock-only targeted update over upgrading `orval` to v8 because Orval v8 is a larger generator/tooling migration.
- If `AudioRecorder.test.tsx` fails after helper extraction, revert only Task 3 and keep Tasks 1-2; the CI lint and audit fixes are independent.
- Do not add `fast-uri` to the audit allowlist. It has a patched version and is dev-tooling only, so refreshing the lock is the correct fix.
