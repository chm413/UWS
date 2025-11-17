package net.fabricmc.fabric.api.networking.v1;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.ServerPlayNetworkHandler;

public final class ServerPlayConnectionEvents {
  private ServerPlayConnectionEvents() {}

  public static final Join JOIN = new Join();
  public static final Disconnect DISCONNECT = new Disconnect();

  public static class Join {
    public void register(JoinCallback callback) {}
  }

  public static class Disconnect {
    public void register(DisconnectCallback callback) {}
  }

  @FunctionalInterface
  public interface JoinCallback {
    void onJoin(ServerPlayNetworkHandler handler, Object sender, MinecraftServer server);
  }

  @FunctionalInterface
  public interface DisconnectCallback {
    void onDisconnect(ServerPlayNetworkHandler handler, MinecraftServer server);
  }
}
