module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@/lib/Db/(.*)$": "<rootDir>/../../packages/db/$1",
    "^@/(.*)$": "<rootDir>/$1",
    "^@semantask/types$": "<rootDir>/../../packages/types/dist/index.js",
    "^@semantask/types/(.*)$": "<rootDir>/../../packages/types/$1",
    "^@semantask/services/(.*)$": "<rootDir>/../../packages/services/$1",
  },
  clearMocks: true,
};
