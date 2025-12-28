import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
    {
        ignores: [
            'dist',
            'coverage',
            'test-results',
            'playwright-report',
            '*.config.js',
            '*.config.ts',
        ],
    },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
            security,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            ...security.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'security/detect-object-injection': 'off', // Too many false positives in modern JS
        },
    },
    {
        files: ['**/*.test.tsx', '**/*.test.ts', '**/tests/**', 'src/test/**'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    }
);
