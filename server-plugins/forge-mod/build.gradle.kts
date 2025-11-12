plugins {
  `java`
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(17))
  }
}

dependencies {
  implementation(project(":common"))
  compileOnly("net.minecraftforge:forge:1.20.1-47.1.3:server")
}
