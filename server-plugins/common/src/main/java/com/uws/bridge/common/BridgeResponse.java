package com.uws.bridge.common;

import com.google.gson.JsonObject;

public class BridgeResponse {
  private final String status;
  private final String message;
  private final JsonObject data;

  private BridgeResponse(String status, String message, JsonObject data) {
    this.status = status;
    this.message = message;
    this.data = data;
  }

  public static BridgeResponse success(JsonObject data) {
    return new BridgeResponse("success", null, data);
  }

  public static BridgeResponse failure(String message) {
    return new BridgeResponse("fail", message, null);
  }

  public static BridgeResponse error(String message) {
    return new BridgeResponse("error", message, null);
  }

  public String getStatus() {
    return status;
  }

  public String getMessage() {
    return message;
  }

  public JsonObject getData() {
    return data;
  }
}
