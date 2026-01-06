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
            mock: false,
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
