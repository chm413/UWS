package net.minecraft.server.level;

import com.mojang.authlib.GameProfile;
import java.util.UUID;
import net.minecraft.network.chat.Component;

public class ServerPlayer {
  private final GameProfile profile;
  public final Connection connection = new Connection();
  public final ServerGameMode gameMode = new ServerGameMode();
  private String ipAddress = "";

  public ServerPlayer(GameProfile profile) {
    this.profile = profile;
  }

  public GameProfile getGameProfile() {
    return profile;
  }

  public UUID getUUID() {
    return profile.getId();
  }

  public String getIpAddress() {
    return ipAddress;
  }

  public void setIpAddress(String ipAddress) {
    this.ipAddress = ipAddress;
  }

  public String getScoreboardName() {
    return profile.getName();
  }

  public static class Connection {
    public int latency;

    public void disconnect(Component reason) {}
  }

  public static class ServerGameMode {
    public GameType getGameModeForPlayer() {
      return GameType.SURVIVAL;
    }
  }

  public enum GameType {
    SURVIVAL("survival");

    private final String name;

    GameType(String name) {
      this.name = name;
    }

    public String getName() {
      return name;
    }
  }
}
