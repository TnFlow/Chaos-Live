# ADR-0003: Alcance operativo — un solo streamer, un solo PC, solo TikTok

**Status:** Accepted
**Date:** 2026-09-04

## Contexto

Chaos-Live se construyó siguiendo un plan por fases que llegó hasta una "fase 10
SaaS". Como resultado, el repositorio contiene dos subsistemas completos y con
tests que **nunca se conectan a la aplicación**:

1. **Adapter de Twitch** (`packages/adapters/twitch`). Implementa
   `PlatformAdapter` sobre EventSub y tiene tests propios, pero
   `@chaos-live/adapter-twitch` ni siquiera figura en las dependencias de
   `@chaos-live/app`, y `packages/app/src/main.ts` instancia **un solo** adapter
   de plataforma: TikTok o el simulador, nunca ambos ni Twitch.

2. **Multi-tenancy** (`packages/core/src/tenant/`). `TenantManager`,
   `PrismaTokenVault` y `TenantContext` se exportan desde el índice de
   `@chaos-live/core`, y el esquema de Prisma tiene columnas `tenantId` en todas
   las tablas, pero nadie instancia un `TenantManager` en tiempo de ejecución.
   Todo funciona de hecho como un único tenant implícito.

La documentación afirmaba lo contrario. `docs/ROADMAP.md` daba por entregada la
"ingesta concurrente multiplataforma" y `docs/SECURITY.md` §2.7 describía un
aislamiento por tenant que en la práctica no está activo. Eso es peor que no
tener la función: lleva a confiar en una defensa que no existe.

El uso real e inmediato del proyecto es concreto: **una persona transmitiendo en
TikTok LIVE, con Chaos-Live, Minecraft y OBS en el mismo PC.**

## Decisión

**Mantener el código pero marcarlo explícitamente como no cableado, y ajustar la
documentación a lo que el sistema hace de verdad.**

- No se conecta el adapter de Twitch ni el `TenantManager` a `main.ts`.
- No se borran: están cubiertos por tests, su coste de mantenimiento es bajo y
  son el punto de partida natural si más adelante se transmite en Twitch o se
  ofrece el servicio a otros streamers.
- Se corrigen las afirmaciones de `ROADMAP.md`, `SECURITY.md` y la tabla de
  paquetes del `README.md` para marcarlos como *experimental / no cableado*.

Como el despliegue es de un solo PC, se derivan además dos decisiones:

- **El servidor escucha en `127.0.0.1` por defecto** (variable `HOST`). La API de
  gestión no tiene autenticación; mientras solo sea accesible desde la propia
  máquina, añadir autenticación sería complejidad sin beneficio.
- **No se implementa acceso remoto** (túneles, OAuth, sesiones).

## Consecuencias

**A favor**

- La documentación deja de prometer garantías inexistentes.
- Se evita el trabajo de multi-tenancy y autenticación que nadie va a usar aún.
- El código sigue disponible sin arqueología en el historial de git.

**En contra**

- Queda código en el repositorio que no se ejercita en producción y puede
  descolgarse de la evolución del resto (ese es justamente el motivo de dejarlo
  por escrito aquí).

## Condiciones para revertir esta decisión

Cablear estos subsistemas tiene sentido cuando ocurra alguna de estas cosas:

- **Twitch:** el streamer empieza a emitir simultáneamente en TikTok y Twitch.
  Trabajo: añadir la dependencia a `packages/app`, construir la lista de adapters
  a partir de la configuración y pasarla a `platformAdapters` del `EventEngine`,
  que ya acepta varios.
- **Multi-tenant:** se ofrece Chaos-Live a más streamers desde una instancia
  compartida. Requiere además autenticación en la API REST, aislamiento de la
  conexión WebSocket por tenant y revisar el `HOST` por defecto.
