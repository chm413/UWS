package net.neoforged.neoforge.event;

import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

public class ServerChatEvent {
  private final ServerPlayer player;
  private final Component message;

  public ServerChatEvent(ServerPlayer player, Component message) {
    this.player = player;
    this.message = message;
  }

  public ServerPlayer getPlayer() {
    return player;
  }

  public Component getMessage() {
    return message;
  }
}
