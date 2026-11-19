// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  {
    ignores: ['.expo/**', '.expo-home/**', 'node_modules/**', 'android/**', 'ios/**', 'dist/**', '.gradle-home/**'],
  },
  expoConfig,
]);
