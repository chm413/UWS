package net.fabricmc.fabric.api.event.lifecycle.v1;

import net.minecraft.server.MinecraftServer;

public final class ServerLifecycleEvents {
  private ServerLifecycleEvents() {}

  public static final Event<ServerStarting> SERVER_STARTING = new Event<>();
  public static final Event<ServerStopping> SERVER_STOPPING = new Event<>();

  public interface ServerStarting {
    void onServerStarting(MinecraftServer server);
  }

  public interface ServerStopping {
    void onServerStopping(MinecraftServer server);
  }

  public static class Event<T> {
    public void register(T listener) {}
  }
}
