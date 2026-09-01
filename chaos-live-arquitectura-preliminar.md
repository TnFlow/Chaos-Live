# Chaos-Live — Diseño Preliminar de Arquitectura

**Documento para:** agente de desarrollo
**Propósito:** definir el diseño técnico inicial y los estándares de ingeniería para construir Chaos-Live, un middleware modular que transforma interacciones de audiencia en TikTok LIVE en eventos ejecutables dentro de Minecraft Java Edition.

---

## 1. Resumen del proyecto

Chaos-Live es un middleware de eventos en tiempo real. Recibe interacciones de audiencia desde una plataforma de streaming (TikTok LIVE en la v1), las normaliza, las prioriza en una cola, evalúa metas acumuladas, y despacha acciones ejecutables hacia un videojuego (Minecraft Java Edition en la v1), mientras renderiza overlays visuales para OBS.

**Principio de diseño rector:** cada plataforma de streaming y cada juego soportado debe ser un adaptador intercambiable detrás de una interfaz estable. El núcleo del sistema no debe conocer detalles de TikTok ni de Minecraft directamente.

---

## 2. Arquitectura general (pipeline de 5 etapas)

```
[Adaptador de Plataforma] → [Bus de Eventos / Normalizador]
   → [Motor de Colas y Prioridades] → [Motor de Metas/Reglas]
   → [Dispatcher de Acciones] → [Adaptador de Juego] + [Overlay]
```

Cada corchete es un módulo independiente, testeable de forma aislada, con una interfaz de entrada/salida explícita (contratos, no implementaciones concretas).

---

## 3. Stack tecnológico propuesto

| Capa | Tecnología | Justificación |
|---|---|---|
| Núcleo / orquestación | Node.js + TypeScript | Ecosistema maduro de tiempo real (WebSockets, async I/O) y mejor soporte para librerías de TikTok LIVE |
| Ingesta TikTok | `tiktok-live-connector` (npm) | Librería no oficial de facto para eventos de Webcast (gifts, likes, follows, comentarios, shares) |
| Colas / prioridad | BullMQ sobre Redis | Colas con prioridad, rate limiting, reintentos y backoff nativos |
| Persistencia | SQLite + Prisma o Drizzle ORM | Simplicidad de despliegue para instancia única (streamer individual) |
| Puente a Minecraft (MVP) | RCON | Protocolo nativo de Minecraft Java, sin necesidad de mods, rápido de implementar |
| Puente a Minecraft (fase 2) | Mod Fabric a medida con servidor WebSocket embebido | Acceso completo a la API del juego más allá de los comandos vanilla |
| Overlay | WebSocket (`ws` / `socket.io`) + HTML/CSS/JS o Svelte | Browser Source en OBS, ligero, reactivo |
| Panel de administración | SPA en React o Svelte | Configuración de mapeos evento→acción, monitoreo de cola en vivo |
| Despliegue | Docker Compose | Ejecución local junto a OBS y el servidor de Minecraft |

---

## 4. Detalle de componentes

### 4.1 Adaptador de Plataforma (TikTok LIVE)

- TikTok no ofrece API oficial para eventos de LIVE. Todo el ecosistema disponible (`tiktok-live-connector` en Node, `TikTokLive` en Python) se basa en ingeniería inversa del protocolo Webcast interno.
- No se requieren credenciales para leer un stream público; solo enviar mensajes de chat requiere autenticación adicional.
- La conexión WebSocket depende de un token firmado por un servicio externo (Euler Stream), con límites gratuitos para uso comunitario — es una dependencia externa a monitorear.
- **Riesgo crítico:** es un proyecto de ingeniería inversa; TikTok puede modificar el protocolo sin aviso previo, rompiendo la librería.
- **Mitigación de diseño:** aislar completamente esta lógica detrás de una interfaz `PlatformAdapter` con un modelo de evento propio (`ChaosEvent`). Ninguna otra parte del sistema debe importar tipos o estructuras de la librería de TikTok directamente.

### 4.2 Bus de Eventos / Normalizador

Esquema de evento interno único (ejemplo):

```ts
interface ChaosEvent {
  id: string;
  platform: "tiktok" | "twitch" | "youtube";
  type: "gift" | "like" | "follow" | "comment" | "share";
  user: { id: string; displayName: string };
  value: number;      // peso o valor económico del evento
  raw: unknown;        // payload original, solo para debugging
  timestamp: number;
}
```

- MVP: `EventEmitter` interno de Node es suficiente.
- Escalado futuro (múltiples procesos/instancias): migrar a Redis Pub/Sub o NATS.

### 4.3 Motor de Colas y Prioridades

- BullMQ resuelve colas, prioridad y rate limiting sin reinventar la rueda.
- Función de scoring sugerida: `prioridad = f(valor_del_evento, tier_del_usuario, tiempo_en_cola)` — incluir el tiempo en cola evita "inanición" de eventos de baja prioridad.
- Rate limiting por tipo de acción de juego (ej. máximo una acción disruptiva cada N segundos) para proteger la jugabilidad y el rendimiento del servidor.

### 4.4 Motor de Metas (Goals)

- Módulo de estado acumulado independiente de la cola de eventos individuales.
- Persistencia ligera en SQLite.
- Al cruzar un umbral configurado, emite un `GoalTriggeredEvent` que entra al mismo dispatcher de acciones que los eventos individuales.

### 4.5 Dispatcher de Acciones + Adaptador de Juego (Minecraft)

**Opción A — RCON (recomendado para el MVP):**
- Soporte nativo de Minecraft Java vía `server.properties`.
- Permite ejecutar comandos vanilla (`/summon`, `/effect`, `/give`, `/particle`, `/title`) desde el middleware.
- Ventaja: cero mods, compatible con cualquier servidor vanilla o modded.
- Limitación: acotado a lo que permiten los comandos vanilla; hay algo de latencia por comando individual.

**Opción B — Mod Fabric a medida (fase 2, mayor potencia):**
- Fabric es el toolchain de modding modular estándar actual para Minecraft Java, con soporte de Kotlin disponible.
- Patrón ya validado en el ecosistema: mods que exponen un servidor WebSocket embebido en el propio proceso del juego para recibir comandos externos y emitir eventos de vuelta.
- Ventaja: acceso completo a la API del juego (entidades custom, efectos complejos, lectura de estado del jugador en tiempo real), sin las limitaciones de los comandos vanilla.
- Costo: mantenimiento del mod por cada versión de Minecraft soportada.

**Recomendación de secuencia:** implementar RCON primero para validar el producto de punta a punta rápidamente; evolucionar a un mod Fabric propio cuando se necesiten acciones o feedback que RCON no puede ofrecer.

### 4.6 Overlay (OBS)

- Servidor WebSocket embebido en el mismo proceso del núcleo, sirviendo una página estática añadida como Browser Source en OBS.
- Frontend ligero (HTML/CSS/JS plano o Svelte), animaciones con CSS o GSAP.
- Se suscribe al bus de eventos (o a un canal filtrado) para mostrar alertas, barra de metas y estado de la cola.

### 4.7 Panel de Administración

- SPA para mapear evento → acción → prioridad, idealmente editable en caliente.
- Monitor en vivo de la cola y del progreso de metas.
- Configuración persistida en la misma base SQLite o en archivos JSON/YAML versionables.

---

## 5. Riesgos identificados y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Ruptura del protocolo Webcast de TikTok sin aviso | Aislar el adaptador tras una interfaz estable; diseñar un "modo degradado" que no tumbe el resto del sistema |
| Saturación de la cola por gift-bombing | Rate limiting por tipo de acción + función de prioridad con aging |
| Comandos maliciosos o mal mapeados vía RCON | Lista blanca de comandos permitidos por tipo de evento; nunca exponer RCON a la red pública |
| Latencia percibida alta (evento → acción visible) | Medir el pipeline completo end-to-end desde el primer prototipo; fijar un SLO interno (ej. <500ms percentil 95) |
| Dependencia de servicio externo de firma (Euler Stream) | Manejar reconexión y backoff; alertar al streamer si la ingesta cae |

---

## 6. Consejos de diseño profesional para el agente

### 6.1 Arquitectura hexagonal (puertos y adaptadores)

Diseña el núcleo (colas, prioridades, metas, dispatcher) como dominio puro, sin dependencias de librerías externas de TikTok o Minecraft. Los adaptadores (TikTok, Minecraft, overlay) implementan interfaces (`puertos`) definidas por el dominio. Esto permite:
- Testear la lógica de negocio con mocks, sin conexión real a TikTok ni a un servidor de Minecraft.
- Agregar Twitch/YouTube o Bedrock/Bukkit más adelante sin tocar el núcleo.

### 6.2 Principios SOLID aplicados

- **S**: cada módulo (cola, metas, dispatcher) resuelve una única responsabilidad.
- **O**: nuevas plataformas o juegos se agregan mediante nuevos adaptadores, no modificando el núcleo.
- **L**: cualquier adaptador de plataforma debe ser sustituible sin romper el bus de eventos.
- **I**: interfaces pequeñas y específicas (`PlatformAdapter`, `GameAdapter`) en vez de una interfaz gigante.
- **D**: el núcleo depende de abstracciones (`ChaosEvent`, `GameAction`), no de implementaciones concretas.

### 6.3 Resiliencia

- Aplica el patrón **circuit breaker** en la conexión a TikTok y en el puente RCON: si fallan repetidamente, deja de reintentar agresivamente y notifica al panel de administración.
- Reintentos con **backoff exponencial** para reconexiones de WebSocket.
- Toda acción despachada al juego debe ser idempotente o tolerante a duplicados (un reintento no debe, por ejemplo, duplicar un spawn).

### 6.4 Observabilidad

- Logging estructurado (JSON) desde el día uno, con un `correlationId` por evento que atraviese todo el pipeline (ingesta → cola → acción → overlay). Esto es clave para depurar problemas de latencia o eventos perdidos.
- Métricas mínimas a exponer: eventos recibidos/segundo, tamaño de cola, latencia end-to-end, tasa de error del adaptador de Minecraft.
- Considerar un dashboard simple (incluso reutilizando el panel de administración) para ver estas métricas en vivo durante un stream.

### 6.5 Configuración y entornos

- Sigue principios de **12-factor app**: configuración vía variables de entorno, sin credenciales ni tokens en el código fuente.
- Separa claramente entornos de desarrollo (servidor Minecraft local de pruebas) y producción (stream en vivo), para evitar que pruebas del agente disparen acciones en un stream real.

### 6.6 Seguridad

- Nunca expongas el puerto RCON directamente a internet; el middleware y el servidor de Minecraft deben correr en la misma red local o tras un túnel seguro.
- Sanitiza cualquier dato proveniente de comentarios o nombres de usuario de TikTok antes de insertarlo en comandos de Minecraft (riesgo de inyección de comandos).
- Guarda tokens y contraseñas (RCON, Euler Stream API key) en un `.env` no versionado, nunca en el repositorio.

### 6.7 Testing

- Pirámide de pruebas: unitarias para la lógica de prioridad y metas (sin red), pruebas de integración para el adaptador RCON contra un servidor Minecraft de prueba, y un puñado de pruebas end-to-end simulando eventos de TikTok con fixtures grabadas (no contra el stream real).
- Graba payloads reales de eventos de TikTok como fixtures para poder testear el normalizador sin depender de un stream en vivo.

### 6.8 Control de versiones y flujo de trabajo

- Repositorio con estructura de monorepo (`/core`, `/adapters/tiktok`, `/adapters/minecraft`, `/overlay`, `/admin-ui`) o paquetes separados si se prevé publicar adaptadores de forma independiente.
- Versionado semántico (SemVer) por módulo, especialmente importante para el adaptador de Minecraft si se liga a versiones específicas del juego.
- Documentar en el README de cada adaptador qué versión de Minecraft/TikTok fue validada, dado que ambas plataformas cambian con el tiempo.

### 6.9 Documentación viva

- Mantener un documento de "contratos de interfaz" (`ChaosEvent`, `GameAction`, `PlatformAdapter`, `GameAdapter`) actualizado como fuente de verdad, separado de este documento de arquitectura inicial.
- Registrar decisiones de arquitectura relevantes en un log corto de ADRs (Architecture Decision Records) para que futuras decisiones (ej. migrar de RCON a mod Fabric) queden justificadas y trazables.

---

## 7. Próximos pasos sugeridos

1. Definir el contrato `ChaosEvent` y `GameAction` de forma definitiva.
2. Prototipo mínimo: ingesta de TikTok → consola (sin cola ni Minecraft) para validar la conexión y el modelo de datos.
3. Agregar BullMQ y la función de prioridad.
4. Integrar RCON con un servidor Minecraft de pruebas local.
5. Overlay básico en OBS mostrando eventos crudos.
6. Iterar sobre metas y panel de administración.
