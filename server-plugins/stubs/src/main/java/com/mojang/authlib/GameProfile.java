package com.mojang.authlib;

import java.util.Objects;
import java.util.UUID;

public class GameProfile {
  private final UUID id;
  private final String name;

  public GameProfile(UUID id, String name) {
    this.id = id;
    this.name = name;
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (!(o instanceof GameProfile)) {
      return false;
    }
    GameProfile that = (GameProfile) o;
    return Objects.equals(id, that.id);
  }

  @Override
  public int hashCode() {
    return Objects.hashCode(id);
  }
}
