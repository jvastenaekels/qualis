#!/usr/bin/env node
/**
 * check-a11y-names — a regression gate for the accessibility defects that Biome
 * cannot express, plus a guard on the Biome configuration that expresses the rest.
 *
 * Why this exists (task 6.7a, 2026-07-27):
 *
 *   1. Biome 2.5.5 has no accessible-name rule at all — not even for intrinsic
 *      `<button>` — and only three of its 39 a11y rules accept any component
 *      mapping. Qualis writes almost every control as a component, so `<Button>`
 *      and `<TooltipTrigger>` escape the entire rule set. No configuration covers
 *      this; it needs its own checker.
 *   2. No linter knows that `text-slate-300` is 1.45:1 on white.
 *   3. `biome-ignore-all` suppressions are prose: nothing fails when the backlog
 *      they cover is cleared, and while they stand the rule is off for the whole
 *      file. This checker re-lints those files with the suppressions stripped, so
 *      they are never blind and the suppressions become self-removing.
 *   4. A `//` comment in biome.json makes Biome discard the entire config with no
 *      diagnostic naming the file and lint on defaults. This checker parses the
 *      config as strict JSON and asserts the rule that matters is still armed.
 *
 * Findings are keyed by a structural fingerprint (tag + attribute names + descendant
 * tags), not by a per-file count, so a fix and a fresh regression in the same file
 * cannot cancel each other out, and not by line number, so unrelated edits above a
 * control do not spuriously fail.
 *
 *   npm run lint:a11y             check against the baseline
 *   npm run lint:a11y -- --update rewrite the baseline from the current tree
 *   npm run lint:a11y -- --list   print every finding with file:line
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const SRC_DIR = path.join(FRONTEND_DIR, 'src');
const BASELINE_PATH = path.join(SCRIPT_DIR, 'a11y-baseline.json');
const BIOME_CONFIG_PATH = path.join(FRONTEND_DIR, 'biome.json');
const BIOME_BIN = path.join(FRONTEND_DIR, 'node_modules', '.bin', 'biome');

const LABEL_RULE = 'lint/a11y/noLabelWithoutControl';
const SUPPRESSION_MARKER = `biome-ignore-all ${LABEL_RULE}`;

/**
 * Components and intrinsic elements that render a focusable control the
 * accessible-name computation applies to. Radix `*Trigger` components render a real
 * `<button>` unless `asChild` hands rendering to their child.
 *
 * Known limitation: this is a hand-maintained allowlist. An aliased import
 * (`import { Button as Btn }`) or a new local wrapper is invisible to it.
 */
const NAME_BEARING = new Set([
    'a',
    'button',
    'AccordionTrigger',
    'AlertDialogTrigger',
    'Button',
    'DialogTrigger',
    'DropdownMenuTrigger',
    'PopoverTrigger',
    'SelectTrigger',
    'SheetTrigger',
    'TabsTrigger',
    'Toggle',
    'TooltipTrigger',
]);

// Deliberately absent from NAME_BEARING: `SidebarTrigger`, which renders its own
// `<span className="sr-only">` label inside src/components/ui/sidebar.tsx, so every
// call site is named without saying so.

/** Every element above, plus the controls that can carry a contrast-bearing class. */
const CONTRAST_BEARING = new Set([...NAME_BEARING, 'Input', 'Textarea', 'Checkbox', 'Switch']);

/** 1.45:1 against white — fails WCAG 1.4.3 (4.5:1) and 1.4.11 (3:1) outright. */
const LOW_CONTRAST_CLASS = 'text-slate-300';

/* -------------------------------------------------------------------------- */
/* AST helpers                                                                 */
/* -------------------------------------------------------------------------- */

function openingElementOf(node) {
    return ts.isJsxElement(node) ? node.openingElement : node;
}

function tagNameOf(node, sourceFile) {
    return openingElementOf(node).tagName.getText(sourceFile);
}

function attributesOf(node, sourceFile) {
    const map = new Map();
    let hasSpread = false;
    for (const attribute of openingElementOf(node).attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
            hasSpread = true;
            continue;
        }
        map.set(attribute.name.getText(sourceFile), attribute);
    }
    return { map, hasSpread };
}

function jsxChildrenOf(node) {
    return ts.isJsxElement(node) ? node.children : [];
}

/** `t('key', 'Fallback')`, `i18n.t(…)` — anything whose callee is named `t`. */
function isTranslationCall(node) {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (ts.isIdentifier(callee)) return callee.text === 't';
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text === 't';
    return false;
}

function isTextLiteral(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return node.text.trim().length > 0;
    }
    if (ts.isTemplateExpression(node)) {
        return (
            node.head.text.trim().length > 0 ||
            node.templateSpans.some((span) => span.literal.text.trim().length > 0)
        );
    }
    return false;
}

/**
 * Does this attribute carry user-visible text? `placeholder={t('…')}` on a
 * `<SelectValue>` renders inside its trigger and names it; `className="h-4 w-4"`
 * does not name anything.
 */
function attributeYieldsText(attribute) {
    const initializer = attribute?.initializer;
    if (!initializer) return false;
    if (ts.isStringLiteral(initializer)) return initializer.text.trim().length > 0;
    if (ts.isJsxExpression(initializer) && initializer.expression) {
        let text = false;
        const walk = (node) => {
            if (text) return;
            if (isTranslationCall(node) || isTextLiteral(node)) {
                text = true;
                return;
            }
            node.forEachChild(walk);
        };
        walk(initializer.expression);
        return text;
    }
    return false;
}

/* -------------------------------------------------------------------------- */
/* Accessible-name inspection                                                  */
/* -------------------------------------------------------------------------- */

/** Expression forms that render nothing at all. */
const RENDERS_NOTHING = new Set([
    ts.SyntaxKind.NullKeyword,
    ts.SyntaxKind.TrueKeyword,
    ts.SyntaxKind.FalseKeyword,
    ts.SyntaxKind.NumericLiteral,
]);

/**
 * Props an icon component may carry. A self-closing element limited to these renders
 * a glyph and contributes no text; anything else may render words, so it is treated
 * as opaque rather than assumed silent.
 */
const ICON_ONLY_PROPS = new Set([
    'className',
    'size',
    'strokeWidth',
    'style',
    'key',
    'color',
    'fill',
    'aria-hidden',
]);

function isIconElement(node, sourceFile) {
    if (!ts.isJsxSelfClosingElement(node)) return false;
    const { map, hasSpread } = attributesOf(node, sourceFile);
    if (hasSpread) return false;
    return [...map.keys()].every((name) => ICON_ONLY_PROPS.has(name));
}

/**
 * Walk an element's rendered subtree for anything that contributes to its accessible
 * name. JSX *attributes* are never treated as text unless they are one of the
 * naming attributes below — that is what stops `className="h-4 w-4"` from making
 * `{cond ? <Trash2 className="h-4 w-4"/> : null}` look like a named control.
 */
function inspectChildren(node, sourceFile) {
    const found = { literalText: false, translatedText: false, namedChild: false, dynamic: false };

    const visitElement = (element) => {
        const { map } = attributesOf(element, sourceFile);
        const className = map.get('className');
        if (className && /sr-only/.test(className.getText(sourceFile))) {
            found.namedChild = true;
        }
        // `<img alt="…">` names its link; `aria-label` on a child is exposed when the
        // child is the only content; `<SelectValue placeholder={t(…)}>` renders inside
        // its trigger.
        if (map.has('alt') || map.has('aria-label')) found.namedChild = true;
        if (attributeYieldsText(map.get('placeholder'))) found.namedChild = true;
        visitChildren(element);
    };

    /**
     * Walks an expression's *value* positions, never its JSX attributes and never a
     * condition. `{busy ? <Trash2 className="h-4 w-4"/> : null}` renders an icon or
     * nothing — that is decidable, and it is decidably nameless. `{label}` is not:
     * an identifier may hold a string, so it sets `opaque` and the control is left
     * alone.
     */
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a dispatch over JSX/conditional/logical/literal expression forms; splitting it would hide the shape of the grammar it walks
    const visitExpression = (expression, sub) => {
        if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression)) {
            visitElement(expression);
            if (!isIconElement(expression, sourceFile)) sub.opaque = true;
            return;
        }
        if (isTranslationCall(expression) || isTextLiteral(expression)) {
            sub.text = true;
            return;
        }
        if (ts.isParenthesizedExpression(expression)) {
            visitExpression(expression.expression, sub);
            return;
        }
        if (ts.isConditionalExpression(expression)) {
            visitExpression(expression.whenTrue, sub);
            visitExpression(expression.whenFalse, sub);
            return;
        }
        if (ts.isBinaryExpression(expression)) {
            // `cond && <Icon/>` renders only the right-hand side.
            const kind = expression.operatorToken.kind;
            if (kind === ts.SyntaxKind.AmpersandAmpersandToken) {
                visitExpression(expression.right, sub);
                return;
            }
            visitExpression(expression.left, sub);
            visitExpression(expression.right, sub);
            return;
        }
        if (RENDERS_NOTHING.has(expression.kind)) return;
        // Identifier, call, property access, template with holes…: could be text.
        sub.opaque = true;
    };

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: three JSX child kinds, each with its own naming rule; the branching IS the specification
    function visitChildren(parent) {
        for (const child of jsxChildrenOf(parent)) {
            if (ts.isJsxText(child)) {
                if (child.getText(sourceFile).trim()) found.literalText = true;
            } else if (ts.isJsxExpression(child)) {
                if (!child.expression) continue;
                const sub = { text: false, opaque: false };
                visitExpression(child.expression, sub);
                if (sub.text) found.translatedText = true;
                else if (sub.opaque) found.dynamic = true;
            } else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
                visitElement(child);
            }
        }
    }

    visitChildren(node);
    return found;
}

/**
 * Every `htmlFor`/`for` target declared by a label-ish element in this file, keyed by
 * the *source text* of the value so `htmlFor={fieldId}` matches `id={fieldId}`.
 *
 * This is what stops the gate certifying its own defeat: task 6.7b's mechanism is
 * "add an id", so an `id` may only silence a finding when a label actually points at
 * it.
 */
function collectLabelTargets(sourceFile) {
    const targets = new Set();
    const visit = (node) => {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = tagNameOf(node, sourceFile);
            if (/(^|\.)([Ll]abel)$/.test(tag)) {
                const { map } = attributesOf(node, sourceFile);
                const target = map.get('htmlFor') ?? map.get('for');
                const initializer = target?.initializer;
                if (initializer) {
                    targets.add(
                        initializer
                            .getText(sourceFile)
                            .replace(/^["'{]|["'}]$/g, '')
                            .trim()
                    );
                }
            }
        }
        node.forEachChild(visit);
    };
    visit(sourceFile);
    return targets;
}

/**
 * A control counts as unnamed when nothing in the accessible-name computation can
 * reach it. Escape hatches, each deliberate and each documented:
 *
 *   asChild        rendering is delegated; the child is judged instead
 *   aria-label*    an explicit name
 *   title          accname's last-resort fallback (weak, but conformant)
 *   id             ONLY when a label in the same file points at it
 *   {...props}     the name may arrive from the caller; undecidable
 *   dynamic child  the name is computed at runtime; undecidable
 *
 * The checker never guesses, so its count is a floor, not a ceiling.
 */
function isUnnamed(node, sourceFile, labelTargets) {
    const { map, hasSpread } = attributesOf(node, sourceFile);
    if (map.has('asChild')) return false;
    if (map.has('aria-label') || map.has('aria-labelledby')) return false;
    if (map.has('title')) return false;
    if (hasSpread) return false;

    const id = map.get('id');
    if (id?.initializer) {
        const key = id.initializer
            .getText(sourceFile)
            .replace(/^["'{]|["'}]$/g, '')
            .trim();
        if (labelTargets.has(key)) return false;
    }

    const children = inspectChildren(node, sourceFile);
    if (children.literalText || children.translatedText || children.namedChild) return false;
    if (children.dynamic) return false;
    return true;
}

/* -------------------------------------------------------------------------- */
/* Contrast inspection                                                         */
/* -------------------------------------------------------------------------- */

function classNameIsLowContrast(node, sourceFile) {
    const { map } = attributesOf(node, sourceFile);
    const className = map.get('className');
    if (!className) return false;
    // Only the base state matters: `hover:text-slate-300` is not the resting colour.
    return className
        .getText(sourceFile)
        .split(/[\s'"`]+/)
        .some(
            (token) => token === LOW_CONTRAST_CLASS || token.startsWith(`${LOW_CONTRAST_CLASS}/`)
        );
}

/**
 * The colour may sit on the control itself or on the icon it wraps — both render the
 * control's resting foreground at 1.45:1. One finding per control either way.
 */
function hasLowContrastClass(node, sourceFile) {
    if (classNameIsLowContrast(node, sourceFile)) return true;
    let found = false;
    const visit = (child) => {
        if (found) return;
        if (
            (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) &&
            classNameIsLowContrast(child, sourceFile)
        ) {
            found = true;
            return;
        }
        child.forEachChild(visit);
    };
    node.forEachChild(visit);
    return found;
}

/* -------------------------------------------------------------------------- */
/* Fingerprinting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A structural identity that survives reformatting and line moves but changes when
 * the control itself changes. Adding `aria-label` to a control retires its old
 * fingerprint AND a new unnamed control introduces an unknown one, so a fix and a
 * regression in the same file are both reported instead of cancelling out.
 */
export function fingerprintOf(node, sourceFile) {
    const { map, hasSpread } = attributesOf(node, sourceFile);
    const attributeNames = [...map.keys()].sort();
    if (hasSpread) attributeNames.push('...');

    const descendants = [];
    // Translation keys are the strongest discriminator available: they survive
    // restyling and rewording, and they are what makes two `<Label className="…">`
    // elements in the same file distinguishable at all.
    const translationKeys = [];
    const visit = (child) => {
        if (
            descendants.length < 12 &&
            (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
        ) {
            descendants.push(tagNameOf(child, sourceFile));
        }
        if (translationKeys.length < 4 && isTranslationCall(child)) {
            const [first] = child.arguments;
            // Keys are often template literals (`admin.design.interface.nav.${tipKey}`),
            // so take the raw source rather than only plain string literals.
            if (first) translationKeys.push(first.getText(sourceFile));
        }
        child.forEachChild(visit);
    };
    node.forEachChild(visit);

    const material = [
        tagNameOf(node, sourceFile),
        attributeNames.join(','),
        descendants.join('>'),
        translationKeys.join(','),
    ].join('|');
    return crypto.createHash('sha1').update(material).digest('hex').slice(0, 10);
}

function keyOf(finding) {
    return `${finding.tag}#${finding.fingerprint}`;
}

/* -------------------------------------------------------------------------- */
/* Source analysis                                                             */
/* -------------------------------------------------------------------------- */

/** Exported for scripts/check-a11y-names.test.mjs. */
export function analyzeSource(fileName, sourceText) {
    const sourceFile = ts.createSourceFile(
        fileName,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    );
    const labelTargets = collectLabelTargets(sourceFile);
    const unnamed = [];
    const lowContrast = [];

    // `insideCountedControl` stops a wrapper/child pair such as
    // `<DropdownMenuTrigger asChild><Button …>` counting the same visual control twice.
    const visit = (node, insideCountedControl) => {
        let counted = insideCountedControl;
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = tagNameOf(node, sourceFile);
            const line =
                sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            if (NAME_BEARING.has(tag) && isUnnamed(node, sourceFile, labelTargets)) {
                unnamed.push({ line, tag, fingerprint: fingerprintOf(node, sourceFile) });
            }
            if (
                !insideCountedControl &&
                CONTRAST_BEARING.has(tag) &&
                hasLowContrastClass(node, sourceFile)
            ) {
                lowContrast.push({ line, tag, fingerprint: fingerprintOf(node, sourceFile) });
                counted = true;
            }
        }
        node.forEachChild((child) => visit(child, counted));
    };
    visit(sourceFile, false);

    return { unnamed, lowContrast };
}

function collectSourceFiles(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectSourceFiles(full, acc);
        else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) acc.push(full);
    }
    return acc;
}

function relativeToFrontend(filePath) {
    return path.relative(FRONTEND_DIR, filePath).split(path.sep).join('/');
}

function scanTree() {
    const unnamed = [];
    const lowContrast = [];
    for (const filePath of collectSourceFiles(SRC_DIR)) {
        const file = relativeToFrontend(filePath);
        const result = analyzeSource(filePath, fs.readFileSync(filePath, 'utf8'));
        for (const finding of result.unnamed) unnamed.push({ file, ...finding });
        for (const finding of result.lowContrast) lowContrast.push({ file, ...finding });
    }
    return { unnamed, lowContrast };
}

/* -------------------------------------------------------------------------- */
/* Biome config guard + suppressed-file re-lint                                */
/* -------------------------------------------------------------------------- */

/**
 * A `//` comment in biome.json makes Biome 2.5.5 discard the whole config silently
 * and lint on defaults. Parse it strictly and assert the rule is still armed the way
 * this gate assumes.
 */
function readBiomeConfig() {
    const raw = fs.readFileSync(BIOME_CONFIG_PATH, 'utf8');
    let config;
    try {
        config = JSON.parse(raw);
    } catch (error) {
        throw new Error(
            `${relativeToFrontend(BIOME_CONFIG_PATH)} is not strict JSON (${error.message}).\n` +
                'Biome 2.5.5 discards a malformed config with no diagnostic naming the file and\n' +
                'lints on its defaults instead — comments are NOT supported here.'
        );
    }
    const rule = config?.linter?.rules?.a11y?.noLabelWithoutControl;
    if (rule?.level !== 'error') {
        throw new Error(
            `${relativeToFrontend(BIOME_CONFIG_PATH)}: a11y.noLabelWithoutControl must be "error".`
        );
    }
    if (!rule?.options?.labelComponents?.includes('Label')) {
        throw new Error(
            `${relativeToFrontend(BIOME_CONFIG_PATH)}: ` +
                'a11y.noLabelWithoutControl needs options.labelComponents to include "Label" — ' +
                'without it the rule matches nothing in this codebase.'
        );
    }
    return config;
}

function suppressedFiles() {
    return collectSourceFiles(SRC_DIR).filter((filePath) =>
        fs.readFileSync(filePath, 'utf8').includes(SUPPRESSION_MARKER)
    );
}

/**
 * Re-lint the files that carry a `biome-ignore-all` for the label rule, with the
 * suppression removed. Without this the rule is simply off in the four largest admin
 * files, and nothing fails when the backlog they cover is finally cleared.
 *
 * The suppression line is blanked rather than deleted so Biome's line numbers stay
 * aligned with the real file and each diagnostic can be fingerprinted.
 */
function lintSuppressedFiles(biomeConfig) {
    const files = suppressedFiles();
    if (files.length === 0) return { findings: [], stale: [] };

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qualis-a11y-'));
    try {
        fs.writeFileSync(
            path.join(tempDir, 'biome.json'),
            JSON.stringify({
                $schema: biomeConfig.$schema,
                vcs: { enabled: false },
                formatter: { enabled: false },
                assist: { enabled: false },
                linter: {
                    enabled: true,
                    rules: {
                        preset: 'none',
                        a11y: {
                            preset: 'none',
                            // Copied verbatim so this pass can never drift from the real rule.
                            noLabelWithoutControl:
                                biomeConfig.linter.rules.a11y.noLabelWithoutControl,
                        },
                    },
                },
            })
        );

        const originalOf = new Map();
        for (const filePath of files) {
            const relative = relativeToFrontend(filePath);
            const destination = path.join(tempDir, relative);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            const stripped = fs
                .readFileSync(filePath, 'utf8')
                .split('\n')
                .map((line) => (line.includes(SUPPRESSION_MARKER) ? '' : line))
                .join('\n');
            fs.writeFileSync(destination, stripped);
            originalOf.set(destination, relative);
        }

        // The JSON reporter omits diagnostic spans, so positions come from the default
        // reporter's `path:line:col <category>` header, which Biome writes to stderr.
        const args = [
            'lint',
            `--config-path=${tempDir}`,
            '--colors=off',
            '--max-diagnostics=1000',
            tempDir,
        ];
        const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: tempDir };
        let output = '';
        try {
            output = execFileSync(BIOME_BIN, args, options);
        } catch (error) {
            // Biome exits 1 when it emits errors; that is the expected path here.
            output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
            if (!output.trim()) throw error;
        }

        const header = new RegExp(`^(\\S+):(\\d+):\\d+ ${LABEL_RULE} `, 'gm');
        const findings = [];
        const seen = new Set();
        const astCache = new Map();
        for (const match of output.matchAll(header)) {
            const absolute = path.resolve(tempDir, match[1]);
            const relative = originalOf.get(absolute);
            if (!relative) continue;
            const line = Number(match[2]);
            // stdout and stderr both carry the report; count each diagnostic once.
            const dedupe = `${relative}:${line}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            findings.push({ file: relative, line, ...labelIdentity(relative, line, astCache) });
        }

        // A suppression that no longer suppresses anything is dead weight that also keeps
        // the rule off for the whole file. Make clearing the backlog delete its own licence.
        const stale = files
            .map(relativeToFrontend)
            .filter((relative) => !findings.some((finding) => finding.file === relative));
        return { findings, stale };
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/** Fingerprint the `<Label>` Biome flagged, so the label backlog is keyed like the rest. */
function labelIdentity(relative, line, astCache) {
    if (line === 0) return { tag: 'Label', fingerprint: 'unlocated' };
    if (!astCache.has(relative)) {
        const absolute = path.join(FRONTEND_DIR, relative);
        astCache.set(
            relative,
            ts.createSourceFile(
                absolute,
                fs.readFileSync(absolute, 'utf8'),
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TSX
            )
        );
    }
    const sourceFile = astCache.get(relative);
    let identity = null;
    const visit = (node) => {
        if (identity) return;
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
            const start =
                sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            if (start === line && /(^|\.)([Ll]abel)$/.test(tagNameOf(node, sourceFile))) {
                identity = {
                    tag: tagNameOf(node, sourceFile),
                    fingerprint: fingerprintOf(node, sourceFile),
                };
                return;
            }
        }
        node.forEachChild(visit);
    };
    visit(sourceFile);
    return identity ?? { tag: 'Label', fingerprint: `line${line}` };
}

/* -------------------------------------------------------------------------- */
/* Baseline comparison                                                         */
/* -------------------------------------------------------------------------- */

function tallyByFile(findings) {
    const byFile = {};
    for (const finding of findings) {
        byFile[finding.file] ??= {};
        const bucket = byFile[finding.file];
        const key = keyOf(finding);
        bucket[key] = (bucket[key] ?? 0) + 1;
    }
    return Object.fromEntries(
        Object.entries(byFile)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([file, bucket]) => [
                file,
                Object.fromEntries(Object.entries(bucket).sort(([a], [b]) => a.localeCompare(b))),
            ])
    );
}

function compare(label, actual, baseline) {
    const regressions = [];
    const improvements = [];
    const files = new Set([...Object.keys(actual), ...Object.keys(baseline)]);
    for (const file of [...files].sort()) {
        const now = actual[file] ?? {};
        const then = baseline[file] ?? {};
        for (const key of new Set([...Object.keys(now), ...Object.keys(then)])) {
            const count = now[key] ?? 0;
            const allowed = then[key] ?? 0;
            if (count > allowed) {
                regressions.push(
                    `  ${file}  ${key}: ${count} ${label} (baseline allows ${allowed})`
                );
            } else if (count < allowed) {
                improvements.push(
                    `  ${file}  ${key}: ${count} ${label} (baseline still records ${allowed})`
                );
            }
        }
    }
    return { regressions, improvements };
}

function totalOf(tally) {
    return Object.values(tally).reduce(
        (sum, bucket) => sum + Object.values(bucket).reduce((a, b) => a + b, 0),
        0
    );
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

function reportStale(stale) {
    console.error('These files no longer have any label errors, so their suppression is dead');
    console.error(`weight — and while it stands, ${LABEL_RULE} is off for the whole file:\n`);
    for (const file of stale) console.error(`  ${file}`);
    console.error(`\nDelete the \`// ${SUPPRESSION_MARKER}\` line from each of them.`);
}

function main() {
    const args = process.argv.slice(2);
    const biomeConfig = readBiomeConfig();
    const { unnamed, lowContrast } = scanTree();
    const { findings: suppressedLabels, stale } = lintSuppressedFiles(biomeConfig);

    const actual = {
        unnamedControls: tallyByFile(unnamed),
        lowContrastControls: tallyByFile(lowContrast),
        suppressedLabelErrors: tallyByFile(suppressedLabels),
    };

    if (args.includes('--list')) {
        const rows = [
            ...unnamed.map((f) => ['unnamed-control  ', f]),
            ...lowContrast.map((f) => ['low-contrast     ', f]),
            ...suppressedLabels.map((f) => ['suppressed-label ', f]),
        ];
        for (const [kind, finding] of rows.sort((a, b) =>
            `${a[0]}${a[1].file}`.localeCompare(`${b[0]}${b[1].file}`)
        )) {
            console.log(
                `${kind} ${finding.file}:${finding.line} <${finding.tag}> ${keyOf(finding)}`
            );
        }
    }

    if (args.includes('--update')) {
        if (stale.length > 0) reportStale(stale);
        fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(actual, null, 4)}\n`);
        console.log(
            `a11y baseline written: ${unnamed.length} unnamed, ${lowContrast.length} low-contrast, ` +
                `${suppressedLabels.length} label errors behind suppressions.`
        );
        return;
    }

    if (stale.length > 0) {
        reportStale(stale);
        process.exit(1);
    }

    if (!fs.existsSync(BASELINE_PATH)) {
        console.error(`Missing baseline ${BASELINE_PATH}. Run: npm run lint:a11y -- --update`);
        process.exit(1);
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

    const checks = [
        compare('unnamed controls', actual.unnamedControls, baseline.unnamedControls ?? {}),
        compare(
            'low-contrast controls',
            actual.lowContrastControls,
            baseline.lowContrastControls ?? {}
        ),
        compare(
            'label errors behind a biome-ignore-all',
            actual.suppressedLabelErrors,
            baseline.suppressedLabelErrors ?? {}
        ),
    ];
    const regressions = checks.flatMap((check) => check.regressions);
    const improvements = checks.flatMap((check) => check.improvements);

    if (regressions.length > 0) {
        console.error('Accessibility regression:\n');
        console.error(regressions.join('\n'));
        console.error(
            '\nGive every control a name (visible text, aria-label, or an sr-only span),' +
                '\npair every <Label> with htmlFor, and use text-slate-400 or darker on controls.' +
                '\nRun `npm run lint:a11y -- --list` to see each finding.'
        );
        process.exit(1);
    }

    if (improvements.length > 0) {
        console.error('The a11y baseline is stale — these findings are gone:\n');
        console.error(improvements.join('\n'));
        console.error(
            '\nIf a file now has zero label errors, delete its `// biome-ignore-all` line too.' +
                '\nThen lock the improvement in with: npm run lint:a11y -- --update'
        );
        process.exit(1);
    }

    console.log(
        `a11y OK — ${totalOf(actual.unnamedControls)} unnamed controls, ` +
            `${totalOf(actual.lowContrastControls)} low-contrast controls, ` +
            `${totalOf(actual.suppressedLabelErrors)} label errors behind suppressions ` +
            'in 0 unsuppressed files, all matching the baseline.'
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
