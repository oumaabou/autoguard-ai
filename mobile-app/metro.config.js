// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Metro doesn't know how to bundle .tflite files by default - it only treats
// registered "assetExts" as binary assets to copy as-is. Without this, an
// import/require() of autoguard_model.tflite would be (incorrectly) run
// through the JS transformer and fail to bundle.
config.resolver.assetExts.push("tflite");

module.exports = config;
