@rem
@rem Gradle start-up script for Windows.
@rem
@echo off
setlocal

set APP_HOME=%~dp0
set CLASSPATH=%APP_HOME%gradle\wrapper\gradle-wrapper.jar

if not exist "%CLASSPATH%" (
  echo gradle-wrapper.jar is missing.
  echo Open the android/ folder in Android Studio to auto-generate it,
  echo or run: gradle wrapper --gradle-version 8.9
  exit /b 1
)

java -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
