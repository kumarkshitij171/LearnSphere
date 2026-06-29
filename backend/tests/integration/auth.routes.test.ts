// sendMail must be mocked before the controller (imported via testApp) loads it.
jest.mock('../../utils/sendMail', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { buildTestApp } from '../helpers/testApp';
import {
  encryptedPassword,
  hashToken,
  generateAccessToken,
  createActivationToken,
} from '../../services/user.service';
import { sendMail } from '../../utils/sendMail';

const app = buildTestApp();
const prisma: any = new PrismaClient();

const PASSWORD = 'Str0ng!Pass';
let passwordHash: string;

const baseUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  email: 'jane@example.com',
  name: 'Jane Doe',
  role: 'user',
  isVerified: true,
  password: passwordHash,
  courses: [],
  avatar: null,
  extended: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const findCookie = (res: request.Response, name: string): string | undefined => {
  const raw = (res.headers['set-cookie'] as unknown as string[]) || [];
  return raw.find((c) => c.startsWith(`${name}=`));
};

beforeAll(async () => {
  passwordHash = await encryptedPassword(PASSWORD);
});

describe('POST /login', () => {
  it('sets scoped access_token + refresh_token cookies for web', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    prisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/users/login')
      .send({ email: 'jane@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const access = findCookie(res, 'access_token');
    const refresh = findCookie(res, 'refresh_token');
    expect(access).toBeDefined();
    expect(access).toContain('Path=/;');
    expect(access).toContain('HttpOnly');
    expect(refresh).toBeDefined();
    expect(refresh).toContain('Path=/api/v1/users/refresh-token');
    // tokens are not echoed in the body for web
    expect(res.body.accessToken).toBeUndefined();
  });

  it('returns tokens in the body (no cookies) for mobile', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    prisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/users/login')
      .set('X-Mobile-App', 'true')
      .send({ email: 'jane@example.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a wrong password with 400', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    const res = await request(app)
      .post('/api/v1/users/login')
      .send({ email: 'jane@example.com', password: 'WrongPass!9' });
    expect(res.status).toBe(400);
  });

  it('rejects an unverified account with 403', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ isVerified: false }));
    const res = await request(app)
      .post('/api/v1/users/login')
      .send({ email: 'jane@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe('GET /me', () => {
  it('returns the user (without password) for a valid access token', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    const token = generateAccessToken(baseUser() as any);

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Cookie', `access_token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('jane@example.com');
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.extended).toBeUndefined();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /refresh-token', () => {
  const makeRefresh = () =>
    jwt.sign({ id: 'user-1' }, process.env.REFRESH_TOKEN_SECRET!, { expiresIn: '7d' });

  const futureSession = (token: string) => ({
    refreshTokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  it('mints a new access token (only) for a valid refresh cookie', async () => {
    const token = makeRefresh();
    prisma.user.findUnique.mockResolvedValue(baseUser({ extended: { session: futureSession(token) } }));

    const res = await request(app)
      .post('/api/v1/users/refresh-token')
      .set('Cookie', `refresh_token=${token}`);

    expect(res.status).toBe(200);
    expect(findCookie(res, 'access_token')).toBeDefined();
    // refresh token is NOT rotated/re-set
    expect(findCookie(res, 'refresh_token')).toBeUndefined();
  });

  it('returns the access token in the body for mobile (body refresh_token)', async () => {
    const token = makeRefresh();
    prisma.user.findUnique.mockResolvedValue(baseUser({ extended: { session: futureSession(token) } }));

    const res = await request(app)
      .post('/api/v1/users/refresh-token')
      .set('X-Mobile-App', 'true')
      .send({ refresh_token: token });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('returns 401 when no refresh token is provided', async () => {
    const res = await request(app).post('/api/v1/users/refresh-token').send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid refresh JWT', async () => {
    const res = await request(app)
      .post('/api/v1/users/refresh-token')
      .set('Cookie', 'refresh_token=garbage');
    expect(res.status).toBe(401);
  });

  it('returns 401 when the stored session is expired', async () => {
    const token = makeRefresh();
    prisma.user.findUnique.mockResolvedValue(
      baseUser({
        extended: {
          session: {
            refreshTokenHash: hashToken(token),
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      })
    );
    const res = await request(app)
      .post('/api/v1/users/refresh-token')
      .set('Cookie', `refresh_token=${token}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the stored hash does not match', async () => {
    const token = makeRefresh();
    prisma.user.findUnique.mockResolvedValue(
      baseUser({
        extended: {
          session: {
            refreshTokenHash: hashToken('a-different-token'),
            expiresAt: new Date(Date.now() + 1000_000).toISOString(),
          },
        },
      })
    );
    const res = await request(app)
      .post('/api/v1/users/refresh-token')
      .set('Cookie', `refresh_token=${token}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /logout', () => {
  it('clears both cookies and removes the session from the user row', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ extended: { theme: 'dark', session: { refreshTokenHash: 'x' } } }));
    prisma.user.update.mockResolvedValue({});
    const token = generateAccessToken(baseUser() as any);

    const res = await request(app)
      .get('/api/v1/users/logout')
      .set('Cookie', `access_token=${token}`);

    expect(res.status).toBe(200);

    const access = findCookie(res, 'access_token');
    const refresh = findCookie(res, 'refresh_token');
    expect(access).toContain('Max-Age=0'); // express serializes maxAge:1ms -> Max-Age=0
    expect(refresh).toContain('Path=/api/v1/users/refresh-token');

    // session stripped, other extended keys preserved
    const updateArg = prisma.user.update.mock.calls[0][0];
    expect(updateArg.data.extended.session).toBeUndefined();
    expect(updateArg.data.extended.theme).toBe('dark');
  });
});

describe('POST /register', () => {
  it('creates a user, sends activation mail, and returns 201', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(baseUser({ isVerified: false }));

    const res = await request(app)
      .post('/api/v1/users/register')
      .send({ name: 'Jane Doe', email: 'jane@example.com', password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate email with 400', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    const res = await request(app)
      .post('/api/v1/users/register')
      .send({ name: 'Jane Doe', email: 'jane@example.com', password: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe('POST /verify', () => {
  it('verifies a valid otp+token and issues session cookies', async () => {
    prisma.user.update.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue(baseUser());

    const { token, activationCode } = await createActivationToken(baseUser() as any);

    const res = await request(app)
      .post('/api/v1/users/verify')
      .send({ otp: activationCode, token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(findCookie(res, 'access_token')).toBeDefined();
    expect(findCookie(res, 'refresh_token')).toBeDefined();
  });
});
