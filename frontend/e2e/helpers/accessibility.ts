import { type Page, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Run accessibility checks on the current page.
 * @param page Playwright Page object
 * @param contextName Optional name for the context (e.g. "Welcome Page") to make error messages clearer
 * @param exclusions Optional list of selectors to exclude from the check (use sparingly)
 */
export async function checkAccessibility(
    page: Page,
    contextName?: string,
    exclusions: string[] = []
) {
    const builder = new AxeBuilder({ page });

    if (exclusions.length > 0) {
        builder.exclude(exclusions);
    }

    const accessibilityScanResults = await builder.analyze();

    if (accessibilityScanResults.violations.length > 0) {
        const report = accessibilityScanResults.violations.map((violation) => {
            return {
                id: violation.id,
                impact: violation.impact,
                description: violation.description,
                nodes: violation.nodes.map((node) => node.html).join('\n'),
            };
        });

        console.error(
            `Accessibility violations found${contextName ? ` in ${contextName}` : ''}:`,
            JSON.stringify(report, null, 2)
        );
    }

    expect(accessibilityScanResults.violations).toEqual([]);
}
