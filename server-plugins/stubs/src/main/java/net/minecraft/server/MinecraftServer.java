package net.minecraft.server;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.players.PlayerList;
import net.minecraft.server.players.ProfileCache;

public class MinecraftServer {
  private final PlayerList playerList = new PlayerList();
  private final Commands commands = new Commands();
  private final ProfileCache profileCache = new ProfileCache();
  private final long startTime = System.currentTimeMillis();

  public void execute(Runnable runnable) {
    runnable.run();
  }

  public String getServerModName() {
    return "stub";
  }

  public String getServerVersion() {
    return "0.0.0";
  }

  public String getMotd() {
    return "";
  }

  public int getMaxPlayers() {
    return playerList.getMaxPlayers();
  }

  public int getPlayerCount() {
    return playerList.getPlayers().size();
  }

  public PlayerList getPlayerList() {
    return playerList;
  }

  public boolean usesAuthentication() {
    return false;
  }

  public double getAverageTickTime() {
    return 50.0;
  }

  public long getStartTime() {
    return startTime;
  }

  public CommandSourceStack createCommandSourceStack() {
    return new CommandSourceStack();
  }

  public Commands getCommands() {
    return commands;
  }

  public void halt(boolean immediately) {}

  public ServerLevel overworld() {
    return new ServerLevel();
  }

  public ProfileCache getProfileCache() {
    return profileCache;
  }

  public boolean isDedicatedServer() {
    return true;
  }
}
