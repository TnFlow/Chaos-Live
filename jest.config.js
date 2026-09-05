/** @type {import('jest').Config} */
const config = {
  // La plantilla de base de datos se construye una vez para toda la tanda;
  // cada worker se hace su copia en jest.setup.js.
  globalSetup: '<rootDir>/jest.global-setup.js',
  projects: [
    '<rootDir>/packages/shared-protocol',
    '<rootDir>/packages/core',
    '<rootDir>/packages/adapters/tiktok',
    '<rootDir>/packages/adapters/twitch',
    '<rootDir>/packages/adapters/mock',
    '<rootDir>/packages/adapters/minecraft-rcon',
    '<rootDir>/packages/app',
  ],
};

export default config;
