import { describe, expect, it } from 'vitest';
import { analyzeSource } from './check-a11y-names.mjs';

/** Names of the controls the checker considers unnamed, for readable assertions. */
function unnamedTags(source) {
    return analyzeSource('probe.tsx', source).unnamed.map((finding) => finding.tag);
}

function lowContrastTags(source) {
    return analyzeSource('probe.tsx', source).lowContrast.map((finding) => finding.tag);
}

const wrap = (jsx) => `export const Probe = () => (\n${jsx}\n);\n`;

describe('analyzeSource — controls that ARE named', () => {
    it.each([
        ['visible text', '<Button onClick={go}>Delete</Button>'],
        ['a translated child', "<Button onClick={go}>{t('a.b', 'Delete')}</Button>"],
        ['aria-label', '<Button aria-label="Delete"><Trash2 /></Button>'],
        ['aria-labelledby', '<Button aria-labelledby="x"><Trash2 /></Button>'],
        ['an sr-only span', '<Button><Trash2 /><span className="sr-only">Delete</span></Button>'],
        ['an img alt', '<a href="/x"><img src="/l.png" alt="Partner" /></a>'],
        ['a title fallback', '<Button title="Delete"><Trash2 /></Button>'],
        ['asChild delegation', '<TooltipTrigger asChild><Button>Go</Button></TooltipTrigger>'],
    ])('accepts a control named by %s', (_label, jsx) => {
        expect(unnamedTags(wrap(jsx))).toEqual([]);
    });

    it('accepts a SelectTrigger whose SelectValue carries a translated placeholder', () => {
        const source = wrap(`<SelectTrigger>
            <SelectValue placeholder={t('admin.design.toolbar.select_lang')} />
        </SelectTrigger>`);
        expect(unnamedTags(source)).toEqual([]);
    });
});

describe('analyzeSource — controls that are NOT named', () => {
    it.each([
        ['an icon-only Button', '<Button onClick={go}><Trash2 /></Button>', 'Button'],
        ['an icon-only button', '<button type="button"><X /></button>', 'button'],
        [
            'a bare TooltipTrigger',
            '<TooltipTrigger><div><Mail /></div></TooltipTrigger>',
            'TooltipTrigger',
        ],
        [
            'a SelectTrigger with a bare SelectValue',
            '<SelectTrigger><SelectValue /></SelectTrigger>',
            'SelectTrigger',
        ],
    ])('flags %s', (_label, jsx, tag) => {
        expect(unnamedTags(wrap(jsx))).toEqual([tag]);
    });

    it('is not fooled by a className that merely looks like a string', () => {
        // Regression guard: a `LOOKS_LIKE_TEXT` regex over the expression source treated
        // "h-4 w-4" as an accessible name, which passes almost every icon button in React.
        const source = wrap('<Button>{isBusy ? <Trash2 className="h-4 w-4" /> : null}</Button>');
        expect(unnamedTags(source)).toEqual(['Button']);
    });
});

describe('analyzeSource — the id escape hatch', () => {
    it('does NOT accept a bare id, because task 6.7b adds ids for a living', () => {
        expect(unnamedTags(wrap('<Button id="delete-thing"><Trash2 /></Button>'))).toEqual([
            'Button',
        ]);
    });

    it('accepts an id a Label in the same file points at', () => {
        const source = `export const Probe = () => (
            <div>
                <Label htmlFor="role-select">Role</Label>
                <SelectTrigger id="role-select"><SelectValue /></SelectTrigger>
            </div>
        );`;
        expect(unnamedTags(source)).toEqual([]);
    });

    it('matches an expression id against an expression htmlFor', () => {
        const source = `export const Probe = () => (
            <div>
                <Label htmlFor={fieldId}>Role</Label>
                <SelectTrigger id={fieldId}><SelectValue /></SelectTrigger>
            </div>
        );`;
        expect(unnamedTags(source)).toEqual([]);
    });

    it('does not accept an id that no label points at', () => {
        const source = `export const Probe = () => (
            <div>
                <Label htmlFor="other-field">Role</Label>
                <SelectTrigger id="role-select"><SelectValue /></SelectTrigger>
            </div>
        );`;
        expect(unnamedTags(source)).toEqual(['SelectTrigger']);
    });
});

describe('analyzeSource — the remaining escape hatches', () => {
    it('treats {...props} as possibly named by the caller', () => {
        expect(unnamedTags(wrap('<Button {...props}><Trash2 /></Button>'))).toEqual([]);
    });

    it('treats a dynamic child as undecidable rather than unnamed', () => {
        expect(unnamedTags(wrap('<Button>{label}</Button>'))).toEqual([]);
    });
});

describe('analyzeSource — fingerprints', () => {
    it('distinguishes two structurally different controls in one file', () => {
        const source = `export const Probe = () => (
            <div>
                <Button onClick={a}><Trash2 /></Button>
                <Button onClick={a}><Pencil /></Button>
            </div>
        );`;
        const fingerprints = analyzeSource('probe.tsx', source).unnamed.map((f) => f.fingerprint);
        expect(new Set(fingerprints).size).toBe(2);
    });

    it('survives a line move, so unrelated edits above a control do not churn the baseline', () => {
        const jsx = '<Button onClick={a}><Trash2 /></Button>';
        const first = analyzeSource('probe.tsx', wrap(jsx)).unnamed[0];
        const second = analyzeSource('probe.tsx', `// a new import\n${wrap(jsx)}`).unnamed[0];
        expect(second.fingerprint).toBe(first.fingerprint);
        expect(second.line).not.toBe(first.line);
    });

    it('changes when the control is given a name, so a fix cannot mask a regression', () => {
        const before = analyzeSource('probe.tsx', wrap('<Button a={1}><Trash2 /></Button>'))
            .unnamed[0];
        const after = analyzeSource(
            'probe.tsx',
            wrap('<Button a={1} data-x="1"><Trash2 /></Button>')
        ).unnamed[0];
        expect(after.fingerprint).not.toBe(before.fingerprint);
    });
});

describe('analyzeSource — contrast', () => {
    it('flags the resting colour on the control', () => {
        expect(lowContrastTags(wrap('<Button className="text-slate-300">Go</Button>'))).toEqual([
            'Button',
        ]);
    });

    it('flags the resting colour on the icon the control wraps', () => {
        expect(
            lowContrastTags(
                wrap('<Button aria-label="Delete"><Trash2 className="text-slate-300" /></Button>')
            )
        ).toEqual(['Button']);
    });

    it('ignores a hover-only variant', () => {
        expect(
            lowContrastTags(wrap('<Button className="hover:text-slate-300">Go</Button>'))
        ).toEqual([]);
    });

    it('counts a wrapper and its asChild target once', () => {
        const source = wrap(`<DropdownMenuTrigger asChild>
            <Button className="text-slate-300" aria-label="More"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>`);
        expect(lowContrastTags(source)).toEqual(['DropdownMenuTrigger']);
    });
});

// Task 6.7h: the gate matched controls by tag, so a `<div>` made interactive by
// `role="button"`, a `tabIndex`, or dnd-kit's `{...attributes} {...listeners}` spread
// was invisible to it — the exact shape that let three drag handles sit at 1.45:1
// contrast forty pixels from delete buttons task 6.7d was fixing, gate-silent.
describe('analyzeSource — <input> joins NAME_BEARING', () => {
    it('flags a bare <input> with no name at all', () => {
        expect(unnamedTags(wrap('<input value={v} onChange={onChange} />'))).toEqual(['input']);
    });

    it('accepts an <input> named by aria-label', () => {
        expect(
            unnamedTags(wrap('<input aria-label="Search" value={v} onChange={onChange} />'))
        ).toEqual([]);
    });

    it('accepts an <input> paired with a Label in the same file', () => {
        const source = `export const Probe = () => (
            <div>
                <Label htmlFor="title">Title</Label>
                <input id="title" value={v} onChange={onChange} />
            </div>
        );`;
        expect(unnamedTags(source)).toEqual([]);
    });

    it('does NOT accept placeholder alone as a name — accname excludes it', () => {
        // Regression guard for task 6.7h's own triage: a real getByRole probe against
        // an equivalent placeholder-only input resolved an EMPTY accessible name, so
        // the checker must not treat placeholder as naming the input itself (as opposed
        // to a descendant's placeholder, e.g. <SelectValue>, which legitimately does).
        expect(unnamedTags(wrap('<input placeholder="Section title…" />'))).toEqual(['input']);
    });

    it('is invisible to the wrapping-<label> naming pattern — a known, documented gap', () => {
        // <label> wrapping an <input> with no htmlFor names it via HTML label
        // association (verified live with getByRole during task 6.7h's triage), but
        // collectLabelTargets only recognises the htmlFor/id pairing shape. This is a
        // known false positive, left unfixed with a source comment at its one real
        // occurrence (ConditionOfInstructionEditor.tsx) rather than baselined silently.
        const source = wrap('<label><input type="checkbox" /><span>Enable it</span></label>');
        expect(unnamedTags(source)).toEqual(['input']);
    });
});

describe('analyzeSource — effective role: a <div> is a control by role, not just by tag', () => {
    it('flags an unnamed div carrying role="button"', () => {
        expect(unnamedTags(wrap('<div role="button" tabIndex={0}><Trash2 /></div>'))).toEqual([
            'div',
        ]);
    });

    it('accepts a role="button" div named by aria-label', () => {
        expect(
            unnamedTags(wrap('<div role="button" tabIndex={0} aria-label="Delete"><Trash2 /></div>'))
        ).toEqual([]);
    });

    it('flags an unnamed div carrying an interactive role other than button (switch)', () => {
        expect(unnamedTags(wrap('<div role="switch" tabIndex={0}><Icon /></div>'))).toEqual([
            'div',
        ]);
    });

    it('does NOT match a structural role — role="grid" is not a control', () => {
        // Regression guard: GridSort.tsx's roving-tabindex grid/row containers carry
        // role="grid"/"row", never a name in the button/link sense; matching them would
        // flag structure, not controls.
        expect(unnamedTags(wrap('<div role="grid"><Cell /></div>'))).toEqual([]);
    });

    it('flags an unnamed div made a tab stop by a bare tabIndex, with no role at all', () => {
        expect(unnamedTags(wrap('<div tabIndex={0} onClick={go}><Icon /></div>'))).toEqual([
            'div',
        ]);
    });

    it('does NOT match tabIndex={-1} — a roving-tabindex script-focus target, never tabbed to', () => {
        // Regression guard: GridSort.tsx's role="row" containers carry tabIndex={-1} for
        // internal keyboard-navigation bookkeeping, not as a control a user tabs to.
        expect(unnamedTags(wrap('<div role="row" tabIndex={-1}><Cell /></div>'))).toEqual([]);
    });

    it('flags the dnd-kit spread {...attributes} {...listeners} as a control, unnamed', () => {
        // The exact shape of the three gate-invisible drag handles task 6.7d fixed by
        // hand: no literal role/tabIndex in source, both injected by the spread.
        expect(
            unnamedTags(wrap('<div {...attributes} {...listeners}><GripVertical /></div>'))
        ).toEqual(['div']);
    });

    it('accepts the dnd-kit spread when an explicit aria-label is also present', () => {
        expect(
            unnamedTags(
                wrap('<div {...attributes} {...listeners} aria-label="Reorder"><GripVertical /></div>')
            )
        ).toEqual([]);
    });

    it('does NOT extend the "spread may be named by caller" pass to the dnd-kit pair', () => {
        // Critical: before this task, ANY spread (including {...attributes}
        // {...listeners}) silenced a finding outright. dnd-kit's attributes/listeners
        // are known never to carry a name (confirmed against @dnd-kit/core's source), so
        // they must not inherit the generic {...props}-might-be-named-by-the-caller
        // escape hatch — this is the exact bug that would otherwise have re-hidden the
        // three drag handles this task's widened net was supposed to surface.
        expect(
            unnamedTags(wrap('<div {...attributes} {...listeners}><GripVertical /></div>'))
        ).toEqual(['div']);
    });

    it('a lone {...attributes} spread (no listeners) is not recognised as the dnd-kit pair', () => {
        // Deliberately conservative, matching the brief's own illustration: the checker
        // requires the exact pair this codebase always writes together (confirmed by
        // grep — every {...attributes} site also spreads {...listeners}), not a single
        // generic-sounding identifier, so a coincidentally-named unrelated `attributes`
        // variable elsewhere cannot trigger a false match. A recorded limitation, not
        // a gap this task's known instances hit.
        expect(unnamedTags(wrap('<div {...attributes}><GripVertical /></div>'))).toEqual([]);
    });

    it('still treats an arbitrary, unrecognised spread as possibly named — the escape hatch survives', () => {
        // Regression guard for the pre-existing {...props} behaviour: an unknown spread
        // (not the dnd-kit pair) must remain undecidable, not flagged.
        expect(unnamedTags(wrap('<div {...someOtherProps}><GripVertical /></div>'))).toEqual([]);
    });

    it('flags low contrast on an effective-role div the same way as a tag-matched control', () => {
        expect(
            lowContrastTags(
                wrap('<div role="button" tabIndex={0} className="text-slate-300">Go</div>')
            )
        ).toEqual(['div']);
    });
});
