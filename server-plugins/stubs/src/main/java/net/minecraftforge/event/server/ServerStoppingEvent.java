package net.minecraftforge.event.server;

import net.minecraft.server.MinecraftServer;

public class ServerStoppingEvent {
  private final MinecraftServer server;

  public ServerStoppingEvent(MinecraftServer server) {
    this.server = server;
  }

  public MinecraftServer getServer() {
    return server;
  }
}
