plugins {
  `java`
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(21))
  }
}

dependencies {
  implementation(project(":common"))

  compileOnly("net.fabricmc:fabric-loader:0.15.11")
  compileOnly("net.fabricmc.fabric-api:fabric-api:0.96.11+1.20.4")
}
