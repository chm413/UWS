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
  compileOnly("net.minecraftforge:forge:1.20.1-47.1.3:server")
}
