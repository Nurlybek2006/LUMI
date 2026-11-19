module.exports = ({ config }) => {
  const isDevelopment = process.env.APP_VARIANT === 'development';
  return {
    ...config,
    android: {
      ...config.android,
      blockedPermissions: isDevelopment ? [] : [
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'com.google.android.c2dm.permission.RECEIVE'
      ]
    }
  };
};
