// orval 8 looks for orval.config.{ts,js,mjs,mts} only; the .cjs form the
// v7 config used is no longer discovered, hence ESM here.
export default {
    openQ: {
        input: {
            target: './openapi.json',
        },
        output: {
            mode: 'single',
            target: 'src/api/generated.ts',
            schemas: 'src/api/model',
            client: 'react-query',
            // v8 defaults httpClient to 'fetch', which calls the mutator as
            // customInstance(url, requestInit). Our mutator takes the v7
            // (axios-shaped) single object {url, method, params, data, …};
            // pin the shape rather than rewrite the mutator and its tests.
            httpClient: 'axios',
            mock: {
                // v8 writes mocks to a separate generated.msw.ts by default.
                // Keep them inline: test-utils/handlers.ts imports the MSW
                // handlers from ../api/generated, and biome/knip exclusions
                // name that one file.
                inline: true,
                generators: [{ type: 'msw', delay: false }],
            },
            prettier: false,
            override: {
                mutator: {
                    path: './src/api/mutator.ts',
                    name: 'customInstance',
                },
            },
        },
    },
};
