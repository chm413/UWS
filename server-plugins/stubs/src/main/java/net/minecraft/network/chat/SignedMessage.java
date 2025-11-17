package net.minecraft.network.chat;

public class SignedMessage {
  private final Component content;

  public SignedMessage(Component content) {
    this.content = content;
  }

  public Component getContent() {
    return content;
  }
}
