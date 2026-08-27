import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '@/api/model';
import { generateLoadingsCsv, generateScoresCsv } from './analysisCsvExport';

const result: AnalysisResult = {
    n_participants: 1,
    n_statements: 1,
    n_factors: 2,
    extraction: 'pca',
    rotation: 'varimax',
    eigenvalues: [1.5, 0.8],
    total_variance_explained: 62.5,
    loadings: [[0.12345, -0.5]],
    rotated_loadings: [[0.12345, -0.5]],
    flags: [[true, false]],
    participants: [
        {
            db_id: 1,
            label: 'P001, pilot',
            loadings: [0.12345, -0.5],
            flagged_factors: [1, 2],
        },
    ],
    statement_scores: [
        {
            statement_id: 1,
            code: 'S1,quoted',
            text: 'Line one,\n"line two"',
            z_scores: [1.234, null],
            factor_arrays: [4, -4],
        },
    ],
    distinguishing: [
        { statement_id: 1, code: 'S1,quoted', text: '', z_scores: [], factor_arrays: [] },
    ],
    consensus: [],
    factor_characteristics: [],
    correlation_matrix: [
        [1, 0],
        [0, 1],
    ],
};

describe('analysis CSV exports', () => {
    it('escapes factor loadings fields that contain commas', () => {
        const csv = generateLoadingsCsv(result);

        expect(csv.split('\n')[1]).toBe('"P001, pilot",0.1235,-0.5000,F1;F2');
    });

    it('escapes statement score fields that contain commas, quotes, or newlines', () => {
        const csv = generateScoresCsv(result);

        expect(csv).toContain('"S1,quoted","Line one,\n""line two""",1.23,,4,-4,D');
    });
});
