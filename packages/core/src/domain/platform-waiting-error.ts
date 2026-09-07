/**
 * Error que significa "todavía no hay directo al que conectarse".
 *
 * No es una avería: es el estado normal mientras el streamer prepara la escena,
 * y puede durar horas. Existe como tipo propio para que el motor lo distinga de
 * un fallo real sin tener que reconocer los mensajes de cada plataforma, que es
 * cosa de cada adapter.
 */
export class PlatformWaitingError extends Error {
  /**
   * Marca comprobable sin `instanceof`.
   *
   * El adapter y el motor viven en paquetes distintos, así que un `instanceof`
   * depende de que ambos hayan resuelto la misma copia del módulo. Esta
   * propiedad sobrevive a eso y al empaquetado con esbuild.
   */
  public readonly isPlatformWaiting = true;

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PlatformWaitingError';
  }
}

/** Si este error solo significa que el directo no ha empezado. */
export function isPlatformWaitingError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { isPlatformWaiting?: unknown }).isPlatformWaiting === true
  );
}
