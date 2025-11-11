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
  compileOnly("net.neoforged:neoforge:20.2.86:server")
}
