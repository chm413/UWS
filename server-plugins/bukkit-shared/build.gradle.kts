plugins {
  `java-library`
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(17))
  }
  withSourcesJar()
}

dependencies {
  api(project(":common"))
  compileOnly("io.papermc.paper:paper-api:1.20.4-R0.1-SNAPSHOT")
}
