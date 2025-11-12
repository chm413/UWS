package com.uws.bridge.common;

import java.time.Duration;
import java.util.Objects;

public class BridgeConfig {
  private final String bindAddress;
  private final int port;
  private final String token;
  private final String serverId;
  private final String style;
  private final String core;
  private final String version;
  private final Duration heartbeatInterval;

  public BridgeConfig(
      String bindAddress,
      int port,
      String token,
      String serverId,
      String style,
      String core,
      String version,
      Duration heartbeatInterval) {
    this.bindAddress = Objects.requireNonNull(bindAddress, "bindAddress");
    this.port = port;
    this.token = Objects.requireNonNull(token, "token");
    this.serverId = Objects.requireNonNull(serverId, "serverId");
    this.style = Objects.requireNonNull(style, "style");
    this.core = Objects.requireNonNull(core, "core");
    this.version = Objects.requireNonNull(version, "version");
    this.heartbeatInterval = heartbeatInterval != null ? heartbeatInterval : Duration.ofSeconds(30);
  }

  public String getBindAddress() {
    return bindAddress;
  }

  public int getPort() {
    return port;
  }

  public String getToken() {
    return token;
  }

  public String getServerId() {
    return serverId;
  }

  public String getStyle() {
    return style;
  }

  public String getCore() {
    return core;
  }

  public String getVersion() {
    return version;
  }

  public Duration getHeartbeatInterval() {
    return heartbeatInterval;
  }
}
