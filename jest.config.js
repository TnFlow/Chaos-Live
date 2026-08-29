/** @type {import('jest').Config} */
const config = {
  projects: [
    '<rootDir>/packages/shared-protocol',
    '<rootDir>/packages/core',
    '<rootDir>/packages/adapters/tiktok',
    '<rootDir>/packages/adapters/mock',
    '<rootDir>/packages/adapters/minecraft-rcon',
    '<rootDir>/packages/app',
  ],
};

export default config;
