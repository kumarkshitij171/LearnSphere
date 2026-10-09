import express from 'express';
import {
  getUiConfig,
  getAdminUiConfig,
  getUiConfigSchema,
  getUiConfigVersions,
  getUiConfigVersion,
  putUiConfigDraft,
  deleteUiConfigDraft,
  validateUiConfigBody,
  publishUiConfig,
  rollbackUiConfig,
} from '../controllers/uiConfig.controller';

// Public read, mounted at /api/v1/ui-config.
export const uiConfigPublicRoutes = express.Router();
uiConfigPublicRoutes.get('/', getUiConfig);

// Mounted inside admin.routes at /api/v1/admin/ui-config, so it inherits the ADMIN-only guard.
export const uiConfigAdminRoutes = express.Router();
uiConfigAdminRoutes.get('/', getAdminUiConfig);
uiConfigAdminRoutes.get('/schema', getUiConfigSchema);
uiConfigAdminRoutes.get('/versions', getUiConfigVersions);
uiConfigAdminRoutes.get('/versions/:version', getUiConfigVersion);
uiConfigAdminRoutes.put('/draft', putUiConfigDraft);
uiConfigAdminRoutes.delete('/draft', deleteUiConfigDraft);
uiConfigAdminRoutes.post('/validate', validateUiConfigBody);
uiConfigAdminRoutes.post('/publish', publishUiConfig);
uiConfigAdminRoutes.post('/rollback', rollbackUiConfig);
