import { accionLegible } from '../src/lib/mc-live-state';

/**
 * Lo que se le enseña a la audiencia cuando una regla se dispara.
 *
 * La prueba que de verdad importa es la última: pase lo que pase, aquí no
 * puede salir un comando. En directo eso era ruido que nadie entendía y que
 * además enseñaba cómo está montado el pipeline por dentro.
 */
describe('accionLegible', () => {
  it('prefiere lo que el streamer escribió para esa regla', () => {
    expect(
      accionLegible('execute at @p run summon tnt ~ ~2 ~ {Fuse:40}', {
        title: '💸 MONEY GUN!',
        description: '¡SuperFan99 hizo volar el suelo!',
      }),
    ).toBe('¡SuperFan99 hizo volar el suelo!');
  });

  it('usa el título cuando no hay descripción', () => {
    expect(accionLegible('summon tnt ~ ~ ~', { title: '💸 MONEY GUN!' })).toBe('💸 MONEY GUN!');
  });

  it('ignora un texto de regla que solo son espacios', () => {
    expect(accionLegible('execute at @p run summon tnt ~ ~2 ~', { title: '   ' })).toBe(
      'Detona TNT Dinamita',
    );
  });

  it('traduce los comandos habituales a una frase', () => {
    const casos: [string, string][] = [
      ['execute at @p run summon tnt ~ ~2 ~ {Fuse:40}', 'Detona TNT Dinamita'],
      ['execute at @p run summon creeper ~ ~ ~ {powered:1b}', 'Invoca Creeper Cargado Jefe'],
      ['execute at @p run summon creeper ~ ~ ~', 'Invoca un Creeper'],
      ['execute at @p run summon lightning_bolt ~ ~ ~', 'Rayo / Tormenta Cósmica'],
      ['summon warden ~ ~ ~ {CustomName:\'"JEFE"\'}', 'Invoca al Jefe Warden'],
      ['effect give @p minecraft:speed 20 2', 'Velocidad al Streamer'],
      ['effect give @p minecraft:blindness 10 1', 'Ceguera al Streamer'],
      ['give @a minecraft:diamond 5', 'Lluvia de Diamantes'],
      ['execute at @p run particle heart ~ ~1 ~ 0.8 0.8 0.8 0.1 25', 'Lluvia de Corazones'],
      ['execute at @p run setblock ~ ~ ~ minecraft:lava[level=7] keep', 'Lava bajo los pies'],
    ];

    for (const [comando, frase] of casos) {
      expect(accionLegible(comando)).toBe(frase);
    }
  });

  // El creeper cargado tiene que ganarle al creeper normal, y la lista se
  // recorre en orden: si alguien la reordena sin querer, esto lo caza.
  it('el patrón más específico gana al genérico', () => {
    expect(accionLegible('summon creeper ~ ~ ~ {powered:1b,CustomName:\'"X"\'}')).toBe(
      'Invoca Creeper Cargado Jefe',
    );
  });

  it('deriva una frase de un comando que no está en la lista', () => {
    expect(accionLegible('execute at @p run summon blaze ~ ~ ~')).toBe('blaze en la partida');
    expect(accionLegible('summon iron_golem ~ ~ ~')).toBe('iron golem en la partida');
  });

  it('sin comando ni texto de regla, dice algo genérico', () => {
    expect(accionLegible(undefined)).toBe('Algo pasa en la partida');
    expect(accionLegible('')).toBe('Algo pasa en la partida');
    expect(accionLegible('   ')).toBe('Algo pasa en la partida');
  });

  /**
   * El menú de recompensas y la marquesina pintan el catálogo de reglas antes
   * de que nadie las dispare, así que su texto llega con los marcadores sin
   * interpolar. En pantalla salía "${user.displayName} sent a Rose!".
   */
  it('descarta el texto de la regla si aún tiene marcadores sin resolver', () => {
    expect(
      accionLegible('execute at @p run summon chicken ~ ~1 ~', {
        description: '${user.displayName} sent a Rose! Clucking chicken appeared!',
      }),
    ).toBe('Invoca Pollo en el Juego');
  });

  it('cae al título si la descripción trae marcadores y el título no', () => {
    expect(
      accionLegible('summon tnt ~ ~ ~', {
        title: '💸 MONEY GUN!',
        description: '¡${user.displayName} lo hizo!',
      }),
    ).toBe('💸 MONEY GUN!');
  });

  it('nunca deja escapar texto técnico', () => {
    // Comandos que la tabla no reconoce y cuya última palabra es un selector,
    // unas coordenadas o NBT: antes se pintaban tal cual en la marquesina.
    const raros = [
      'execute at @p run playsound minecraft:entity.wither.spawn master @a',
      'execute at @p run tp @p ~ ~10 ~',
      'execute at @p run data merge entity @e[limit=1] {NoAI:1b}',
      'title @a times 10 70 20',
    ];

    for (const comando of raros) {
      const texto = accionLegible(comando);
      expect(texto).not.toContain('@');
      expect(texto).not.toContain('~');
      expect(texto).not.toContain('{');
      expect(texto).not.toContain(':');
      expect(texto).not.toContain('execute');
    }
  });
});
