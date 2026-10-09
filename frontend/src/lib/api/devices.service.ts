import { notificationClient } from './client';
import { endpoints } from './endpoints';

export type DevicePlatform = 'WEB' | 'ANDROID' | 'IOS';

/** The signed-in user is taken from the access token by notification-service, never sent here. */
export const devicesApi = {
  register(token: string, platform: DevicePlatform = 'WEB') {
    return notificationClient.post(endpoints.devices.register, { token, platform });
  },
  remove(token: string) {
    return notificationClient.delete(endpoints.devices.byToken(token));
  },
};
