package com.uws.bridge.common;

import com.google.gson.JsonObject;

public class BridgeRequest {
  private final String cmd;
  private final String mode;
  private final String requestId;
  private final JsonObject data;

  public BridgeRequest(String cmd, String mode, String requestId, JsonObject data) {
    this.cmd = cmd;
    this.mode = mode;
    this.requestId = requestId;
    this.data = data;
  }

  public String getCmd() {
    return cmd;
  }

  public String getMode() {
    return mode;
  }

  public String getRequestId() {
    return requestId;
  }

  public JsonObject getData() {
    return data;
  }
}
