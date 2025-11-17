package com.uws.bridge.common;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;
import java.util.logging.Logger;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

public class BridgeServer extends WebSocketServer {
  private static final String SCHEMA = "uwbp/v2";

  private final BridgeConfig config;
  private final Logger logger;
  private final BridgeRequestHandler handler;
  private final Gson gson = new Gson();
  private final Map<WebSocket, ClientContext> clients = new ConcurrentHashMap<>();

  private static class ClientContext {
    boolean authorized;
  }

  public BridgeServer(BridgeConfig config, Logger logger, BridgeRequestHandler handler) {
    super(new InetSocketAddress(config.getBindAddress(), config.getPort()));
    this.config = config;
    this.logger = logger;
    this.handler = handler;
  }

  @Override
  public void onOpen(WebSocket conn, ClientHandshake handshake) {
    clients.put(conn, new ClientContext());
    logger.info(() -> "Bridge client connected from " + conn.getRemoteSocketAddress());
  }

  @Override
  public void onClose(WebSocket conn, int code, String reason, boolean remote) {
    clients.remove(conn);
    logger.info(() -> "Bridge client disconnected: " + reason);
  }

  @Override
  public void onMessage(WebSocket conn, String message) {
    try {
      JsonObject payload = gson.fromJson(message, JsonObject.class);
      handleMessage(conn, payload);
    } catch (Exception ex) {
      logger.log(Level.WARNING, "Failed to parse bridge payload", ex);
    }
  }

  @Override
  public void onError(WebSocket conn, Exception ex) {
    logger.log(Level.SEVERE, "Bridge websocket error", ex);
  }

  @Override
  public void onStart() {
    logger.info(() -> "Bridge server listening on " + config.getBindAddress() + ":" + config.getPort());
  }

  private void handleMessage(WebSocket conn, JsonObject message) {
    String cmd = message.has("cmd") ? message.get("cmd").getAsString() : null;
    String requestId = message.has("requestId") ? message.get("requestId").getAsString() : UUID.randomUUID().toString();
    if (cmd == null) {
      return;
    }

    ClientContext context = clients.get(conn);
    if (context == null) {
      return;
    }

    if ("auth".equals(cmd)) {
      String token = message.has("data") && message.getAsJsonObject("data").has("token")
          ? message.getAsJsonObject("data").get("token").getAsString()
          : null;
      if (!config.getToken().equals(token)) {
        sendResponse(conn, requestId, cmd, "unauthorized", null, "invalid token");
        conn.close(4001, "unauthorized");
        return;
      }
      context.authorized = true;
      JsonObject data = new JsonObject();
      data.addProperty("serverId", config.getServerId());
      data.addProperty("style", config.getStyle());
      data.addProperty("core", config.getCore());
      data.addProperty("version", config.getVersion());
      data.addProperty("reportMode", "mixed");
      sendResponse(conn, requestId, cmd, "success", data, null);
      return;
    }

    if (!context.authorized) {
      sendResponse(conn, requestId, cmd, "unauthorized", null, "auth required");
      return;
    }

    if ("ping".equals(cmd)) {
      JsonObject data = new JsonObject();
      data.addProperty("time", Instant.now().toEpochMilli());
      sendResponse(conn, requestId, "pong", "success", data, null);
      return;
    }

    JsonObject data = message.has("data") && message.get("data").isJsonObject()
        ? message.getAsJsonObject("data")
        : new JsonObject();

    BridgeRequest request = new BridgeRequest(cmd, message.has("mode") ? message.get("mode").getAsString() : "request", requestId, data);
    try {
      CompletableFuture<BridgeResponse> future = handler.handle(request);
      future.whenComplete((response, error) -> {
        if (error != null) {
          logger.log(Level.WARNING, "Bridge request failed", error);
          sendResponse(conn, requestId, cmd, "error", null, error.getMessage());
          return;
        }
        String status = response != null ? response.getStatus() : "error";
        sendResponse(conn, requestId, cmd, status, response != null ? response.getData() : null, response != null ? response.getMessage() : null);
      });
    } catch (Exception ex) {
      logger.log(Level.SEVERE, "Bridge handler failure", ex);
      sendResponse(conn, requestId, cmd, "error", null, ex.getMessage());
    }
  }

  private void sendResponse(WebSocket conn, String requestId, String cmd, String status, JsonObject data, String message) {
    JsonObject response = new JsonObject();
    response.addProperty("schema", SCHEMA);
    response.addProperty("mode", "response");
    response.addProperty("requestId", requestId);
    response.addProperty("cmd", cmd);
    response.addProperty("status", status);
    response.addProperty("timestamp", Instant.now().toEpochMilli());
    if (data != null) {
      response.add("data", data);
    }
    if (message != null) {
      response.addProperty("msg", message);
    }
    conn.send(gson.toJson(response));
  }

  public void broadcast(String cmd, JsonObject data) {
    JsonObject payload = new JsonObject();
    payload.addProperty("schema", SCHEMA);
    payload.addProperty("mode", "push");
    payload.addProperty("cmd", cmd);
    payload.addProperty("status", "success");
    payload.addProperty("timestamp", Instant.now().toEpochMilli());
    payload.addProperty("requestId", UUID.randomUUID().toString());
    if (data != null) {
      payload.add("data", data);
    }
    String serialized = gson.toJson(payload);
    clients.forEach((socket, ctx) -> {
      if (ctx.authorized && socket.isOpen()) {
        socket.send(serialized);
      }
    });
  }
}
