package net.minecraft.network.chat;

public class Component {
  private final String text;

  private Component(String text) {
    this.text = text;
  }

  public static Component literal(String text) {
    return new Component(text);
  }

  public String getString() {
    return text;
  }
}
