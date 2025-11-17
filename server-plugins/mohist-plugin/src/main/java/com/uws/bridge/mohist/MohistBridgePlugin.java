package com.uws.bridge.mohist;

import com.uws.bridge.bukkit.AbstractBukkitBridgePlugin;
import java.util.List;

public class MohistBridgePlugin extends AbstractBukkitBridgePlugin {
  @Override
  protected String getCoreName() {
    return "Mohist";
  }

  @Override
  protected List<String> getExtraCapabilities() {
    return List.of("ext.mohist.forgeBridge");
  }
}
