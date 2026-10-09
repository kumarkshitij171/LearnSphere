import { env } from '@/config/env';
import { devicesApi } from '@/lib/api';

// Web push through FCM. The Firebase SDK is loaded only when someone turns push on, so it never
// weighs on a page load; the service worker gets its config through the registration URL.

const TOKEN_KEY = 'ls-push-token';
const SW_PATH = '/firebase-messaging-sw.js';

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

const config = () => {
  const { apiKey, projectId, messagingSenderId, appId, vapidKey } = env.firebase;
  return apiKey && projectId && messagingSenderId && appId && vapidKey
    ? { apiKey, projectId, messagingSenderId, appId, vapidKey }
    : null;
};

const storedToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export function pushState(): PushState {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (!config()) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && storedToken() ? 'on' : 'off';
}

/** Must run from a click: browsers only show the permission prompt for a user gesture. */
export async function enablePush(): Promise<PushState> {
  const cfg = config();
  if (!cfg) return 'unconfigured';
  if ((await Notification.requestPermission()) !== 'granted') return pushState();

  const { vapidKey, ...firebaseConfig } = cfg;
  const registration = await navigator.serviceWorker.register(
    `${SW_PATH}?config=${encodeURIComponent(JSON.stringify(firebaseConfig))}`
  );
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('The browser did not issue a push token.');

  await devicesApi.register(token, 'WEB');
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode: registration still worked, the toggle just will not remember it
  }
  return 'on';
}

/** On sign-out, or when the user turns push off: stop pushing to this browser. Never throws. */
export async function disablePush(): Promise<void> {
  const token = storedToken();
  if (!token) return;
  try {
    await devicesApi.remove(token);
  } catch {
    // already signed out or offline: the server deactivates dead tokens on the next send anyway
  }
  try {
    const cfg = config();
    if (cfg) {
      const [{ initializeApp, getApps }, { getMessaging, deleteToken }] = await Promise.all([
        import('firebase/app'),
        import('firebase/messaging'),
      ]);
      const { vapidKey: _unused, ...firebaseConfig } = cfg;
      await deleteToken(getMessaging(getApps()[0] ?? initializeApp(firebaseConfig)));
    }
  } catch {
    // best effort
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}
