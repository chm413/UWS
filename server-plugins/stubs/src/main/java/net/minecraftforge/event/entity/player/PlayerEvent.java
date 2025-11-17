package net.minecraftforge.event.entity.player;

import net.minecraft.server.level.ServerPlayer;

public class PlayerEvent {
  private final ServerPlayer player;

  public PlayerEvent(ServerPlayer player) {
    this.player = player;
  }

  public ServerPlayer getEntity() {
    return player;
  }

  public static class PlayerLoggedInEvent extends PlayerEvent {
    public PlayerLoggedInEvent(ServerPlayer player) {
      super(player);
    }
  }

  public static class PlayerLoggedOutEvent extends PlayerEvent {
    public PlayerLoggedOutEvent(ServerPlayer player) {
      super(player);
    }
  }

  public static class PlayerRespawnEvent extends PlayerEvent {
    public PlayerRespawnEvent(ServerPlayer player) {
      super(player);
    }
  }
}
