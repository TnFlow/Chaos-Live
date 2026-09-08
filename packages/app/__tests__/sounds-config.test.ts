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
  getSound,
  deleteSound,
  renameSound,
  setSoundVolume,
  replaceSound,
  remapEventSounds,
  soundUsage,
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

/**
 * Mantener la biblioteca al dia: renombrar, ajustar el volumen y cambiar el
 * audio sin perder donde sonaba. Es lo que hace falta cuando los sonidos se
 * cambian cada pocos dias para seguir las tendencias.
 */
describe('Gestion de la biblioteca de sonidos', () => {
  beforeEach(() => {
    fs.rmSync(getSoundsDir(), { recursive: true, force: true });
  });

  it('un sonido recien subido suena al volumen general', () => {
    expect(saveSound('nuevo.wav', wavDePrueba()).volume).toBe(1);
  });

  it('renombra sin tocar el archivo, para no romper las asignaciones', () => {
    const sonido = saveSound('sin-nombre.wav', wavDePrueba());

    const renombrado = renameSound(sonido.id, '  Trend de septiembre  ');

    expect(renombrado?.name).toBe('Trend de septiembre');
    expect(renombrado?.url).toBe(sonido.url);
    expect(renombrado?.id).toBe(sonido.id);
    expect(listSounds()[0]?.name).toBe('Trend de septiembre');
  });

  it('no deja dejar el nombre en blanco', () => {
    const sonido = saveSound('algo.wav', wavDePrueba());

    expect(() => renameSound(sonido.id, '   ')).toThrow(SoundValidationError);
  });

  it('guarda el volumen y lo deja dentro de rango', () => {
    const sonido = saveSound('fuerte.wav', wavDePrueba());

    expect(setSoundVolume(sonido.id, 0.3)?.volume).toBe(0.3);
    expect(setSoundVolume(sonido.id, 7)?.volume).toBe(1);
    expect(setSoundVolume(sonido.id, -2)?.volume).toBe(0);
  });

  it('renombrar o ajustar algo que ya no esta devuelve undefined', () => {
    expect(renameSound('fantasma.wav', 'X')).toBeUndefined();
    expect(setSoundVolume('fantasma.wav', 0.5)).toBeUndefined();
    expect(getSound('fantasma.wav')).toBeUndefined();
  });

  it('al reemplazar conserva nombre y volumen, y estrena identificador', () => {
    const sonido = saveSound('viejo.wav', wavDePrueba(32));
    renameSound(sonido.id, 'El de siempre');
    setSoundVolume(sonido.id, 0.4);

    const resultado = replaceSound(sonido.id, `data:audio/mpeg;base64,${Buffer.alloc(99, 3).toString('base64')}`);

    expect(resultado).toBeDefined();
    expect(resultado!.oldUrl).toBe(sonido.url);
    expect(resultado!.sound.name).toBe('El de siempre');
    expect(resultado!.sound.volume).toBe(0.4);
    expect(resultado!.sound.sizeBytes).toBe(99);
    // Extension nueva, y sobre todo URL nueva: reutilizarla haria que el
    // navegador de OBS siguiera sirviendo el audio anterior desde su cache.
    expect(resultado!.sound.id).toMatch(/\.mp3$/);
    expect(resultado!.sound.url).not.toBe(sonido.url);
    // Y el anterior desaparece: si no, la carpeta acumularia una copia por cambio.
    expect(listSounds().map((s) => s.id)).toEqual([resultado!.sound.id]);
  });

  it('un reemplazo invalido no destruye el sonido que ya funcionaba', () => {
    const sonido = saveSound('valioso.wav', wavDePrueba());

    expect(() => replaceSound(sonido.id, 'data:text/plain;base64,aG9sYQ==')).toThrow(
      SoundValidationError,
    );
    expect(getSound(sonido.id)).toBeDefined();
  });

  it('reemplazar algo que ya no esta devuelve undefined', () => {
    expect(replaceSound('fantasma.wav', wavDePrueba())).toBeUndefined();
  });

  it('un archivo sin entrada en el indice se sigue listando como antes', () => {
    // El streamer puede haber copiado un mp3 a mano en la carpeta, o venir de
    // una version anterior a que existiera el indice.
    fs.mkdirSync(getSoundsDir(), { recursive: true });
    fs.writeFileSync(path.join(getSoundsDir(), 'suelto-abc123.mp3'), Buffer.alloc(10));

    const [sonido] = listSounds();
    expect(sonido?.name).toBe('suelto.mp3');
    expect(sonido?.volume).toBe(1);
  });

  it('un indice corrupto no impide listar los sonidos', () => {
    saveSound('bueno.wav', wavDePrueba());
    fs.writeFileSync(path.join(getSoundsDir(), 'sonidos.json'), '{{{ esto no es JSON');

    expect(listSounds()).toHaveLength(1);
  });

  it('el indice no se cuela en la lista de sonidos', () => {
    saveSound('uno.wav', wavDePrueba());

    expect(listSounds().map((s) => s.id)).not.toContain('sonidos.json');
  });
});

describe('Asignaciones de sonidos', () => {
  it('reapunta los momentos que usaban el sonido viejo', () => {
    const migrado = remapEventSounds(
      { gift: '/sounds/viejo.mp3', like: 'heart-pop', goal: '/sounds/viejo.mp3' },
      '/sounds/viejo.mp3',
      '/sounds/nuevo.mp3',
    );

    expect(migrado).toEqual({
      gift: '/sounds/nuevo.mp3',
      like: 'heart-pop',
      goal: '/sounds/nuevo.mp3',
    });
  });

  it('al borrar, los momentos quedan en silencio a proposito', () => {
    expect(remapEventSounds({ gift: '/sounds/x.mp3' }, '/sounds/x.mp3', 'none')).toEqual({
      gift: 'none',
    });
  });

  // Devolver undefined evita reescribir los ajustes y avisar al overlay por nada.
  it('no devuelve nada si no habia nada que cambiar', () => {
    expect(remapEventSounds({ gift: 'chime-diamond' }, '/sounds/x.mp3', 'none')).toBeUndefined();
    expect(remapEventSounds(undefined, '/sounds/x.mp3', 'none')).toBeUndefined();
  });

  it('dice donde se usa cada sonido, por momento y por regla', () => {
    const usos = soundUsage({ gift: '/sounds/a.mp3', goal: '/sounds/a.mp3', like: 'none' }, [
      { name: 'Gift: Rose', viewerFeedback: { soundEffect: '/sounds/a.mp3' } },
      { name: 'Gift: Lion', viewerFeedback: { soundEffect: 'monster-roar' } },
      { name: 'Sin sonido' },
    ]);

    expect(usos['/sounds/a.mp3']).toEqual(['event:gift', 'event:goal', 'rule:Gift: Rose']);
    expect(usos['none']).toBeUndefined();
  });
});
