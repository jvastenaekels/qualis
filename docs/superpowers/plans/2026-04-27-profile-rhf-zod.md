# Profile Page RHF+zod Migration Implementation Plan

**Goal:** Migrate `ProfilePage`'s two RHF forms (profile info + password change) to zod-validated schemas with localized error messages displayed below each field via shadcn `<FormField>`. Replace 4 instances of `err: any` + raw English fallbacks with `parseApiErrorSync` + i18n keys.

**Why this scope (not full Plan B2):** `GeneralSettingsPage`'s only "form" is one numeric input with HTML5 `min/max` validation — RHF+zod there is YAGNI. The genuine pain point flagged by the diagnostic is `ProfilePage`: RHF without schemas, no per-field error UI, English error literals, untyped error handlers.

**Architecture:** One PR, one commit. zod schemas built via `useMemo(() => makeSchema(t), [t])` so error messages localize on language switch. Forms wrapped in shadcn `<Form>` / `<FormField>` (matches `ProjectSettingsPage` precedent for consistent visual error treatment). Inline execution by Claude Code, `make ci-fast` as the gate.

**Tech Stack:** React 19 + TypeScript + react-hook-form + `@hookform/resolvers/zod` + zod + shadcn `<Form>` family + react-i18next + Vitest.

---

## Files

**Modify:**
- `frontend/src/pages/admin/ProfilePage.tsx` — convert both forms; replace `err: any` x4; remove English literals
- `frontend/public/locales/{en,fr,fi}/translation.json` — add new keys (see §i18n keys below)

**Create:**
- `frontend/src/pages/admin/ProfilePage.schema.test.ts` — unit tests for the two zod schemas

**Convention check:** zod + RHF + `@hookform/resolvers/zod` are already in the project (used by `ProjectSettingsPage`). No new dependencies.

---

## i18n keys to add

Under `admin.profile.personal`:
- `name_required`: `"Full name is required"` / `"Le nom complet est requis"` / `"Koko nimi vaaditaan"`

Under `admin.profile.security`:
- `invalid_token`: `"Invalid verification code"` / `"Code de vérification invalide"` / `"Virheellinen vahvistuskoodi"`
- `disable_error`: `"Failed to disable 2FA"` / `"Impossible de désactiver le 2FA"` / `"2FA-tunnistautumisen poistaminen epäonnistui"`

(`admin.profile.password.validation.{required,min_length}` already exist.)

---

## Implementation steps

1. **Add imports to `ProfilePage.tsx`:**
   ```ts
   import { z } from 'zod';
   import { zodResolver } from '@hookform/resolvers/zod';
   import { useMemo } from 'react';
   import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
   import { parseApiErrorSync } from '@/lib/error-utils';
   ```

2. **Build localized schemas inside the component:**
   ```ts
   const profileSchema = useMemo(
       () =>
           z.object({
               email: z.string().optional(),
               full_name: z.string().min(1, t('admin.profile.personal.name_required', 'Full name is required')),
           }),
       [t]
   );

   const passwordSchema = useMemo(
       () =>
           z.object({
               current_password: z.string().min(1, t('admin.profile.password.validation.required', 'Required')),
               new_password: z.string().min(8, t('admin.profile.password.validation.min_length', 'Min 8 characters')),
           }),
       [t]
   );
   ```

3. **Replace `useForm` calls** (lines 95-107):
   ```ts
   const profileForm = useForm<{ email?: string; full_name: string }>({
       resolver: zodResolver(profileSchema),
       values: { email: user?.email ?? undefined, full_name: user?.full_name ?? '' },
   });

   const passwordForm = useForm<{ current_password: string; new_password: string }>({
       resolver: zodResolver(passwordSchema),
       defaultValues: { current_password: '', new_password: '' },
   });
   ```
   Where the legacy code referenced `registerProfile`, `handleProfileSubmit`, etc., switch to `profileForm.register`, `profileForm.handleSubmit`, `passwordForm.formState.errors`, etc. Keep the `onProfileSubmit` / `onPasswordSubmit` async functions — only their `data` typing changes.

4. **Wrap each form in shadcn `<Form>` and convert each input to `<FormField>`:**
   - The profile form has 2 fields (email disabled + full_name). Wrap in `<Form {...profileForm}>` and rewrite each input as `<FormField name="email|full_name" render={({ field }) => <FormItem><FormLabel>...</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />`.
   - Same for password form's two fields.
   - Match the existing visual styling (className strings on `<Input>`, `<Label>`).
   - The submit buttons stay as-is, but tie disabled state to `profileForm.formState.isSubmitting` (or keep the existing `isUpdating` boolean, depending on simpler diff).

5. **Replace 4 untyped error handlers**:
   - Line 69-70 (2FA verify onError): `(err: any) => toast.error(err?.response?.data?.detail || 'Invalid token')` → `(err: unknown) => toast.error(parseApiErrorSync(err, t('admin.profile.security.invalid_token', 'Invalid verification code')))`
   - Line 89-90 (2FA disable onError): same pattern with `t('admin.profile.security.disable_error', 'Failed to disable 2FA')`
   - Line 121 (profile submit catch): `toast.error(t('admin.profile.personal.error', ...))` → wrap with `parseApiErrorSync(error, t(...))` so server-side messages surface.
   - Line 140-145 (password submit catch): same.

6. **Remove the `'No Name'` literal** that ProjectSettingsPage uses (out of scope for THIS PR — leave alone).

7. **Tests:** Create `ProfilePage.schema.test.ts` with:
   - profileSchema accepts `{ email: 'a@b.io', full_name: 'Ada' }`
   - profileSchema rejects `{ email: 'a@b.io', full_name: '' }` with the localized message
   - passwordSchema accepts `{ current_password: 'old', new_password: 'longenough' }`
   - passwordSchema rejects empty `current_password`
   - passwordSchema rejects `new_password` shorter than 8 characters

   Build the schemas in the test by passing a stub `t = (key, fallback) => fallback` so they're independent of i18next setup.

---

## Verification

- `cd frontend && npx vitest run src/pages/admin/ProfilePage.schema.test.ts` (target ≥5 cases passing)
- `npm run i18n-check` green
- `make ci-fast` green
- Manual smoke: open `/app/<slug>/profile` → clear `Full name` and submit → "Full name is required" shows below the field. Try password change with `new_password` "short" → "Min 8 characters" shows below the field.

---

## Commit message

```
refactor(profile): migrate ProfilePage forms to RHF + zod

ProfilePage previously used react-hook-form without schemas, so
validation was a single `register('field', { required: true })` and the
only error UI was the literal text "Required". Migrate both forms
(profile info + password change) to zod-resolved schemas with
localized messages displayed via shadcn <FormField>. Replace four
'err: any' + hardcoded English fallback handlers with parseApiErrorSync
+ i18n keys so server error messages surface in the user's language.

Adds 3 i18n keys (personal.name_required, security.invalid_token,
security.disable_error) in en/fr/fi. zod schemas are unit-tested.
```

---

## Out of scope

- `GeneralSettingsPage` quota field (single numeric input — RHF+zod is YAGNI).
- `<SettingsForm>` shell extraction (premature; only one form library now used across all 3 settings pages).
- 2FA inline disable flow (`showDisableConfirm` + `confirmPassword`) — kept as `useState` since it has no validation and is a single boolean+string pair.
