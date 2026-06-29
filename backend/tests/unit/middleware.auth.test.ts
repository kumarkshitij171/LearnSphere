import jwt from 'jsonwebtoken';
import { isAuthenticated, authorizedRoles } from '../../middleware/auth';

const makeRes = () => ({} as any);

const runMiddleware = (mw: any, req: any) =>
  new Promise<any>((resolve) => {
    mw(req, makeRes(), (err?: any) => resolve(err));
  });

const validToken = (overrides: Record<string, any> = {}) =>
  jwt.sign(
    { id: 'user-1', email: 'jane@example.com', role: 'user', ...overrides },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: '5m' }
  );

describe('isAuthenticated', () => {
  it('accepts a token from the access_token cookie and sets req.user', async () => {
    const req: any = { cookies: { access_token: validToken() }, headers: {}, body: {} };
    const err = await runMiddleware(isAuthenticated, req);
    expect(err).toBeUndefined();
    expect(req.user).toEqual({ id: 'user-1', email: 'jane@example.com', role: 'user' });
  });

  it('accepts a token from the Authorization: Bearer header', async () => {
    const req: any = {
      cookies: {},
      headers: { authorization: `Bearer ${validToken()}` },
      body: {},
    };
    const err = await runMiddleware(isAuthenticated, req);
    expect(err).toBeUndefined();
    expect(req.user.id).toBe('user-1');
  });

  it('accepts a token from the request body (mobile)', async () => {
    const req: any = { cookies: {}, headers: {}, body: { access_token: validToken() } };
    const err = await runMiddleware(isAuthenticated, req);
    expect(err).toBeUndefined();
    expect(req.user.id).toBe('user-1');
  });

  it('rejects when no token is present (401)', async () => {
    const req: any = { cookies: {}, headers: {}, body: {} };
    const err = await runMiddleware(isAuthenticated, req);
    expect(err.statusCode).toBe(401);
  });

  it('rejects an invalid token (401)', async () => {
    const req: any = { cookies: { access_token: 'not-a-jwt' }, headers: {}, body: {} };
    const err = await runMiddleware(isAuthenticated, req);
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/invalid/i);
  });

  it('rejects an expired token with a refresh hint (401)', async () => {
    const expired = jwt.sign(
      { id: 'user-1', email: 'jane@example.com', role: 'user' },
      process.env.ACCESS_TOKEN_SECRET!,
      { expiresIn: -10 }
    );
    const req: any = { cookies: { access_token: expired }, headers: {}, body: {} };
    const err = await runMiddleware(isAuthenticated, req);
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/expired/i);
  });
});

describe('authorizedRoles', () => {
  it('calls next() with no error when the role is allowed', async () => {
    const req: any = { user: { role: 'admin' } };
    const err = await runMiddleware(authorizedRoles('admin', 'user'), req);
    expect(err).toBeUndefined();
  });

  it('rejects with 403 when the role is not allowed', async () => {
    const req: any = { user: { role: 'user' } };
    const err = await runMiddleware(authorizedRoles('admin'), req);
    expect(err.statusCode).toBe(403);
  });

  it('rejects with 403 when no role is present', async () => {
    const req: any = { user: {} };
    const err = await runMiddleware(authorizedRoles('admin'), req);
    expect(err.statusCode).toBe(403);
  });
});
