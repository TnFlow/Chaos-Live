/**
 * Cliente WebSocket con reconexión automática.
 *
 * El panel y el overlay tenían cada uno su propia copia de esta lógica, con
 * comportamientos distintos: el overlay reintentaba cada 3 segundos y el panel
 * no reintentaba en absoluto, así que si el servidor se reiniciaba a mitad del
 * directo el panel se quedaba mudo sin avisar.
 */

export interface ChaosPacket {
  type: string;
  payload?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export interface ChaosSocketOptions {
  /** Cómo se identifica el cliente ante el servidor. */
  clientType?: 'overlay' | 'mod';
  onPacket: (packet: ChaosPacket) => void;
  /** Se invoca cuando cambia el estado de la conexión. */
  onConnectionChange?: (connected: boolean) => void;
  /** Espera base entre reintentos, en milisegundos. */
  reconnectDelayMs?: number;
  /** Espera máxima entre reintentos, en milisegundos. */
  maxReconnectDelayMs?: number;
}

export interface ChaosSocket {
  /** Cierra la conexión y detiene los reintentos. */
  close(): void;
  isConnected(): boolean;
}

/**
 * Abre la conexión y la mantiene viva mientras la página esté abierta.
 * La espera entre reintentos crece progresivamente para no martillear un
 * servidor que aún está arrancando, pero se mantiene corta al principio para
 * recuperarse rápido de un reinicio.
 */
export function connectChaosSocket(options: ChaosSocketOptions): ChaosSocket {
  const {
    clientType = 'overlay',
    onPacket,
    onConnectionChange,
    reconnectDelayMs = 1000,
    maxReconnectDelayMs = 10000,
  } = options;

  let socket: WebSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let closedByUs = false;
  let connected = false;

  function setConnected(next: boolean): void {
    if (connected === next) return;
    connected = next;
    onConnectionChange?.(next);
  }

  function scheduleReconnect(): void {
    if (closedByUs) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);

    const delay = Math.min(reconnectDelayMs * Math.pow(1.6, attempts), maxReconnectDelayMs);
    attempts++;
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect(): void {
    if (closedByUs) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/?clientType=${clientType}`;

    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempts = 0;
      setConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data) as ChaosPacket;
        if (packet && packet.type) {
          onPacket(packet);
        }
      } catch {
        // Un paquete ilegible no debe tumbar la conexión.
      }
    };

    socket.onclose = () => {
      setConnected(false);
      scheduleReconnect();
    };

    socket.onerror = () => {
      // `onclose` llega justo después y es quien programa el reintento.
      setConnected(false);
    };
  }

  connect();

  return {
    close() {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      setConnected(false);
    },
    isConnected: () => connected,
  };
}
