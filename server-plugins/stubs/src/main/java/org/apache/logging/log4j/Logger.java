package org.apache.logging.log4j;

public interface Logger {
  default void info(String message) {}
  default void error(String message) {}
  default void error(String message, Throwable throwable) {}
  default void warn(String message) {}
}
