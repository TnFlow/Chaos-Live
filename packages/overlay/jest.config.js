/**
 * Proyecto de pruebas del overlay.
 *
 * Cubre solo los módulos de `src/lib`, que son TypeScript plano sin Svelte: son
 * los que deciden qué texto acaba en pantalla, y hasta ahora no tenían dónde
 * probarse. Los componentes `.svelte` se siguen verificando mirándolos
 * renderizados (skill `overlay-preview`), que es lo único que demuestra que un
 * overlay se ve.
 */
/** @type {import('jest').Config} */
const config = {
  displayName: 'overlay',
  testEnvironment: 'node',
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
