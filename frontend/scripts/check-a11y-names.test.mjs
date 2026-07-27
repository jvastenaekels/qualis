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
