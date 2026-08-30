package com.chaoslive;

import com.chaoslive.config.ModConfig;
import com.chaoslive.execution.CommandExecutor;
import com.chaoslive.net.ChaosWebSocketClient;
import java.nio.file.Path;
import java.util.logging.Logger;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.loader.api.FabricLoader;

/**
 * ChaosLiveMod
 * Universal entrypoint for the Chaos-Live Minecraft Fabric Mod (Singleplayer Integrated Server & Dedicated Server).
 */
public class ChaosLiveMod implements ModInitializer {
    public static final String MOD_ID = "chaoslive";
    private static final Logger LOGGER = Logger.getLogger("Chaos-Live");

    private ModConfig config;
    private CommandExecutor executor;
    private ChaosWebSocketClient client;

    @Override
    public void onInitialize() {
        LOGGER.info("[Chaos-Live] Initializing Chaos-Live Fabric Connector (v0.1.0)...");

        Path configDir = FabricLoader.getInstance().getConfigDir();
        this.config = ModConfig.load(configDir);
        this.executor = new CommandExecutor();
        this.client = new ChaosWebSocketClient(config, executor);

        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            LOGGER.info("[Chaos-Live] Minecraft server/world started. Registering executor and initiating middleware connection...");
            executor.setServer(server);
            client.start();
        });

        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            LOGGER.info("[Chaos-Live] Minecraft server/world stopping. Disconnecting from middleware...");
            client.stop();
        });
    }
}
