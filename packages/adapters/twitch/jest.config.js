/** @type {import('jest').Config} */
const config = {
  displayName: 'adapter-twitch',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@chaos-live/shared-protocol$': '<rootDir>/../../shared-protocol/src/index.ts',
    '^@chaos-live/core$': '<rootDir>/../../core/src/index.ts',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
};

export default config;
