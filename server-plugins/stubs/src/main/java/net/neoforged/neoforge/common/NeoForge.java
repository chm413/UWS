package net.neoforged.neoforge.common;

import net.neoforged.bus.api.EventBus;

public final class NeoForge {
  private NeoForge() {}

  public static final EventBus EVENT_BUS = new EventBus();
}
