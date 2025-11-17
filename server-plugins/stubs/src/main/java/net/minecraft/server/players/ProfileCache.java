package net.minecraft.server.players;

import com.mojang.authlib.GameProfile;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public class ProfileCache {
  private final Map<String, GameProfile> profiles = new HashMap<>();

  public Optional<GameProfile> get(String name) {
    return Optional.ofNullable(profiles.get(name));
  }

  public void put(GameProfile profile) {
    profiles.put(profile.getName(), profile);
  }
}
