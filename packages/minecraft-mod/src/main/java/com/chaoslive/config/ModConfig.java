package com.chaoslive.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Path;

public class ModConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public boolean enabled = true;
    public String wsHost = "localhost";
    public int wsPort = 8080;
    public boolean autoReconnect = true;
    public long reconnectDelayMs = 3000;
    public int maxReconnectAttempts = 20;

    public static ModConfig load(Path configDir) {
        File configFile = configDir.resolve("chaos-live.json").toFile();
        if (!configFile.exists()) {
            ModConfig defaultConfig = new ModConfig();
            defaultConfig.save(configDir);
            return defaultConfig;
        }

        try (FileReader reader = new FileReader(configFile)) {
            ModConfig config = GSON.fromJson(reader, ModConfig.class);
            return config != null ? config : new ModConfig();
        } catch (IOException e) {
            System.err.println("[Chaos-Live] Failed to read config file, using defaults: " + e.getMessage());
            return new ModConfig();
        }
    }

    public void save(Path configDir) {
        File configFile = configDir.resolve("chaos-live.json").toFile();
        configFile.getParentFile().mkdirs();

        try (FileWriter writer = new FileWriter(configFile)) {
            GSON.toJson(this, writer);
        } catch (IOException e) {
            System.err.println("[Chaos-Live] Failed to save config file: " + e.getMessage());
        }
    }

    public String getWebSocketUrl() {
        return "ws://" + wsHost + ":" + wsPort + "/?clientType=mod";
    }
}
