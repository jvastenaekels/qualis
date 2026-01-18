module.exports = {
    openQ: {
        input: {
            target: './openapi.json',
        },
        output: {
            mode: 'single',
            target: 'src/api/generated.ts',
            schemas: 'src/api/model',
            client: 'react-query',
            mock: {
                type: 'msw',
                delay: false,
                output: {
                    target: 'src/api/mocks/handlers.ts',
                    schemas: 'src/api/mocks/model',
                },
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
