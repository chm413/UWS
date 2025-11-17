package com.uws.bridge.bukkitcore;

import com.uws.bridge.bukkit.AbstractBukkitBridgePlugin;
import java.util.List;

public class BukkitBridgePlugin extends AbstractBukkitBridgePlugin {
  @Override
  protected String getCoreName() {
    return "Bukkit";
  }

  @Override
  protected List<String> getExtraCapabilities() {
    return List.of();
  }
}
