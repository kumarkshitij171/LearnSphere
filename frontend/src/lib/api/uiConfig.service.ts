import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { UiConfig } from '@/lib/ui-config';

export interface UiConfigProblem {
  /** JSON pointer, e.g. /navigation/sidebar/3/href */
  path: string;
  message: string;
}

export interface UiConfigVersionMeta {
  version: number;
  message: string;
  checksum: string;
  basedOn: number | null;
  rollbackOf: number | null;
  schemaVersion: number;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface UiConfigVersionDetail extends UiConfigVersionMeta {
  config: UiConfig;
}

export interface UiConfigDraft {
  authorId: string;
  baseVersion: number;
  config: unknown;
  updatedAt: string;
}

export interface UiConfigAdminView {
  published: UiConfigVersionDetail | null;
  draft: UiConfigDraft | null;
}

export interface UiConfigHistory {
  versions: UiConfigVersionMeta[];
  total: number;
  page: number;
  limit: number;
  publishedVersion: number | null;
}

/** Admin only — every call is rejected with 403 for anyone else. */
export const adminUiConfigApi = {
  async get(): Promise<UiConfigAdminView> {
    const { data } = await apiClient.get(endpoints.adminUiConfig.root);
    return { published: data.published, draft: data.draft };
  },
  async schema(): Promise<Record<string, unknown>> {
    const { data } = await apiClient.get(endpoints.adminUiConfig.schema);
    return data;
  },
  async versions(page = 1, limit = 50): Promise<UiConfigHistory> {
    const { data } = await apiClient.get(endpoints.adminUiConfig.versions, { params: { page, limit } });
    return data;
  },
  async version(version: number): Promise<UiConfigVersionDetail> {
    const { data } = await apiClient.get(endpoints.adminUiConfig.version(version));
    return data.version;
  },
  /** Saves even a schema-invalid draft; returns its problems. The JSON itself must parse. */
  async saveDraft(baseVersion: number, config: unknown): Promise<UiConfigProblem[]> {
    const { data } = await apiClient.put(endpoints.adminUiConfig.draft, { baseVersion, config });
    return data.problems ?? [];
  },
  discardDraft() {
    return apiClient.delete(endpoints.adminUiConfig.draft);
  },
  async validate(config: unknown): Promise<{ ok: boolean; problems: UiConfigProblem[] }> {
    const { data } = await apiClient.post(endpoints.adminUiConfig.validate, { config });
    return { ok: data.ok, problems: data.problems ?? [] };
  },
  async publish(baseVersion: number, message: string): Promise<number> {
    const { data } = await apiClient.post(endpoints.adminUiConfig.publish, { baseVersion, message });
    return data.version;
  },
  async rollback(toVersion: number, message: string): Promise<number> {
    const { data } = await apiClient.post(endpoints.adminUiConfig.rollback, { toVersion, message });
    return data.version;
  },
};
