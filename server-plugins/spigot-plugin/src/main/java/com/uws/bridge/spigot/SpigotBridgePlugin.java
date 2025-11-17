package com.uws.bridge.spigot;

import com.uws.bridge.bukkit.AbstractBukkitBridgePlugin;
import java.util.List;

public class SpigotBridgePlugin extends AbstractBukkitBridgePlugin {
  @Override
  protected String getCoreName() {
    return "Spigot";
  }

  @Override
  protected List<String> getExtraCapabilities() {
    return List.of("ext.spigot.legacyApi");
  }
}
