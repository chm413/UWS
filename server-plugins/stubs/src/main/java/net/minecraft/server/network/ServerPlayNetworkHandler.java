package net.minecraft.server.network;

import net.minecraft.server.level.ServerPlayer;

public class ServerPlayNetworkHandler {
  public final ServerPlayer player;

  public ServerPlayNetworkHandler(ServerPlayer player) {
    this.player = player;
  }
}
