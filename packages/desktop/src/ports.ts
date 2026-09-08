import net from 'node:net';

/**
 * Comprobación previa de puertos.
 *
 * Si otro programa ya tiene el puerto, el servidor muere al arrancar con
 * `EADDRINUSE` y reintentarlo diez veces solo consigue diez caídas seguidas y
 * un panel que no carga. Se mira antes, y se dice qué se ha encontrado para
 * poder ofrecer algo que hacer.
 */

export type EstadoPuerto =
  /** Nadie escucha: se puede arrancar. */
  | { estado: 'libre'; puerto: number }
  /** Contesta un Chaos-Live vivo: probablemente ya está abierto. */
  | { estado: 'chaos-live'; puerto: number }
  /** Lo tiene otro programa. */
  | { estado: 'ocupado'; puerto: number };

/** Si hay alguien escuchando en ese puerto de la máquina local. */
function hayAlguienEscuchando(puerto: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resuelto = false;

    const terminar = (respuesta: boolean): void => {
      if (resuelto) return;
      resuelto = true;
      socket.destroy();
      resolve(respuesta);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => terminar(true));
    socket.once('timeout', () => terminar(false));
    socket.once('error', () => terminar(false));
    socket.connect(puerto, '127.0.0.1');
  });
}

/**
 * Si quien contesta ahí es un Chaos-Live sano.
 *
 * Se intenta varias veces a propósito: la primera petición de un proceso recién
 * arrancado tarda lo suyo, y con un solo intento corto se daba por muerto un
 * servidor que estaba perfectamente. El streamer recibía entonces un "el puerto
 * lo usa otro programa" hablando de su propio Chaos-Live.
 */
export async function esChaosLiveVivo(puerto: number, intentos = 3): Promise<boolean> {
  for (let i = 0; i < intentos; i++) {
    try {
      const controlador = new AbortController();
      const reloj = setTimeout(() => controlador.abort(), 2500);
      const res = await fetch(`http://127.0.0.1:${puerto}/api/health`, {
        signal: controlador.signal,
      });
      clearTimeout(reloj);

      if (res.ok) {
        const cuerpo = (await res.json()) as { status?: string };
        if (cuerpo.status === 'ok') return true;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
}

export async function comprobarPuerto(puerto: number): Promise<EstadoPuerto> {
  if (!(await hayAlguienEscuchando(puerto))) return { estado: 'libre', puerto };
  if (await esChaosLiveVivo(puerto)) return { estado: 'chaos-live', puerto };
  return { estado: 'ocupado', puerto };
}

/**
 * Busca una pareja de puertos consecutivos libres a partir de uno dado.
 *
 * Es lo que se le ofrece al streamer cuando los suyos están cogidos, en vez de
 * mandarle a editar el `.env` a mano y adivinar dos números.
 */
export async function buscarParejaLibre(desde: number, intentos = 40): Promise<[number, number] | undefined> {
  for (let base = desde; base < desde + intentos * 2; base += 2) {
    if (base + 1 > 65535) return undefined;
    const [uno, dos] = await Promise.all([comprobarPuerto(base), comprobarPuerto(base + 1)]);
    if (uno.estado === 'libre' && dos.estado === 'libre') return [base, base + 1];
  }
  return undefined;
}

/** Espera a que el servidor conteste. `false` si se acabó la paciencia. */
export async function esperarASalud(puerto: number, timeoutMs = 45_000): Promise<boolean> {
  const limite = Date.now() + timeoutMs;

  while (Date.now() < limite) {
    if (await esChaosLiveVivo(puerto, 1)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
