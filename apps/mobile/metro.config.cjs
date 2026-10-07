const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The legacy Next app uses a different React patch than the native renderer.
// Every React import inside the mobile bundle must resolve to mobile's copy,
// including imports made from hoisted react-native and workspace packages.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    return context.resolveRequest(context, require.resolve(moduleName, { paths: [__dirname] }), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
