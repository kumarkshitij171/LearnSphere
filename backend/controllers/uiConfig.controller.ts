import { Request, Response, NextFunction } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import { uiConfigSchema, validateUiConfig } from '../utils/uiConfigValidator';
import {
  getPublished,
  getAdminView,
  listVersions,
  getVersion,
  saveDraft,
  discardDraft,
  publishDraft,
  rollbackTo,
  StaleBaseError,
  InvalidConfigError,
} from '../services/uiConfig.service';

const asError = (error: unknown): ErrorHandler | null => {
  if (error instanceof StaleBaseError) {
    return new ErrorHandler(409, error.message, { currentVersion: error.currentVersion });
  }
  if (error instanceof InvalidConfigError) {
    return new ErrorHandler(400, error.message, { problems: error.problems });
  }
  return null;
};

const requireMessage = (body: any): string | null => {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  return message.length >= 3 && message.length <= 200 ? message : null;
};

// Public: the login page needs the brand before anyone signs in.
export const getUiConfig = catchAsyncError(async (req: Request, res: Response) => {
  const published = await getPublished();
  const etag = `"${published.checksum}"`;
  res.setHeader('ETag', etag);
  // no stored copies anywhere: clients revalidate every time and get 304 while nothing changed
  res.setHeader('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  return res.status(200).json({ success: true, ...published });
});

export const getAdminUiConfig = catchAsyncError(async (req: Request, res: Response) => {
  const view = await getAdminView(req.user!.id);
  return res.status(200).json({ success: true, ...view });
});

export const getUiConfigSchema = catchAsyncError(async (_req: Request, res: Response) =>
  res.status(200).json(uiConfigSchema)
);

export const getUiConfigVersions = catchAsyncError(async (req: Request, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) || 1 : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) || 30 : 30;
  return res.status(200).json({ success: true, ...(await listVersions(page, limit)) });
});

export const getUiConfigVersion = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const version = parseInt(req.params.version, 10);
  if (!Number.isInteger(version) || version < 1) return next(new ErrorHandler(400, 'version must be a positive integer'));
  const found = await getVersion(version);
  if (!found) return next(new ErrorHandler(404, `Version ${version} not found`));
  return res.status(200).json({ success: true, version: found });
});

export const putUiConfigDraft = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const { baseVersion, config } = req.body ?? {};
  if (!Number.isInteger(baseVersion) || baseVersion < 1) return next(new ErrorHandler(400, 'baseVersion is required'));
  if (config === undefined) return next(new ErrorHandler(400, 'config is required'));
  const result = await saveDraft(req.user!.id, baseVersion, config);
  return res.status(200).json({ success: true, ...result });
});

export const deleteUiConfigDraft = catchAsyncError(async (req: Request, res: Response) => {
  await discardDraft(req.user!.id);
  return res.status(200).json({ success: true });
});

export const validateUiConfigBody = catchAsyncError(async (req: Request, res: Response) => {
  const result = validateUiConfig(req.body?.config);
  return res.status(200).json({ success: true, ...result });
});

export const publishUiConfig = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const { baseVersion } = req.body ?? {};
  const message = requireMessage(req.body);
  if (!Number.isInteger(baseVersion)) return next(new ErrorHandler(400, 'baseVersion is required'));
  if (!message) return next(new ErrorHandler(400, 'A message of 3 to 200 characters is required'));
  try {
    const result = await publishDraft(req.user!.id, baseVersion, message);
    if (!result.ok) return next(new ErrorHandler(404, 'You have no draft to publish'));
    return res.status(201).json({ success: true, version: result.version });
  } catch (error) {
    const mapped = asError(error);
    if (mapped) return next(mapped);
    throw error;
  }
});

export const rollbackUiConfig = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const { toVersion } = req.body ?? {};
  const message = requireMessage(req.body);
  if (!Number.isInteger(toVersion) || toVersion < 1) return next(new ErrorHandler(400, 'toVersion is required'));
  if (!message) return next(new ErrorHandler(400, 'A message of 3 to 200 characters is required'));
  try {
    const result = await rollbackTo(req.user!.id, toVersion, message);
    if (!result.ok) return next(new ErrorHandler(404, `Version ${toVersion} not found`));
    return res.status(201).json({ success: true, version: result.version });
  } catch (error) {
    const mapped = asError(error);
    if (mapped) return next(mapped);
    throw error;
  }
});
