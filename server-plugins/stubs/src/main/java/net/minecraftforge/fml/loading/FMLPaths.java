package net.minecraftforge.fml.loading;

import java.nio.file.Path;

public enum FMLPaths {
  CONFIGDIR;

  public Path get() {
    return Path.of("config");
  }
}
