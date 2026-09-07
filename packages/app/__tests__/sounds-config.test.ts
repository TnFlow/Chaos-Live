import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-sonidos-'));
const cwdOriginal = process.cwd();

// El modulo resuelve la carpeta contra el directorio de trabajo, igual que el
// resto de la configuracion, asi que la prueba se muda a uno propio.
process.chdir(tmp);
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'config', 'overlay-settings.json'), '{}');

const {
  saveSound,
  listSounds,
  deleteSound,
  resolveSoundFile,
  soundContentType,
  getSoundsDir,
  SoundValidationError,
  MAX_BYTES_SONIDO,
} = await import('../src/config/sounds.js');

/** Un WAV diminuto pero valido, en data URL. */
function wavDePrueba(bytes = 64): string {
  return `data:audio/wav;base64,${Buffer.alloc(bytes, 7).toString('base64')}`;
}

afterAll(() => {
  process.chdir(cwdOriginal);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Sonidos personalizados', () => {
  beforeEach(() => {
    fs.rmSync(getSoundsDir(), { recursive: true, force: true });
  });

  it('guarda el archivo y lo deja listo para servir', () => {
    const sonido = saveSound('mi aviso.wav', wavDePrueba());

    expect(sonido.url).toBe(`/sounds/${sonido.id}`);
    expect(sonido.sizeBytes).toBe(64);
    expect(fs.existsSync(path.join(getSoundsDir(), sonido.id))).toBe(true);
    expect(listSounds().map((s) => s.id)).toContain(sonido.id);
  });

  /**
   * El nombre acaba en una URL y en una ruta de disco, asi que lo que escriba
   * el streamer no puede llevar barras, acentos ni `..`.
   */
  it('limpia el nombre que venga del panel', () => {
    const sonido = saveSound('../../Canción Épica!.wav', wavDePrueba());

    expect(sonido.id).toMatch(/^[a-z0-9._-]+\.wav$/);
  });

  it('no deja salir de la carpeta al pedir un archivo', () => {
    saveSound('bueno.wav', wavDePrueba());

    expect(resolveSoundFile('../overlay-settings.json')).toBeUndefined();
    expect(resolveSoundFile('sub/dir.wav')).toBeUndefined();
    expect(resolveSoundFile('no-existe.wav')).toBeUndefined();
  });

  it('rechaza un formato que el navegador no sabe reproducir', () => {
    expect(() => saveSound('malo.txt', 'data:text/plain;base64,aG9sYQ==')).toThrow(
      SoundValidationError,
    );
  });

  it('rechaza un archivo mas grande que el tope, diciendo el tope', () => {
    const gordo = `data:audio/wav;base64,${Buffer.alloc(MAX_BYTES_SONIDO + 1, 1).toString('base64')}`;

    expect(() => saveSound('gordo.wav', gordo)).toThrow(/MB/);
  });

  it('rechaza algo que no es una data URL', () => {
    expect(() => saveSound('x.wav', 'https://ejemplo.com/x.wav')).toThrow(SoundValidationError);
  });

  it('borra y deja de listarlo', () => {
    const sonido = saveSound('efimero.wav', wavDePrueba());

    expect(deleteSound(sonido.id)).toBe(true);
    expect(listSounds()).toHaveLength(0);
    expect(deleteSound(sonido.id)).toBe(false);
  });

  it('sirve cada formato con su tipo', () => {
    expect(soundContentType('x.mp3')).toBe('audio/mpeg');
    expect(soundContentType('x.wav')).toBe('audio/wav');
    expect(soundContentType('x.ogg')).toBe('audio/ogg');
  });
});
