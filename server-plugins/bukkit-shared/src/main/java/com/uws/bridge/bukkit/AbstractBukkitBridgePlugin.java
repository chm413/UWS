package com.uws.bridge.bukkit;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.uws.bridge.common.BridgeConfig;
import com.uws.bridge.common.BridgeRequest;
import com.uws.bridge.common.BridgeRequestHandler;
import com.uws.bridge.common.BridgeResponse;
import com.uws.bridge.common.BridgeServer;
import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.logging.Level;
import org.bukkit.BanEntry;
import org.bukkit.BanList;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.OfflinePlayer;
import org.bukkit.World;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerKickEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

public abstract class AbstractBukkitBridgePlugin extends JavaPlugin implements Listener, BridgeRequestHandler {
  private BridgeServer bridgeServer;
  private BukkitTask metricsTask;
  private final Set<String> subscribedTopics = ConcurrentHashMap.newKeySet();

  @Override
  public void onEnable() {
    saveDefaultConfig();
    getServer().getPluginManager().registerEvents(this, this);
    try {
      this.bridgeServer = new BridgeServer(buildConfig(), getLogger(), this);
      this.bridgeServer.setReuseAddr(true);
      this.bridgeServer.start();
      getLogger().info("U-WBP bridge server started");
    } catch (Exception ex) {
      getLogger().log(Level.SEVERE, "Unable to start bridge server", ex);
      getServer().getPluginManager().disablePlugin(this);
      return;
    }
    startMetricsTask();
  }

  @Override
  public void onDisable() {
    if (metricsTask != null) {
      metricsTask.cancel();
    }
    if (bridgeServer != null) {
      try {
        bridgeServer.stop(0);
      } catch (Exception ex) {
        getLogger().log(Level.WARNING, "Error shutting down bridge server", ex);
      }
    }
  }

  protected abstract String getCoreName();

  protected abstract List<String> getExtraCapabilities();

  protected BridgeConfig buildConfig() {
    String bind = getConfig().getString("bridge.bindAddress", "0.0.0.0");
    int port = getConfig().getInt("bridge.port", 6250);
    String token = getConfig().getString("bridge.token", "change-me");
    String serverId = getConfig().getString("bridge.serverId", getServer().getName());
    String version = getConfig().getString("bridge.version", Bukkit.getVersion());
    Duration heartbeat = Duration.ofSeconds(getConfig().getInt("bridge.heartbeatSeconds", 30));
    return new BridgeConfig(bind, port, token, serverId, "Java", getCoreName(), version, heartbeat);
  }

  protected BridgeServer getBridgeServer() {
    return bridgeServer;
  }

  private void startMetricsTask() {
    metricsTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
      if (!subscribedTopics.contains("metrics.tps")) {
        return;
      }
      JsonObject metrics = new JsonObject();
      double[] tps = readServerTps();
      metrics.addProperty("tps", tps[0]);
      metrics.addProperty("mspt", Math.round((1000.0 / Math.max(tps[0], 0.0001)) * 100.0) / 100.0);
      metrics.addProperty("players", Bukkit.getOnlinePlayers().size());
      metrics.addProperty("maxPlayers", Bukkit.getMaxPlayers());
      broadcast("metrics.tps", metrics);
    }, 20L, 20L);
  }

  @Override
  public CompletableFuture<BridgeResponse> handle(BridgeRequest request) {
    switch (request.getCmd()) {
      case "getCapabilities":
        return CompletableFuture.completedFuture(BridgeResponse.success(buildCapabilitiesPayload()));
      case "getServerInfo":
        return supplySync(this::buildServerInfo);
      case "getPlayers":
        return supplySync(this::buildPlayers);
      case "getUsage":
        return supplySync(this::buildUsage);
      case "control":
        return supplySync(() -> handleControl(request.getData()));
      case "console.exec":
        return supplySync(() -> handleConsoleExec(request.getData()));
      case "subscribe":
        return CompletableFuture.completedFuture(handleSubscribe(request.getData()));
      default:
        return CompletableFuture.completedFuture(BridgeResponse.failure("unsupported command"));
    }
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
    JsonArray names = new JsonArray();
    subscribedTopics.forEach(names::add);
    data.add("topics", names);
    return BridgeResponse.success(data);
  }

  private BridgeResponse handleConsoleExec(JsonObject payload) {
    String command = payload != null && payload.has("command") ? payload.get("command").getAsString() : null;
    if (command == null || command.isEmpty()) {
      return BridgeResponse.failure("missing command");
    }
    CommandSender console = Bukkit.getConsoleSender();
    boolean success = Bukkit.dispatchCommand(console, command);
    JsonObject data = new JsonObject();
    data.addProperty("success", success);
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
        return handleConsoleExec(params);
      case "broadcast":
        String message = params.has("message") ? params.get("message").getAsString() : null;
        if (message == null) {
          return BridgeResponse.failure("missing message");
        }
        Bukkit.broadcastMessage(ChatColor.translateAlternateColorCodes('&', message));
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
      case "reloadServer":
        Bukkit.reload();
        return BridgeResponse.success(null);
      case "stopServer":
        Bukkit.shutdown();
        return BridgeResponse.success(null);
      default:
        return BridgeResponse.failure("unsupported action: " + action);
    }
  }

  private BridgeResponse setWeather(JsonObject params) {
    String target = params.has("weather") ? params.get("weather").getAsString() : "clear";
    World world = Bukkit.getWorlds().get(0);
    switch (target.toLowerCase()) {
      case "rain":
        world.setStorm(true);
        world.setThundering(false);
        break;
      case "thunder":
        world.setStorm(true);
        world.setThundering(true);
        break;
      default:
        world.setStorm(false);
        world.setThundering(false);
    }
    return BridgeResponse.success(null);
  }

  private BridgeResponse setTime(JsonObject params) {
    if (!params.has("time")) {
      return BridgeResponse.failure("missing time");
    }
    long time = params.get("time").getAsLong();
    World world = Bukkit.getWorlds().get(0);
    world.setTime(time);
    return BridgeResponse.success(null);
  }

  private BridgeResponse kickPlayer(JsonObject params) {
    if (!params.has("player")) {
      return BridgeResponse.failure("missing player");
    }
    String playerName = params.get("player").getAsString();
    String reason = params.has("reason") ? params.get("reason").getAsString() : "Kicked by an operator";
    Player player = Bukkit.getPlayerExact(playerName);
    if (player == null) {
      return BridgeResponse.failure("player not online");
    }
    player.kickPlayer(reason);
    return BridgeResponse.success(null);
  }

  private BridgeResponse toggleWhitelist(JsonObject params, boolean value) {
    if (!params.has("player")) {
      return BridgeResponse.failure("missing player");
    }
    OfflinePlayer offline = Bukkit.getOfflinePlayer(params.get("player").getAsString());
    offline.setWhitelisted(value);
    return BridgeResponse.success(null);
  }

  private BridgeResponse toggleBlacklist(JsonObject params, boolean value) {
    if (!params.has("player")) {
      return BridgeResponse.failure("missing player");
    }
    String player = params.get("player").getAsString();
    BanList banList = Bukkit.getBanList(BanList.Type.NAME);
    if (value) {
      BanEntry entry = banList.addBan(player, params.has("reason") ? params.get("reason").getAsString() : "Banned via bridge", null, null);
      JsonObject data = new JsonObject();
      data.addProperty("until", entry != null && entry.getExpiration() != null ? entry.getExpiration().toInstant().toEpochMilli() : 0);
      return BridgeResponse.success(data);
    } else {
      banList.pardon(player);
      return BridgeResponse.success(null);
    }
  }

  private BridgeResponse buildCapabilitiesPayload() {
    JsonObject data = new JsonObject();
    JsonArray caps = new JsonArray();
    Set<String> baseCaps = new HashSet<>();
    baseCaps.add("core.info");
    baseCaps.add("players.list");
    baseCaps.add("metrics.tps");
    baseCaps.add("control.runCommand");
    baseCaps.add("control.setWeather");
    baseCaps.add("control.setTime");
    baseCaps.add("control.broadcast");
    baseCaps.add("control.kickPlayer");
    baseCaps.add("lists.whitelist");
    baseCaps.add("lists.blacklist");
    baseCaps.add("console.exec");
    baseCaps.add("events.player");
    baseCaps.add("events.chat");
    baseCaps.add("events.metrics");
    baseCaps.addAll(getExtraCapabilities());
    baseCaps.forEach(caps::add);
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
    data.addProperty("name", getServer().getName());
    data.addProperty("style", "Java");
    data.addProperty("core", getCoreName());
    data.addProperty("version", Bukkit.getMinecraftVersion());
    data.addProperty("description", getServer().getMotd());
    data.addProperty("motd", getServer().getMotd());
    data.addProperty("maxPlayers", getServer().getMaxPlayers());
    data.addProperty("onlinePlayers", getServer().getOnlinePlayers().size());
    JsonArray plugins = new JsonArray();
    Arrays.stream(getServer().getPluginManager().getPlugins()).forEach(plugin -> {
      JsonObject info = new JsonObject();
      info.addProperty("name", plugin.getName());
      info.addProperty("version", plugin.getDescription().getVersion());
      plugins.add(info);
    });
    data.add("plugins", plugins);
    data.addProperty("whitelistEnabled", getServer().hasWhitelist());
    data.addProperty("geyserEnabled", Bukkit.getPluginManager().getPlugin("Geyser-Spigot") != null);
    data.addProperty("serverMode", getServer().getOnlineMode() ? "online" : "offline");
    return BridgeResponse.success(data);
  }

  private BridgeResponse buildPlayers() {
    JsonObject data = new JsonObject();
    JsonArray players = new JsonArray();
    for (Player player : Bukkit.getOnlinePlayers()) {
      JsonObject entry = new JsonObject();
      entry.addProperty("name", player.getName());
      entry.addProperty("uuid", player.getUniqueId().toString());
      entry.addProperty("ip", player.getAddress() != null ? player.getAddress().getAddress().getHostAddress() : "");
      entry.addProperty("platform", "Java");
      entry.addProperty("auth", getServer().getOnlineMode() ? "online" : "offline");
      entry.addProperty("ping", player.getPing());
      entry.addProperty("op", player.isOp());
      entry.addProperty("gamemode", player.getGameMode().name().toLowerCase());
      entry.addProperty("firstJoin", player.getFirstPlayed());
      entry.addProperty("lastSeen", player.getLastPlayed());
      players.add(entry);
    }
    data.addProperty("count", players.size());
    data.add("players", players);
    data.addProperty("maxPlayers", Bukkit.getMaxPlayers());
    return BridgeResponse.success(data);
  }

  private BridgeResponse buildUsage() {
    JsonObject data = new JsonObject();
    double[] tps = readServerTps();
    data.addProperty("tps", tps[0]);
    Runtime runtime = Runtime.getRuntime();
    double used = (runtime.totalMemory() - runtime.freeMemory()) / 1048576.0;
    double max = runtime.maxMemory() / 1048576.0;
    data.addProperty("memory", Math.round((used / max) * 10000.0) / 100.0);
    data.addProperty("cpu", -1);
    data.addProperty("tickTime", Math.round((1000.0 / Math.max(tps[0], 0.0001)) * 100.0) / 100.0);
    data.addProperty("threads", Thread.activeCount());
    data.addProperty("uptime", System.currentTimeMillis() - ManagementFactory.getRuntimeMXBean().getStartTime());
    return BridgeResponse.success(data);
  }

  private double[] readServerTps() {
    try {
      return Bukkit.getServer().getTPS();
    } catch (NoSuchMethodError err) {
      try {
        Object spigot = Bukkit.getServer().getClass().getMethod("getServer").invoke(Bukkit.getServer());
        double[] values = (double[]) spigot.getClass().getField("recentTps").get(spigot);
        return values != null ? values : new double[] {20.0, 20.0, 20.0};
      } catch (Exception ignored) {
        return new double[] {20.0, 20.0, 20.0};
      }
    }
  }

  private void broadcast(String cmd, JsonObject payload) {
    if (bridgeServer != null) {
      bridgeServer.broadcast(cmd, payload);
    }
  }

  protected void emitPlayerEvent(String type, Player player) {
    if (!subscribedTopics.contains("players.activity")) {
      return;
    }
    JsonObject data = new JsonObject();
    data.addProperty("eventId", UUID.randomUUID().toString());
    data.addProperty("timestamp", System.currentTimeMillis());
    data.addProperty("type", type);
    JsonObject playerData = new JsonObject();
    playerData.addProperty("name", player.getName());
    playerData.addProperty("uuid", player.getUniqueId().toString());
    playerData.addProperty("ip", player.getAddress() != null ? player.getAddress().getAddress().getHostAddress() : "");
    data.add("player", playerData);
    broadcast("events.player", data);
  }

  protected void emitChatEvent(Player player, String message) {
    if (!subscribedTopics.contains("chat.ingame")) {
      return;
    }
    JsonObject data = new JsonObject();
    data.addProperty("eventId", UUID.randomUUID().toString());
    data.addProperty("timestamp", System.currentTimeMillis());
    data.addProperty("player", player.getName());
    data.addProperty("uuid", player.getUniqueId().toString());
    data.addProperty("message", message);
    broadcast("events.chat", data);
  }

  @EventHandler
  public void onPlayerJoin(PlayerJoinEvent event) {
    emitPlayerEvent("join", event.getPlayer());
  }

  @EventHandler
  public void onPlayerQuit(PlayerQuitEvent event) {
    emitPlayerEvent("quit", event.getPlayer());
  }

  @EventHandler
  public void onPlayerKick(PlayerKickEvent event) {
    emitPlayerEvent("kick", event.getPlayer());
  }

  @EventHandler
  public void onChat(AsyncPlayerChatEvent event) {
    emitChatEvent(event.getPlayer(), event.getMessage());
  }

  private CompletableFuture<BridgeResponse> supplySync(Supplier<BridgeResponse> supplier) {
    CompletableFuture<BridgeResponse> future = new CompletableFuture<>();
    Bukkit.getScheduler().runTask(this, () -> {
      try {
        future.complete(supplier.get());
      } catch (Throwable throwable) {
        future.completeExceptionally(throwable);
      }
    });
    return future;
  }
}
