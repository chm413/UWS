package net.minecraft.server.players;

import com.mojang.authlib.GameProfile;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

public class PlayerList {
  private final List<ServerPlayer> players = new ArrayList<>();
  private final UserWhiteList whiteList = new UserWhiteList();
  private final UserBanList banList = new UserBanList();
  private int maxPlayers = 20;

  public boolean isUsingWhitelist() {
    return !whiteList.isEmpty();
  }

  public List<ServerPlayer> getPlayers() {
    return Collections.unmodifiableList(players);
  }

  public ServerPlayer getPlayerByName(String name) {
    return players.stream().filter(p -> p.getGameProfile().getName().equalsIgnoreCase(name)).findFirst().orElse(null);
  }

  public void broadcastSystemMessage(Component message, boolean actionBar) {}

  public UserWhiteList getWhiteList() {
    return whiteList;
  }

  public UserBanList getBans() {
    return banList;
  }

  public int getMaxPlayers() {
    return maxPlayers;
  }

  public void setMaxPlayers(int maxPlayers) {
    this.maxPlayers = maxPlayers;
  }

  public void addPlayer(ServerPlayer player) {
    players.add(player);
  }

  public void removePlayer(ServerPlayer player) {
    players.remove(player);
  }

  public static class UserWhiteList {
    private final List<UserWhiteListEntry> entries = new ArrayList<>();

    public void add(UserWhiteListEntry entry) {
      entries.add(entry);
    }

    public void remove(GameProfile profile) {
      entries.removeIf(e -> e.getProfile().equals(profile));
    }

    public boolean isEmpty() {
      return entries.isEmpty();
    }
  }

  public static class UserBanList {
    private final List<UserBanListEntry> entries = new ArrayList<>();

    public void add(UserBanListEntry entry) {
      entries.add(entry);
    }

    public void remove(GameProfile profile) {
      entries.removeIf(e -> e.getProfile().equals(profile));
    }

    public boolean isEmpty() {
      return entries.isEmpty();
    }
  }
}
