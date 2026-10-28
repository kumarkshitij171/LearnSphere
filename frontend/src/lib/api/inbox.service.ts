import { notificationClient } from './client';
import { endpoints } from './endpoints';

export interface InboxItem {
  id: string;
  notificationId: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  unread: number;
}

/** The signed-in user comes from the access token; notification-service never takes a user id here. */
export const inboxApi = {
  async list(limit = 30): Promise<InboxPage> {
    const { data } = await notificationClient.get(endpoints.inbox.list, { params: { limit } });
    return { items: data?.items ?? [], unread: data?.unread ?? 0 };
  },
  /** No ids marks everything read. Returns how many are still unread. */
  async markRead(ids?: string[]): Promise<number> {
    const { data } = await notificationClient.post(endpoints.inbox.read, ids?.length ? { ids } : {});
    return data?.unread ?? 0;
  },
};
