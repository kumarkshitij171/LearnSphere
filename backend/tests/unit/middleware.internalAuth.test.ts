import { internalApiKeyAuth } from '../../middleware/internalAuth';

const runMiddleware = (mw: any, req: any) =>
  new Promise<any>((resolve) => {
    mw(req, {} as any, (err?: any) => resolve(err));
  });

const KEY = process.env.INTERNAL_API_KEY!;

describe('internalApiKeyAuth', () => {
  it('accepts the key from the X-Internal-Api-Key header', async () => {
    const req: any = { headers: { 'x-internal-api-key': KEY } };
    expect(await runMiddleware(internalApiKeyAuth, req)).toBeUndefined();
  });

  it('accepts the key from Authorization: Bearer', async () => {
    const req: any = { headers: { authorization: `Bearer ${KEY}` } };
    expect(await runMiddleware(internalApiKeyAuth, req)).toBeUndefined();
  });

  it('rejects a missing key with 401', async () => {
    const err = await runMiddleware(internalApiKeyAuth, { headers: {} });
    expect(err.statusCode).toBe(401);
  });

  it('rejects a wrong key with 401', async () => {
    const req: any = { headers: { 'x-internal-api-key': 'nope' } };
    const err = await runMiddleware(internalApiKeyAuth, req);
    expect(err.statusCode).toBe(401);
  });

  it('fails closed with 500 when the key is not configured', async () => {
    delete process.env.INTERNAL_API_KEY;
    try {
      const req: any = { headers: { 'x-internal-api-key': KEY } };
      const err = await runMiddleware(internalApiKeyAuth, req);
      expect(err.statusCode).toBe(500);
    } finally {
      process.env.INTERNAL_API_KEY = KEY;
    }
  });
});
