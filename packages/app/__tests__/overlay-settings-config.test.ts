import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_OVERLAY_SETTINGS } from '@chaos-live/shared-protocol';
import {
  getOverlaySettingsPath,
  loadOverlaySettings,
  saveOverlaySettings,
} from '../src/config/overlay-settings.js';

describe('Persistencia de los ajustes del overlay', () => {
  let sandbox: string;
  const realCwd = process.cwd;

  // Se sustituye `process.cwd` en vez de usar `process.chdir`: cambiar el
  // directorio real afecta al resto de suites que comparten el worker de Jest
  // y dejaba el proceso sin cerrarse limpiamente.
  const pretendCwdIs = (dir: string): void => {
    process.cwd = () => dir;
  };

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-live-overlay-'));
  });

  afterEach(() => {
    process.cwd = realCwd;
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('guarda junto a las reglas en la distribucion portable, que solo tiene config/', () => {
    // Reproduce el layout del ZIP de Windows: existe `config/`, no `packages/app/config/`.
    fs.mkdirSync(path.join(sandbox, 'config'));
    pretendCwdIs(sandbox);

    const resolved = getOverlaySettingsPath();

    expect(resolved).toBe(path.resolve(sandbox, 'config/overlay-settings.json'));
    expect(resolved).not.toContain(`packages${path.sep}app`);
  });

  it('usa packages/app/config cuando se ejecuta dentro del monorepo', () => {
    fs.mkdirSync(path.join(sandbox, 'packages', 'app', 'config'), { recursive: true });
    fs.mkdirSync(path.join(sandbox, 'config'));
    pretendCwdIs(sandbox);

    expect(getOverlaySettingsPath()).toBe(
      path.resolve(sandbox, 'packages/app/config/overlay-settings.json'),
    );
  });

  it('sobrevive a un reinicio: lo guardado se vuelve a leer', () => {
    const target = path.join(sandbox, 'overlay-settings.json');

    saveOverlaySettings({ ...DEFAULT_OVERLAY_SETTINGS, masterVolume: 0.42 }, target);

    expect(loadOverlaySettings(target).masterVolume).toBe(0.42);
  });

  it('devuelve los valores por defecto si el fichero esta corrupto, sin lanzar', () => {
    const target = path.join(sandbox, 'corrupto.json');
    fs.writeFileSync(target, '{ esto no es json', 'utf-8');

    expect(loadOverlaySettings(target)).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });
});
