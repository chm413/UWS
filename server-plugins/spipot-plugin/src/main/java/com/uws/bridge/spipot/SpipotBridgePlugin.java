package com.uws.bridge.spipot;

import com.uws.bridge.bukkit.AbstractBukkitBridgePlugin;
import java.util.List;

public class SpipotBridgePlugin extends AbstractBukkitBridgePlugin {
  @Override
  protected String getCoreName() {
    return "Spipot";
  }

  @Override
  protected List<String> getExtraCapabilities() {
    return List.of("ext.spipot.optimizations");
  }
}
