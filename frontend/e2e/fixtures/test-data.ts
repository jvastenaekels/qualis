/**
 * Test Data Builders
 * Factory functions for creating test data with sensible defaults
 */

export const testDataBuilders = {
    /**
     * Create a study configuration
     */
    study: (overrides?: Partial<StudyData>): StudyData => ({
        slug: `test-study-${Date.now()}`,
        title: 'Test Study',
        state: 'draft',
        workspace_id: 1,
        default_language: 'en',
        show_statement_codes: false,
        randomize_statements: false,
        translations: [
            {
                language_code: 'en',
                title: 'Test Study',
                description: 'A test study for E2E testing',
                instructions: 'Follow the instructions carefully',
                objective: 'Test study objective',
                condition_of_instruction: 'What is your stance on this statement?',
            },
        ],
        statements: testDataBuilders.statements(23),
        grid_config: [
            { score: -3, capacity: 2 },
            { score: -2, capacity: 3 },
            { score: -1, capacity: 4 },
            { score: 0, capacity: 5 },
            { score: 1, capacity: 4 },
            { score: 2, capacity: 3 },
            { score: 3, capacity: 2 },
        ],
        presort_config: { enabled: false, fields: {} },
        postsort_config: {
            email_collection_enabled: false,
            interview_consent_enabled: false,
            newsletter_consent_enabled: false,
            questions: {},
        },
        ...overrides,
    }),

    /**
     * Create a statement
     */
    statement: (code: string, text: string, overrides?: Partial<StatementData>): StatementData => ({
        code,
        translations: [
            {
                language_code: 'en',
                text,
            },
        ],
        ...overrides,
    }),

    /**
     * Create multiple statements
     */
    statements: (count: number, prefix: string = 'S'): StatementData[] => {
        return Array.from({ length: count }, (_, i) =>
            testDataBuilders.statement(
                `${prefix}${i + 1}`,
                `Statement ${i + 1}: Test statement text`
            )
        );
    },

    /**
     * Create a presort field configuration
     */
    presortField: (
        type: PresortFieldType,
        label: string,
        overrides?: Partial<PresortField>
    ): PresortField => {
        const base: PresortField = {
            type,
            label,
            required: false,
            ...overrides,
        };

        // Add type-specific defaults
        switch (type) {
            case 'select':
            case 'radio':
                return {
                    ...base,
                    options: overrides?.options || ['Option 1', 'Option 2', 'Option 3'],
                };
            case 'checkbox':
                return {
                    ...base,
                    options: overrides?.options || ['Choice 1', 'Choice 2'],
                };
            case 'number':
                return {
                    ...base,
                    min: overrides?.min ?? 0,
                    max: overrides?.max ?? 100,
                };
            case 'text':
            case 'email':
                return {
                    ...base,
                    minLength: overrides?.minLength,
                    maxLength: overrides?.maxLength ?? 200,
                };
            case 'textarea':
                return {
                    ...base,
                    rows: overrides?.rows ?? 4,
                    maxLength: overrides?.maxLength ?? 500,
                };
            default:
                return base;
        }
    },

    /**
     * Create presort configuration with multiple fields
     */
    presortConfig: (fields: Record<string, PresortField>): PresortConfig => ({
        enabled: true,
        fields,
    }),

    /**
     * Create a postsort question
     */
    postsortQuestion: (
        type: PresortFieldType,
        label: string,
        overrides?: Partial<PresortField>
    ): PresortField => {
        // Same structure as presort fields
        return testDataBuilders.presortField(type, label, overrides);
    },

    /**
     * Create grid configuration
     */
    gridConfig: (distribution: GridDistribution): GridColumn[] => {
        const configs: Record<GridDistribution, GridColumn[]> = {
            symmetric: [
                { score: -3, capacity: 2 },
                { score: -2, capacity: 3 },
                { score: -1, capacity: 4 },
                { score: 0, capacity: 5 },
                { score: 1, capacity: 4 },
                { score: 2, capacity: 3 },
                { score: 3, capacity: 2 },
            ],
            asymmetric: [
                { score: -3, capacity: 1 },
                { score: -2, capacity: 2 },
                { score: -1, capacity: 3 },
                { score: 0, capacity: 6 },
                { score: 1, capacity: 4 },
                { score: 2, capacity: 3 },
                { score: 3, capacity: 2 },
            ],
            minimal: [
                { score: -2, capacity: 2 },
                { score: -1, capacity: 3 },
                { score: 0, capacity: 4 },
                { score: 1, capacity: 3 },
                { score: 2, capacity: 2 },
            ],
        };

        return configs[distribution] || configs.symmetric;
    },

    /**
     * Create branding configuration
     */
    branding: (overrides?: Partial<BrandingConfig>): BrandingConfig => ({
        logo_url: null,
        accent_color: '#6366f1',
        partners: [],
        ...overrides,
    }),

    /**
     * Create partner logo
     */
    partnerLogo: (name: string, overrides?: Partial<PartnerLogo>): PartnerLogo => ({
        id: `partner-${Date.now()}`,
        name,
        logo_url: `https://example.com/logos/${name.toLowerCase().replace(/\s+/g, '-')}.png`,
        url: `https://${name.toLowerCase().replace(/\s+/g, '')}.com`,
        ...overrides,
    }),
};

// Type definitions
export type PresortFieldType =
    | 'text'
    | 'email'
    | 'number'
    | 'select'
    | 'checkbox'
    | 'radio'
    | 'date'
    | 'textarea';

export type GridDistribution = 'symmetric' | 'asymmetric' | 'minimal';

export interface StudyData {
    slug: string;
    title: string;
    state: string;
    workspace_id: number;
    default_language: string;
    show_statement_codes: boolean;
    randomize_statements: boolean;
    translations: Array<{
        language_code: string;
        title: string;
        description?: string;
        instructions?: string;
        objective?: string;
        condition_of_instruction?: string;
    }>;
    statements: StatementData[];
    grid_config: GridColumn[];
    presort_config: PresortConfig;
    postsort_config: PostsortConfig;
    branding?: BrandingConfig;
}

export interface StatementData {
    code: string;
    translations: Array<{
        language_code: string;
        text: string;
    }>;
}

export interface GridColumn {
    score: number;
    capacity: number;
}

export interface PresortField {
    type: PresortFieldType;
    label: string;
    required?: boolean;
    options?: string[];
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    rows?: number;
    placeholder?: string;
}

export interface PresortConfig {
    enabled: boolean;
    fields: Record<string, PresortField>;
}

export interface PostsortConfig {
    email_collection_enabled?: boolean;
    interview_consent_enabled?: boolean;
    newsletter_consent_enabled?: boolean;
    questions?: Record<string, PresortField>;
}

export interface BrandingConfig {
    logo_url: string | null;
    accent_color: string;
    partners: PartnerLogo[];
}

export interface PartnerLogo {
    id: string;
    name: string;
    logo_url: string;
    url?: string;
}
