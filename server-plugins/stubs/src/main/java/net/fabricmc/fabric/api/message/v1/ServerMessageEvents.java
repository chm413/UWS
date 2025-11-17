package net.fabricmc.fabric.api.message.v1;

import net.minecraft.network.chat.MessageType;
import net.minecraft.network.chat.SignedMessage;
import net.minecraft.server.level.ServerPlayer;

public final class ServerMessageEvents {
  private ServerMessageEvents() {}

  public static final Chat CHAT = new Chat();

  public static class Chat {
    public void register(ChatCallback callback) {}
  }

  @FunctionalInterface
  public interface ChatCallback {
    void onChat(SignedMessage message, ServerPlayer player, MessageType.Parameters parameters);
  }
}
