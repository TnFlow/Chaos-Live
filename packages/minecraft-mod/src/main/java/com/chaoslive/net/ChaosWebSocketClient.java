package com.chaoslive.net;

import com.chaoslive.config.ModConfig;
import com.chaoslive.execution.CommandExecutor;
import com.chaoslive.net.protocol.ActionResultMessage;
import com.chaoslive.net.protocol.GameActionMessage;
import com.google.gson.Gson;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Logger;

/**
 * ChaosWebSocketClient
 * Manages the outbound WebSocket connection from the Minecraft server to the Chaos-Live middleware.
 * Uses standard Java 11+ java.net.http.WebSocket for zero external dependency footprint.
 */
public class ChaosWebSocketClient implements WebSocket.Listener {
    private static final Logger LOGGER = Logger.getLogger("Chaos-Live");
    private static final Gson GSON = new Gson();

    private final ModConfig config;
    private final CommandExecutor executor;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final HttpClient httpClient;

    private WebSocket webSocket;
    private final StringBuilder messageBuffer = new StringBuilder();
    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private final AtomicBoolean isConnecting = new AtomicBoolean(false);
    private int reconnectAttempts = 0;

    public ChaosWebSocketClient(ModConfig config, CommandExecutor executor) {
        this.config = config;
        this.executor = executor;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public void start() {
        if (!config.enabled) {
            LOGGER.info("[Chaos-Live] Mod connector is disabled in configuration.");
            return;
        }

        isRunning.set(true);
        connect();
    }

    public void stop() {
        isRunning.set(false);
        if (webSocket != null) {
            try {
                webSocket.sendClose(WebSocket.NORMAL_CLOSURE, "Server stopping").join();
            } catch (Exception ignored) {
            }
            webSocket = null;
        }
        scheduler.shutdownNow();
    }

    private void connect() {
        if (!isRunning.get() || isConnecting.get()) {
            return;
        }

        isConnecting.set(true);
        String url = config.getWebSocketUrl();
        LOGGER.info("[Chaos-Live] Connecting outbound to middleware hub at " + url + "...");

        httpClient.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .buildAsync(URI.create(url), this)
                .whenComplete((ws, throwable) -> {
                    isConnecting.set(false);
                    if (throwable != null) {
                        LOGGER.warning("[Chaos-Live] Failed to connect to middleware: " + throwable.getMessage());
                        scheduleReconnect();
                    } else {
                        this.webSocket = ws;
                        this.reconnectAttempts = 0;
                        LOGGER.info("[Chaos-Live] ⚡ Connected successfully to Chaos-Live middleware!");
                        sendHandshake();
                    }
                });
    }

    private void scheduleReconnect() {
        if (!isRunning.get() || !config.autoReconnect) {
            return;
        }

        reconnectAttempts++;
        if (reconnectAttempts > config.maxReconnectAttempts) {
            LOGGER.warning("[Chaos-Live] Max reconnection attempts reached (" + config.maxReconnectAttempts + "). Halting reconnect.");
            return;
        }

        long delay = Math.min(config.reconnectDelayMs * (1L << Math.min(reconnectAttempts - 1, 4)), 30000);
        LOGGER.info("[Chaos-Live] Reconnecting in " + (delay / 1000) + "s (attempt " + reconnectAttempts + "/" + config.maxReconnectAttempts + ")...");
        scheduler.schedule(this::connect, delay, TimeUnit.MILLISECONDS);
    }

    private void sendHandshake() {
        if (webSocket == null) return;
        String handshake = "{\"type\":\"HANDSHAKE\",\"clientType\":\"mod\",\"protocolVersion\":\"0.1.0\"}";
        webSocket.sendText(handshake, true);
    }

    public void sendResult(ActionResultMessage result) {
        if (webSocket != null && isRunning.get()) {
            String json = GSON.toJson(result);
            webSocket.sendText(json, true);
        }
    }

    @Override
    public void onOpen(WebSocket webSocket) {
        webSocket.request(1);
    }

    @Override
    public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
        messageBuffer.append(data);

        if (last) {
            String completeMessage = messageBuffer.toString();
            messageBuffer.setLength(0);
            handleIncomingMessage(completeMessage);
        }

        webSocket.request(1);
        return null;
    }

    @Override
    public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
        LOGGER.info("[Chaos-Live] Disconnected from middleware hub (" + statusCode + ": " + reason + ")");
        this.webSocket = null;
        scheduleReconnect();
        return null;
    }

    @Override
    public void onError(WebSocket webSocket, Throwable error) {
        LOGGER.warning("[Chaos-Live] WebSocket error: " + error.getMessage());
        this.webSocket = null;
        scheduleReconnect();
    }

    private void handleIncomingMessage(String json) {
        try {
            GameActionMessage message = GSON.fromJson(json, GameActionMessage.class);
            if (message != null && "GAME_ACTION".equals(message.type) && message.payload != null) {
                executor.execute(message.payload, this::sendResult);
            }
        } catch (Exception e) {
            LOGGER.warning("[Chaos-Live] Failed to parse incoming packet: " + e.getMessage());
        }
    }
}
