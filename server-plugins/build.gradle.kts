import org.gradle.api.plugins.JavaPlugin
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.api.tasks.compile.JavaCompile
import org.gradle.jvm.toolchain.JavaLanguageVersion


plugins {
  base
}

subprojects {
  plugins.withType<JavaPlugin> {
    extensions.configure(JavaPluginExtension::class) {
      toolchain.languageVersion.set(JavaLanguageVersion.of(21))
    }
    tasks.withType(JavaCompile::class.java).configureEach {
      options.release.set(17)
    }
  }

  repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
    maven("https://libraries.minecraft.net/")
    maven("https://repo.extendedclip.com/content/repositories/placeholderapi/")
    maven("https://jitpack.io")
  }
}
