module.exports = {
    testEnvironment: "node",
    testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
    transform: {
        "^.+\\.(ts|tsx)$": [
            "ts-jest",
            {
                tsconfig: {
                    types: ["jest", "node"],
                },
            },
        ],
    },
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
        "^@semantask/types$": "<rootDir>/../types/index.ts",
        "^@semantask/observability/metrics$": "<rootDir>/../observability/metrics.ts",
        "^@semantask/observability$": "<rootDir>/../observability/index.ts",
    },
    clearMocks: true,
};
