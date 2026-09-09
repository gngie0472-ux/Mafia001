module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // يجب أن يظل plugin الخاص بـ reanimated في نهاية القائمة دائماً
      'react-native-reanimated/plugin',
    ],
  };
};
