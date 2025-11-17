package net.minecraft.server.players;

import com.mojang.authlib.GameProfile;

public class UserWhiteListEntry {
  private final GameProfile profile;

  public UserWhiteListEntry(GameProfile profile) {
    this.profile = profile;
  }

  public GameProfile getProfile() {
    return profile;
  }
}
