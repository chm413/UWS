package com.uws.bridge.common;

import java.util.concurrent.CompletableFuture;

public interface BridgeRequestHandler {
  CompletableFuture<BridgeResponse> handle(BridgeRequest request);
}
