package org.apache.logging.log4j;

public final class LogManager {
  private static final Logger NO_OP = new Logger() {};

  private LogManager() {}

  public static Logger getLogger(String name) {
    return NO_OP;
  }
}
