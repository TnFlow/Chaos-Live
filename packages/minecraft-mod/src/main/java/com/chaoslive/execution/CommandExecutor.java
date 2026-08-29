package com.chaoslive.execution;

import com.chaoslive.net.protocol.ActionResultMessage;
import com.chaoslive.net.protocol.GameActionMessage;
import java.util.function.Consumer;
import java.util.logging.Logger;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.command.ServerCommandSource;

/**
 * CommandExecutor
 * Executes incoming GameActions directly on the Minecraft server thread.
 */
public class CommandExecutor {
    private static final Logger LOGGER = Logger.getLogger("Chaos-Live");
    private MinecraftServer server;

    public void setServer(MinecraftServer server) {
        this.server = server;
    }

    public void execute(GameActionMessage.Payload action, Consumer<ActionResultMessage> callback) {
        if (server == null) {
            LOGGER.warning("[Chaos-Live] Cannot execute action: MinecraftServer is not yet initialized.");
            callback.accept(new ActionResultMessage(
                    action.id,
                    false,
                    0,
                    null,
                    "Minecraft server is not ready."
            ));
            return;
        }

        long startTime = System.currentTimeMillis();
        String command = action.command;

        if (command == null || command.trim().isEmpty()) {
            callback.accept(new ActionResultMessage(
                    action.id,
                    false,
                    0,
                    null,
                    "Empty command received."
            ));
            return;
        }

        // Clean leading slash if present
        String sanitized = command.startsWith("/") ? command.substring(1) : command;

        // Schedule execution on main server thread for thread safety
        server.execute(() -> {
            try {
                ServerCommandSource source = server.getCommandSource();
                int result = server.getCommandManager().executeWithPrefix(source, sanitized);
                long duration = System.currentTimeMillis() - startTime;

                LOGGER.info("[Chaos-Live] Executed: /" + sanitized + " (result: " + result + ", duration: " + duration + "ms)");
                callback.accept(new ActionResultMessage(
                        action.id,
                        true,
                        duration,
                        "Command executed with result code " + result,
                        null
                ));
            } catch (Exception e) {
                long duration = System.currentTimeMillis() - startTime;
                LOGGER.warning("[Chaos-Live] Execution error for /" + sanitized + ": " + e.getMessage());
                callback.accept(new ActionResultMessage(
                        action.id,
                        false,
                        duration,
                        null,
                        e.getMessage()
                ));
            }
        });
    }
}
