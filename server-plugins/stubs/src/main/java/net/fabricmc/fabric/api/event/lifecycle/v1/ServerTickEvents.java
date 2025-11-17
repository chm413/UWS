package net.fabricmc.fabric.api.event.lifecycle.v1;

import net.minecraft.server.MinecraftServer;

public final class ServerTickEvents {
  private ServerTickEvents() {}

  public static final EndTick END_SERVER_TICK = new EndTick();

  public static class EndTick {
    public void register(ServerTickCallback callback) {}
  }

  @FunctionalInterface
  public interface ServerTickCallback {
    void onEndTick(MinecraftServer server);
  }
}
