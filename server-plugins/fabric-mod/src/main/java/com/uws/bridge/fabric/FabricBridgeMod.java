package com.uws.bridge.fabric;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.authlib.GameProfile;
import com.uws.bridge.common.BridgeRequest;
import com.uws.bridge.common.BridgeRequestHandler;
import com.uws.bridge.common.BridgeResponse;
import com.uws.bridge.common.BridgeServer;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import net.fabricmc.api.DedicatedServerModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.message.v1.ServerMessageEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MessageType;
import net.minecraft.network.chat.SignedMessage;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.players.PlayerList;
import net.minecraft.server.players.UserBanListEntry;
import net.minecraft.server.players.UserWhiteListEntry;

public class FabricBridgeMod implements DedicatedServerModInitializer, BridgeRequestHandler {
  private BridgeServer bridgeServer;
  private MinecraftServer server;
  private final Set<String> subscribedTopics = ConcurrentHashMap.newKeySet();
  private int tickCounter;

  @Override
  public void onInitializeServer() {
    ServerLifecycleEvents.SERVER_STARTING.register(this::onServerStarting);
    ServerLifecycleEvents.SERVER_STOPPING.register(this::onServerStopping);

    ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> emitPlayerEvent("join", handler.player));
    ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> emitPlayerEvent("quit", handler.player));

    ServerMessageEvents.CHAT.register((SignedMessage message, ServerPlayer sender, MessageType.Parameters params) -> {
      if (!subscribedTopics.contains("chat.ingame")) {
        return;
      }
      JsonObject data = new JsonObject();
      data.addProperty("eventId", UUID.randomUUID().toString());
      data.addProperty("timestamp", System.currentTimeMillis());
      data.addProperty("player", sender.getGameProfile().getName());
      data.addProperty("message", message.getContent().getString());
      broadcast("events.chat", data);
    });

    ServerTickEvents.END_SERVER_TICK.register(server -> {
      if (this.server == null) {
        return;
      }
      tickCounter++;
      if (tickCounter % 20 != 0 || !subscribedTopics.contains("metrics.tps")) {
        return;
      }
      double mspt = this.server.getAverageTickTime();
      double tps = Math.min(1000.0 / Math.max(mspt, 0.001), 20.0);
      JsonObject metrics = new JsonObject();
      metrics.addProperty("tps", Math.round(tps * 100.0) / 100.0);
      metrics.addProperty("mspt", Math.round(mspt * 100.0) / 100.0);
      metrics.addProperty("players", this.server.getPlayerCount());
      metrics.addProperty("maxPlayers", this.server.getMaxPlayers());
      broadcast("metrics.tps", metrics);
    });
  }

  private void onServerStarting(MinecraftServer server) {
    this.server = server;
    try {
      this.bridgeServer = new BridgeServer(FabricBridgeConfig.load(server), java.util.logging.Logger.getLogger("UwbpFabricBridge"), this);
      this.bridgeServer.setReuseAddr(true);
      this.bridgeServer.start();
    } catch (Exception ex) {
      ex.printStackTrace();
    }
  }

  private void onServerStopping(MinecraftServer server) {
    if (bridgeServer != null) {
      try {
        bridgeServer.stop(0);
      } catch (Exception ignored) {
      }
      bridgeServer = null;
    }
    this.server = null;
  }

  @Override
  public CompletableFuture<BridgeResponse> handle(BridgeRequest request) {
    if (server == null) {
      return CompletableFuture.completedFuture(BridgeResponse.error("server not ready"));
    }
    switch (request.getCmd()) {
      case "getCapabilities":
        return CompletableFuture.completedFuture(BridgeResponse.success(buildCapabilities()));
      case "getServerInfo":
        return runOnServer(this::buildServerInfo);
      case "getPlayers":
        return runOnServer(this::buildPlayers);
      case "getUsage":
        return runOnServer(this::buildUsage);
      case "control":
        return runOnServer(() -> handleControl(request.getData()));
      case "console.exec":
        return runOnServer(() -> handleConsole(request.getData()));
      case "subscribe":
        return CompletableFuture.completedFuture(handleSubscribe(request.getData()));
      default:
        return CompletableFuture.completedFuture(BridgeResponse.failure("unsupported command"));
    }
  }

  private CompletableFuture<BridgeResponse> runOnServer(Supplier<BridgeResponse> supplier) {
    CompletableFuture<BridgeResponse> future = new CompletableFuture<>();
    server.execute(() -> {
      try {
        future.complete(supplier.get());
      } catch (Throwable throwable) {
        future.completeExceptionally(throwable);
      }
    });
    return future;
  }

  private BridgeResponse buildCapabilities() {
    JsonObject data = new JsonObject();
    JsonArray caps = new JsonArray();
    caps.add("core.info");
    caps.add("players.list");
    caps.add("metrics.tps");
    caps.add("control.runCommand");
    caps.add("control.setWeather");
    caps.add("control.setTime");
    caps.add("control.broadcast");
    caps.add("control.kickPlayer");
    caps.add("lists.whitelist");
    caps.add("lists.blacklist");
    caps.add("console.exec");
    caps.add("events.player");
    caps.add("events.chat");
    caps.add("events.metrics");
    data.add("caps", caps);
    JsonObject limits = new JsonObject();
    limits.addProperty("rate.qps", 20);
    limits.addProperty("timeout.ms", 5000);
    limits.addProperty("maxBatch", 64);
    data.add("limits", limits);
    return data;
  }

  private BridgeResponse buildServerInfo() {
    JsonObject data = new JsonObject();
    data.addProperty("name", server.getServerModName());
    data.addProperty("style", "Java");
    data.addProperty("core", "Fabric");
    data.addProperty("version", server.getServerVersion());
    data.addProperty("description", server.getMotd());
    data.addProperty("motd", server.getMotd());
    data.addProperty("maxPlayers", server.getMaxPlayers());
    data.addProperty("onlinePlayers", server.getPlayerCount());
    data.addProperty("whitelistEnabled", server.getPlayerList().isUsingWhitelist());
    data.addProperty("serverMode", server.usesAuthentication() ? "online" : "offline");
    return BridgeResponse.success(data);
  }

  private BridgeResponse buildPlayers() {
    JsonObject data = new JsonObject();
    JsonArray players = new JsonArray();
    for (ServerPlayer player : server.getPlayerList().getPlayers()) {
      JsonObject entry = new JsonObject();
      entry.addProperty("name", player.getGameProfile().getName());
      entry.addProperty("uuid", player.getUUID().toString());
      entry.addProperty("ip", player.getIpAddress());
      entry.addProperty("platform", "Java");
      entry.addProperty("auth", server.usesAuthentication() ? "online" : "offline");
      entry.addProperty("ping", player.connection.latency);
      entry.addProperty("gamemode", player.gameMode.getGameModeForPlayer().getName());
      entry.addProperty("firstJoin", 0);
      entry.addProperty("lastSeen", System.currentTimeMillis());
      players.add(entry);
    }
    data.addProperty("count", players.size());
    data.add("players", players);
    data.addProperty("maxPlayers", server.getMaxPlayers());
    return BridgeResponse.success(data);
  }

  private BridgeResponse buildUsage() {
    JsonObject data = new JsonObject();
    double mspt = server.getAverageTickTime();
    double tps = Math.min(1000.0 / Math.max(mspt, 0.001), 20.0);
    data.addProperty("tps", Math.round(tps * 100.0) / 100.0);
    Runtime runtime = Runtime.getRuntime();
    double used = (runtime.totalMemory() - runtime.freeMemory()) / 1048576.0;
    double max = runtime.maxMemory() / 1048576.0;
    data.addProperty("memory", Math.round((used / max) * 10000.0) / 100.0);
    data.addProperty("tickTime", Math.round(mspt * 100.0) / 100.0);
    data.addProperty("threads", Thread.activeCount());
    data.addProperty("uptime", System.currentTimeMillis() - server.getStartTime());
    return BridgeResponse.success(data);
  }

  private BridgeResponse handleConsole(JsonObject payload) {
    String command = payload != null && payload.has("command") ? payload.get("command").getAsString() : null;
    if (command == null || command.isEmpty()) {
      return BridgeResponse.failure("missing command");
    }
    CommandSourceStack stack = server.createCommandSourceStack().withSuppressedOutput();
    int result = server.getCommands().performPrefixedCommand(stack, command);
    JsonObject data = new JsonObject();
    data.addProperty("success", result > 0);
    return BridgeResponse.success(data);
  }

  private BridgeResponse handleControl(JsonObject payload) {
    if (payload == null || !payload.has("action")) {
      return BridgeResponse.failure("missing action");
    }
    String action = payload.get("action").getAsString();
    JsonObject params = payload.has("params") && payload.get("params").isJsonObject()
        ? payload.getAsJsonObject("params")
        : new JsonObject();

    switch (action) {
      case "runCommand":
        return handleConsole(params);
      case "broadcast":
        String message = params.has("message") ? params.get("message").getAsString() : null;
        if (message == null) {
          return BridgeResponse.failure("missing message");
        }
        server.getPlayerList().broadcastSystemMessage(Component.literal(message), false);
        return BridgeResponse.success(null);
      case "setWeather":
        return setWeather(params);
      case "setTime":
        return setTime(params);
      case "kickPlayer":
        return kickPlayer(params);
      case "whitelistAdd":
        return toggleWhitelist(params, true);
      case "whitelistRemove":
        return toggleWhitelist(params, false);
      case "blacklistAdd":
        return toggleBlacklist(params, true);
      case "blacklistRemove":
        return toggleBlacklist(params, false);
      case "stopServer":
        server.halt(false);
        return BridgeResponse.success(null);
      default:
        return BridgeResponse.failure("unsupported action: " + action);
    }
  }

  private BridgeResponse setWeather(JsonObject params) {
    ServerLevel level = server.overworld();
    if (level == null) {
      return BridgeResponse.failure("no overworld");
    }
    String weather = params.has("weather") ? params.get("weather").getAsString() : "clear";
    switch (weather.toLowerCase()) {
      case "rain":
        level.setWeatherParameters(0, 6000, true, false);
        break;
      case "thunder":
        level.setWeatherParameters(0, 6000, true, true);
        break;
      default:
        level.setWeatherParameters(6000, 0, false, false);
    }
    return BridgeResponse.success(null);
  }

  private BridgeResponse setTime(JsonObject params) {
    if (!params.has("time")) {
      return BridgeResponse.failure("missing time");
    }
    long value = params.get("time").getAsLong();
    ServerLevel level = server.overworld();
    if (level == null) {
      return BridgeResponse.failure("no overworld");
    }
    level.setDayTime(value);
    return BridgeResponse.success(null);
  }

  private BridgeResponse kickPlayer(JsonObject params) {
    if (!params.has("player")) {
      return BridgeResponse.failure("missing player");
    }
    String name = params.get("player").getAsString();
    ServerPlayer player = server.getPlayerList().getPlayerByName(name);
    if (player == null) {
      return BridgeResponse.failure("player not online");
    }
    String reason = params.has("reason") ? params.get("reason").getAsString() : "Kicked by bridge";
    player.connection.disconnect(Component.literal(reason));
    return BridgeResponse.success(null);
  }

  private BridgeResponse toggleWhitelist(JsonObject params, boolean value) {
    if (!params.has("player")) {
      return BridgeResponse.failure("missing player");
    }
    String name = params.get("player").getAsString();
    PlayerList list = server.getPlayerList();
    GameProfile profile = server.getProfileCache().get(name).orElse(new GameProfile(UUID.randomUUID(), name));
    if (value) {
      list.getWhiteList().add(new UserWhiteListEntry(profile));
    } else {
      list.getWhiteList().remove(profile);
    }
    return BridgeResponse.success(null);
  }

  private BridgeResponse toggleBlacklist(JsonObject params, boolean value) {
    if (!params.has("player")) {
      return BridgeResponse.failure("missing player");
    }
    String name = params.get("player").getAsString();
    PlayerList list = server.getPlayerList();
    GameProfile profile = server.getProfileCache().get(name).orElse(new GameProfile(UUID.randomUUID(), name));
    if (value) {
      list.getBans().add(new UserBanListEntry(profile, null, "bridge", null, params.has("reason") ? params.get("reason").getAsString() : "Banned via bridge"));
    } else {
      list.getBans().remove(profile);
    }
    return BridgeResponse.success(null);
  }

  private BridgeResponse handleSubscribe(JsonObject payload) {
    if (payload == null || !payload.has("topics") || !payload.get("topics").isJsonArray()) {
      return BridgeResponse.failure("missing topics");
    }
    payload.getAsJsonArray("topics").forEach(element -> {
      if (element.isJsonObject() && element.getAsJsonObject().has("name")) {
        subscribedTopics.add(element.getAsJsonObject().get("name").getAsString());
      } else if (element.isJsonPrimitive()) {
        subscribedTopics.add(element.getAsString());
      }
    });
    JsonObject data = new JsonObject();
    JsonArray arr = new JsonArray();
    subscribedTopics.forEach(arr::add);
    data.add("topics", arr);
    return BridgeResponse.success(data);
  }

  private void emitPlayerEvent(String type, ServerPlayer player) {
    if (!subscribedTopics.contains("players.activity")) {
      return;
    }
    JsonObject data = new JsonObject();
    data.addProperty("eventId", UUID.randomUUID().toString());
    data.addProperty("timestamp", System.currentTimeMillis());
    data.addProperty("type", type);
    JsonObject playerData = new JsonObject();
    playerData.addProperty("name", player.getGameProfile().getName());
    playerData.addProperty("uuid", player.getUUID().toString());
    playerData.addProperty("ip", player.getIpAddress());
    data.add("player", playerData);
    broadcast("events.player", data);
  }

  private void broadcast(String cmd, JsonObject payload) {
    if (bridgeServer != null) {
      bridgeServer.broadcast(cmd, payload);
    }
  }
}
