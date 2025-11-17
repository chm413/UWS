plugins {
  `java-library`
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(21))
  }
}

dependencies {
  api("com.google.code.gson:gson:2.10.1")
  api("org.java-websocket:Java-WebSocket:1.5.3")
}
