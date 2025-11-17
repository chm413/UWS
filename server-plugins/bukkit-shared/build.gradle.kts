plugins {
  `java-library`
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(21))
  }
  withSourcesJar()
}

dependencies {
  api(project(":common"))
  compileOnly("io.papermc.paper:paper-api:1.20.4-R0.1-SNAPSHOT")
  compileOnly("me.clip:placeholderapi:2.11.5")
  compileOnly("net.luckperms:api:5.4")
  compileOnly("com.github.MilkBowl:VaultAPI:1.7")
}
