package net.minecraft.server.players;

import com.mojang.authlib.GameProfile;

public class UserBanListEntry {
  private final GameProfile profile;

  public UserBanListEntry(GameProfile profile, Object created, String source, Object expires, String reason) {
    this.profile = profile;
  }

  public GameProfile getProfile() {
    return profile;
  }
}
