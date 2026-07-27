#!/usr/bin/env node
/**
 * check-a11y-names — a regression gate for two accessibility defects that Biome
 * cannot express.
 *
 * Why this exists (task 6.7a, 2026-07-27):
 *
 *   1. Biome's a11y rules only reason about *intrinsic* JSX elements. `useButtonType`
 *      fires on `<button>`, never on `<Button>`; nothing at all fires on
 *      `<TooltipTrigger>`. Qualis writes almost every control as a component, so
 *      37 of Biome's 39 a11y rules were already on at `error` and the codebase was
 *      green while ~49 interactive controls had no accessible name.
 *   2. No linter knows that `text-slate-300` is 1.45:1 on white. Contrast on
 *      interactive controls is invisible to static analysis unless someone names
 *      the class.
 *
 * Mechanism: parse every non-test .tsx with the TypeScript compiler API, count the
 * two defects per file, and compare against a committed baseline. Any increase, or
 * any occurrence in a file that is not in the baseline, fails. A decrease also fails,
 * with instructions to re-baseline — that is what makes the number ratchet down and
 * stay honest.
 *
 *   npm run lint:a11y            check against the baseline
 *   npm run lint:a11y -- --update rewrite the baseline from the current tree
 *   npm run lint:a11y -- --list   print every finding with file:line
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const SRC_DIR = path.join(FRONTEND_DIR, 'src');
const BASELINE_PATH = path.join(SCRIPT_DIR, 'a11y-baseline.json');

/**
 * Components and intrinsic elements that render a focusable control which the
 * accessible-name computation applies to. Radix `*Trigger` components render a real
 * `<button>` unless `asChild` hands rendering to their child.
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

function collectSourceFiles(dir, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSourceFiles(full, acc);
        } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
            acc.push(full);
        }
    }
    return acc;
}

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

/** Matches a `t(...)` call or any quoted string of two or more characters. */
const LOOKS_LIKE_TEXT = /\bt\s*\(|['"`][^'"`]{2,}['"`]/;

/**
 * Walk an element's rendered subtree looking for anything that would contribute to
 * its accessible name: literal JSX text, a translated string, or a visually hidden
 * `sr-only` label. Also reports whether any child is a dynamic expression whose text
 * content cannot be decided statically.
 */
function inspectChildren(node, sourceFile) {
    const found = { literalText: false, translatedText: false, srOnly: false, dynamic: false };

    const visitJsxNode = (jsxNode) => {
        const { map } = attributesOf(jsxNode, sourceFile);
        const className = map.get('className');
        if (className && /sr-only/.test(className.getText(sourceFile))) {
            found.srOnly = true;
        }
        // An `<img alt="…">` inside a link or button names the control.
        if (map.has('alt') || map.has('aria-label')) {
            found.srOnly = true;
        }
        if (ts.isJsxElement(jsxNode)) {
            visitChildren(jsxNode);
        }
    };

    const visitExpression = (expression) => {
        if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression)) {
            visitJsxNode(expression);
            return;
        }
        expression.forEachChild(visitExpression);
    };

    const visitJsxExpressionChild = (child) => {
        const expression = child.expression;
        if (!expression) return;
        if (LOOKS_LIKE_TEXT.test(expression.getText(sourceFile))) {
            found.translatedText = true;
        } else {
            found.dynamic = true;
        }
        visitExpression(expression);
    };

    function visitChildren(parent) {
        for (const child of parent.children ?? []) {
            if (ts.isJsxText(child) && child.getText(sourceFile).trim()) {
                found.literalText = true;
            } else if (ts.isJsxExpression(child)) {
                visitJsxExpressionChild(child);
            } else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
                visitJsxNode(child);
            }
        }
    }

    if (ts.isJsxElement(node)) {
        visitChildren(node);
    }
    return found;
}

/**
 * A control counts as unnamed when nothing in the accessible-name computation can
 * reach it: no `aria-label`/`aria-labelledby`, no `title` fallback, no `sr-only`
 * text, no literal or translated child text, and rendering is not delegated with
 * `asChild`. Elements whose only children are dynamic expressions, that spread
 * unknown props, or that carry an `id` (so an external `<Label htmlFor>` may name
 * them — Biome's `noLabelWithoutControl` guards that side) are treated as named:
 * the checker never guesses, so its count is a floor, not a ceiling.
 */
function isUnnamed(node, sourceFile) {
    const { map, hasSpread } = attributesOf(node, sourceFile);
    if (map.has('asChild')) return false;
    if (map.has('aria-label') || map.has('aria-labelledby')) return false;
    if (map.has('title')) return false;
    if (map.has('id')) return false;
    if (hasSpread) return false;
    const children = inspectChildren(node, sourceFile);
    if (children.literalText || children.translatedText || children.srOnly) return false;
    if (children.dynamic) return false;
    return true;
}

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

function scan() {
    const unnamed = [];
    const lowContrast = [];

    for (const filePath of collectSourceFiles(SRC_DIR)) {
        const relative = path.relative(FRONTEND_DIR, filePath).split(path.sep).join('/');
        const sourceFile = ts.createSourceFile(
            filePath,
            fs.readFileSync(filePath, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX
        );

        // `insideCountedControl` stops a wrapper/child pair such as
        // `<DropdownMenuTrigger asChild><Button …>` counting the same visual control twice.
        const visit = (node, insideCountedControl) => {
            let counted = insideCountedControl;
            if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
                const tag = tagNameOf(node, sourceFile);
                const line =
                    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
                if (NAME_BEARING.has(tag) && isUnnamed(node, sourceFile)) {
                    unnamed.push({ file: relative, line, tag });
                }
                if (
                    !insideCountedControl &&
                    CONTRAST_BEARING.has(tag) &&
                    hasLowContrastClass(node, sourceFile)
                ) {
                    lowContrast.push({ file: relative, line, tag });
                    counted = true;
                }
            }
            node.forEachChild((child) => visit(child, counted));
        };
        visit(sourceFile, false);
    }

    return { unnamed, lowContrast };
}

function countByFile(findings) {
    const counts = {};
    for (const finding of findings) {
        counts[finding.file] = (counts[finding.file] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function compare(label, actual, baseline) {
    const problems = [];
    for (const [file, count] of Object.entries(actual)) {
        const allowed = baseline[file] ?? 0;
        if (count > allowed) {
            problems.push(`  ${file}: ${count} ${label} (baseline allows ${allowed})`);
        }
    }
    const improved = [];
    for (const [file, allowed] of Object.entries(baseline)) {
        const count = actual[file] ?? 0;
        if (count < allowed) {
            improved.push(`  ${file}: ${count} ${label} (baseline still records ${allowed})`);
        }
    }
    return { problems, improved };
}

function main() {
    const args = process.argv.slice(2);
    const { unnamed, lowContrast } = scan();
    const actual = {
        unnamedControls: countByFile(unnamed),
        lowContrastControls: countByFile(lowContrast),
    };

    if (args.includes('--list')) {
        for (const finding of [...unnamed].sort((a, b) => a.file.localeCompare(b.file))) {
            console.log(`unnamed-control    ${finding.file}:${finding.line} <${finding.tag}>`);
        }
        for (const finding of [...lowContrast].sort((a, b) => a.file.localeCompare(b.file))) {
            console.log(`low-contrast       ${finding.file}:${finding.line} <${finding.tag}>`);
        }
    }

    if (args.includes('--update')) {
        fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(actual, null, 4)}\n`);
        console.log(
            `a11y baseline written: ${unnamed.length} unnamed controls, ${lowContrast.length} low-contrast controls.`
        );
        return;
    }

    if (!fs.existsSync(BASELINE_PATH)) {
        console.error(`Missing baseline ${BASELINE_PATH}. Run: npm run lint:a11y -- --update`);
        process.exit(1);
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

    const names = compare(
        'unnamed controls',
        actual.unnamedControls,
        baseline.unnamedControls ?? {}
    );
    const contrast = compare(
        'low-contrast controls',
        actual.lowContrastControls,
        baseline.lowContrastControls ?? {}
    );

    const regressions = [...names.problems, ...contrast.problems];
    const improvements = [...names.improved, ...contrast.improved];

    if (regressions.length > 0) {
        console.error('Accessibility regression — new controls without an accessible name,');
        console.error('or new interactive controls using a 1.45:1 text colour:\n');
        console.error(regressions.join('\n'));
        console.error(
            '\nGive every control a name (visible text, aria-label, or a sr-only span) and'
        );
        console.error('use text-slate-400 or darker on interactive controls.');
        console.error('Run `npm run lint:a11y -- --list` to see each finding.');
        process.exit(1);
    }

    if (improvements.length > 0) {
        console.error('The a11y baseline is stale — these files improved:\n');
        console.error(improvements.join('\n'));
        console.error('\nLock the improvement in with: npm run lint:a11y -- --update');
        process.exit(1);
    }

    console.log(
        `a11y names OK — ${unnamed.length} unnamed controls and ${lowContrast.length} low-contrast controls, matching the baseline.`
    );
}

main();
