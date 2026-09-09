module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // دعم الـ Inline Environment Variables لـ Expo
      'transform-inline-environment-variables',
      // إضافة Reanimated plugin في النهاية دائماً إذا كنت تستخدمه في المشروع
      'react-native-reanimated/plugin',
    ],
  };
};
