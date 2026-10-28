'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_UI_CONFIG } from './defaults';
import type { UiConfig } from './types';

const UiConfigContext = createContext<UiConfig>(DEFAULT_UI_CONFIG);

/** `config` may be a draft: the editor's preview renders real components from unpublished config. */
export function UiConfigProvider({ config, children }: { config: UiConfig; children: ReactNode }) {
  return <UiConfigContext.Provider value={config}>{children}</UiConfigContext.Provider>;
}

export function useUiConfig(): UiConfig {
  return useContext(UiConfigContext);
}
