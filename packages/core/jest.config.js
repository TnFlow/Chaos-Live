/** @type {import('jest').Config} */
const config = {
  displayName: 'core',
  testEnvironment: 'node',
  // Aisla la base de datos de este worker (ver jest.setup.js en la raiz).
  setupFiles: ['<rootDir>/../../jest.setup.js'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@chaos-live/shared-protocol$': '<rootDir>/../shared-protocol/src/index.ts',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
};

export default config;
