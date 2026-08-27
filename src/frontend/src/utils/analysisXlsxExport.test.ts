import { describe, it, expect } from 'vitest';
import { generateAnalysisXlsx } from './analysisXlsxExport';
import type { AnalysisResult } from '@/api/model';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Workbook, type Worksheet } from 'exceljs';

const mockResult: AnalysisResult = {
    n_participants: 3,
    n_statements: 4,
    n_factors: 2,
    extraction: 'pca',
    rotation: 'varimax',
    eigenvalues: [2.5, 1.2],
    total_variance_explained: 61.7,
    loadings: [
        [0.8, 0.1],
        [0.7, 0.2],
        [0.1, 0.9],
    ],
    rotated_loadings: [
        [0.82, 0.08],
        [0.71, 0.18],
        [0.05, 0.91],
    ],
    flags: [
        [true, false],
        [true, false],
        [false, true],
    ],
    participants: [
        { db_id: 1, label: 'P001', loadings: [0.82, 0.08], flagged_factors: [1] },
        { db_id: 2, label: 'P002', loadings: [0.71, 0.18], flagged_factors: [1] },
        { db_id: 3, label: 'P003', loadings: [0.05, 0.91], flagged_factors: [2] },
    ],
    statement_scores: [
        {
            statement_id: 1,
            code: 'S1',
            text: 'Statement one',
            z_scores: [1.2, -0.5],
            factor_arrays: [1, -1],
        },
        {
            statement_id: 2,
            code: 'S2',
            text: 'Statement two',
            z_scores: [0.3, 0.8],
            factor_arrays: [0, 1],
        },
        {
            statement_id: 3,
            code: 'S3',
            text: 'Statement three',
            z_scores: [-0.8, 1.1],
            factor_arrays: [-1, 1],
        },
        {
            statement_id: 4,
            code: 'S4',
            text: 'Statement four',
            z_scores: [0.1, -0.3],
            factor_arrays: [0, 0],
        },
    ],
    distinguishing: [
        {
            statement_id: 1,
            code: 'S1',
            text: 'Statement one',
            z_scores: [1.2, -0.5],
            factor_arrays: [1, -1],
            significance: { '1-2': 'p<0.05' },
        },
    ],
    consensus: [
        {
            statement_id: 4,
            code: 'S4',
            text: 'Statement four',
            z_scores: [0.1, -0.3],
            factor_arrays: [0, 0],
            significance: {},
        },
    ],
    factor_characteristics: [
        {
            factor: 1,
            eigenvalue: 2.5,
            variance_explained: 41.7,
            cumulative_variance: 41.7,
            n_flagged: 2,
            avg_rel_coef: 0.8,
            composite_reliability: 0.889,
            se_factor_scores: 0.333,
        },
        {
            factor: 2,
            eigenvalue: 1.2,
            variance_explained: 20.0,
            cumulative_variance: 61.7,
            n_flagged: 1,
            avg_rel_coef: 0.8,
            composite_reliability: 0.8,
            se_factor_scores: 0.447,
        },
    ],
    correlation_matrix: [
        [1.0, 0.05],
        [0.05, 1.0],
    ],
};

async function loadWorkbook(blob: Blob): Promise<Workbook> {
    const workbook = new Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    return workbook;
}

function getWorksheet(workbook: Workbook, name: string): Worksheet {
    const worksheet = workbook.getWorksheet(name);
    if (!worksheet) throw new Error(`Missing worksheet: ${name}`);
    return worksheet;
}

function worksheetRows(worksheet: Worksheet): unknown[][] {
    const rows: unknown[][] = [];
    worksheet.eachRow((row) => {
        rows.push((row.values as unknown[]).slice(1));
    });
    return rows;
}

describe('generateAnalysisXlsx', () => {
    it('does not depend on SheetJS xlsx at runtime', () => {
        const packageJson = JSON.parse(
            readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
        );
        const implementation = readFileSync(resolve(__dirname, 'analysisXlsxExport.ts'), 'utf8');

        expect(packageJson.dependencies).not.toHaveProperty('xlsx');
        expect(implementation).not.toContain("from 'xlsx'");
        expect(implementation).not.toContain("import('xlsx')");
    });

    it('generates a valid XLSX blob with correct MIME type', async () => {
        const blob = await generateAnalysisXlsx(mockResult);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(blob.size).toBeGreaterThan(0);
    });

    it('produces a workbook with 7 sheets', async () => {
        const blob = await generateAnalysisXlsx(mockResult);
        const workbook = await loadWorkbook(blob);

        expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
            'Overview',
            'Factor Loadings',
            'Statement Scores',
            'Distinguishing',
            'Consensus',
            'Factor Characteristics',
            'Correlation Matrix',
        ]);
    });

    it('has correct row counts per sheet', async () => {
        const blob = await generateAnalysisXlsx(mockResult);
        const workbook = await loadWorkbook(blob);
        const rowCount = (name: string) => getWorksheet(workbook, name).actualRowCount;

        // Overview: 6 metadata rows + 2 eigenvalue rows (no header)
        expect(rowCount('Overview')).toBe(8);
        // Factor Loadings: 1 header + 3 participants = 4
        expect(rowCount('Factor Loadings')).toBe(4);
        // Statement Scores: 1 header + 4 statements = 5
        expect(rowCount('Statement Scores')).toBe(5);
        // Distinguishing: 1 header + 1 statement = 2
        expect(rowCount('Distinguishing')).toBe(2);
        // Consensus: 1 header + 1 statement = 2
        expect(rowCount('Consensus')).toBe(2);
        // Factor Characteristics: 1 header + 7 metric rows = 8
        expect(rowCount('Factor Characteristics')).toBe(8);
        // Correlation Matrix: 1 header + 2 factor rows = 3
        expect(rowCount('Correlation Matrix')).toBe(3);
    });

    it('contains correct overview metadata', async () => {
        const blob = await generateAnalysisXlsx(mockResult);
        const workbook = await loadWorkbook(blob);
        const data = worksheetRows(getWorksheet(workbook, 'Overview'));

        expect(data[0]).toEqual(['Extraction', 'PCA']);
        expect(data[1]).toEqual(['Rotation', 'Varimax']);
        expect(data[2]).toEqual(['N Participants', 3]);
        expect(data[4]).toEqual(['N Factors', 2]);
        // Eigenvalues as individual rows
        expect(data[6]).toEqual(['Eigenvalue 1', 2.5]);
        expect(data[7]).toEqual(['Eigenvalue 2', 1.2]);
    });

    it('contains participant loadings with flagging info', async () => {
        const blob = await generateAnalysisXlsx(mockResult);
        const workbook = await loadWorkbook(blob);
        const data = worksheetRows(getWorksheet(workbook, 'Factor Loadings'));

        // Header
        expect(data[0]).toEqual(['Participant', 'F1', 'F2', 'Flagged']);
        // First participant
        expect(data[1][0]).toBe('P001');
        expect(data[1][3]).toBe('F1');
    });

    it('applies number formats to cells', async () => {
        const blob = await generateAnalysisXlsx(mockResult);
        const workbook = await loadWorkbook(blob);

        // Factor Loadings: loading cells should have 4-decimal format
        const loadingsSheet = getWorksheet(workbook, 'Factor Loadings');
        expect(loadingsSheet.getCell('B2').numFmt).toBe('0.0000');

        // Factor Characteristics: eigenvalue row should have 3-decimal format
        const charSheet = getWorksheet(workbook, 'Factor Characteristics');
        expect(charSheet.getCell('B2').numFmt).toBe('0.000'); // Eigenvalue row

        // Correlation Matrix: correlations should have 3-decimal format
        const corrSheet = getWorksheet(workbook, 'Correlation Matrix');
        expect(corrSheet.getCell('B2').numFmt).toBe('0.000');
    });

    it('includes factor narratives only when at least one narrative is non-empty', async () => {
        const blob = await generateAnalysisXlsx(mockResult, {
            '1': 'Factor one narrative',
            '2': '   ',
        });
        const workbook = await loadWorkbook(blob);
        const narratives = getWorksheet(workbook, 'Factor Narratives');
        const rows = worksheetRows(narratives);

        expect(rows).toEqual([
            ['Factor', 'Narrative'],
            ['F1', 'Factor one narrative'],
        ]);
        expect(narratives.getColumn(2).width).toBe(80);
    });
});
