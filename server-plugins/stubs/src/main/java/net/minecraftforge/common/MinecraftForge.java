package net.minecraftforge.common;

import net.minecraftforge.eventbus.api.EventBus;

public final class MinecraftForge {
  private MinecraftForge() {}

  public static final EventBus EVENT_BUS = new EventBus();
}
