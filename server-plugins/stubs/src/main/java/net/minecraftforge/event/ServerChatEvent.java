package net.minecraftforge.event;

public class ServerChatEvent {
  private final String username;
  private final String message;

  public ServerChatEvent(String username, String message) {
    this.username = username;
    this.message = message;
  }

  public String getUsername() {
    return username;
  }

  public String getMessage() {
    return message;
  }
}
