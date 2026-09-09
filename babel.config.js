module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // تم حذف إضافة transform-inline-environment-variables لتجنب خطأ البناء
      // يجب أن يظل plugin الخاص بـ reanimated في نهاية القائمة دائماً
      'react-native-reanimated/plugin',
    ],
  };
};
