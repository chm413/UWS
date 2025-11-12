package com.uws.bridge.paper;

import com.uws.bridge.bukkit.AbstractBukkitBridgePlugin;
import java.util.List;

public class PaperBridgePlugin extends AbstractBukkitBridgePlugin {
  @Override
  protected String getCoreName() {
    return "Paper";
  }

  @Override
  protected List<String> getExtraCapabilities() {
    return List.of("ext.paper.asyncChunks", "ext.paper.timings");
  }
}
