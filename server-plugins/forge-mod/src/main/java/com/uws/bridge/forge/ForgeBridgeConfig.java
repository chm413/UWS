package com.uws.bridge.forge;

import com.uws.bridge.common.BridgeConfig;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Properties;
import net.minecraft.server.MinecraftServer;
import net.minecraftforge.fml.loading.FMLPaths;

public final class ForgeBridgeConfig {
  private ForgeBridgeConfig() {}

  public static BridgeConfig load(MinecraftServer server) {
    Path configDir = FMLPaths.CONFIGDIR.get();
    Path file = configDir.resolve("uwbp-forge-bridge.properties");
    Properties props = new Properties();
    if (Files.exists(file)) {
      try (Reader reader = Files.newBufferedReader(file)) {
        props.load(reader);
      } catch (IOException ignored) {
      }
    }

    boolean dirty = false;

    dirty |= setDefault(props, "bindAddress", "0.0.0.0");
    dirty |= setDefault(props, "port", "6250");
    dirty |= setDefault(props, "token", "change-me");
    dirty |= setDefault(props, "serverId", server.getServerModName().toLowerCase() + "-main");
    dirty |= setDefault(props, "heartbeatSeconds", "30");

    if (dirty) {
      try {
        Files.createDirectories(configDir);
        try (Writer writer = Files.newBufferedWriter(file)) {
          props.store(writer, "U-WBP Forge bridge configuration");
        }
      } catch (IOException ignored) {
      }
    }

    String bind = props.getProperty("bindAddress", "0.0.0.0");
    int port = Integer.parseInt(props.getProperty("port", "6250"));
    String token = props.getProperty("token", "change-me");
    String serverId = props.getProperty("serverId", "forge-main");
    int heartbeat = Integer.parseInt(props.getProperty("heartbeatSeconds", "30"));

    return new BridgeConfig(bind, port, token, serverId, "Java", "Forge", server.getServerVersion(), Duration.ofSeconds(heartbeat));
  }

  private static boolean setDefault(Properties props, String key, String value) {
    if (props.containsKey(key)) {
      return false;
    }
    props.setProperty(key, value);
    return true;
  }
}
