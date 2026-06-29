import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import {
  createActivationToken,
  verifyToken,
  encryptedPassword,
  verifyPassword,
  hashToken,
  generateAccessToken,
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../services/user.service';

// The @prisma/client manual mock returns a shared singleton for every `new PrismaClient()`.
const prisma: any = new PrismaClient();

const baseUser: any = {
  id: 'user-1',
  email: 'jane@example.com',
  name: 'Jane Doe',
  role: 'user',
  isVerified: true,
  password: 'hash',
  courses: [],
  extended: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('user.service - password hashing', () => {
  it('encrypts a password and verifies it round-trip', async () => {
    const hash = await encryptedPassword('Str0ng!Pass');
    expect(hash).not.toBe('Str0ng!Pass');
    expect(await verifyPassword('Str0ng!Pass', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await encryptedPassword('Str0ng!Pass');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('user.service - hashToken', () => {
  it('returns a deterministic 64-char sha256 hex (not bcrypt)', () => {
    const h1 = hashToken('some.jwt.token');
    const h2 = hashToken('some.jwt.token');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    // bcrypt hashes start with $2; sha256 hex never does
    expect(h1.startsWith('$2')).toBe(false);
  });

  it('produces different hashes for different input', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('user.service - access token', () => {
  it('mints an access token carrying id/email/role, signed with ACCESS_TOKEN_SECRET', () => {
    const token = generateAccessToken(baseUser);
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as any;
    expect(decoded.id).toBe(baseUser.id);
    expect(decoded.email).toBe(baseUser.email);
    expect(decoded.role).toBe(baseUser.role);
  });

  it('verifyAccessToken returns decoded for valid, null for invalid', () => {
    const token = generateAccessToken(baseUser);
    expect((verifyAccessToken(token) as any).id).toBe(baseUser.id);
    expect(verifyAccessToken('garbage')).toBeNull();
  });
});

describe('user.service - generateTokens', () => {
  beforeEach(() => {
    prisma.user.update.mockResolvedValue({});
  });

  it('returns access + refresh tokens and persists a hashed session', async () => {
    const { accessToken, refreshToken } = await generateTokens(baseUser, {
      userAgent: 'jest-agent',
      ip: '1.2.3.4',
    });

    expect(typeof accessToken).toBe('string');
    expect(typeof refreshToken).toBe('string');

    // refresh token is a valid JWT for this user
    const decodedRefresh = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as any;
    expect(decodedRefresh.id).toBe(baseUser.id);

    // session written with the SHA-256 hash of the refresh token (never the raw JWT)
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const arg = prisma.user.update.mock.calls[0][0];
    const session = arg.data.extended.session;
    expect(session.refreshTokenHash).toBe(hashToken(refreshToken));
    expect(session.refreshTokenHash).not.toBe(refreshToken);
    expect(session.device).toEqual({ userAgent: 'jest-agent', ip: '1.2.3.4' });
    expect(typeof session.createdAt).toBe('string');

    // expiresAt is derived from the JWT exp claim
    const expectedExpiry = new Date(decodedRefresh.exp * 1000).toISOString();
    expect(session.expiresAt).toBe(expectedExpiry);
  });

  it('merges existing extended keys instead of clobbering them', async () => {
    const userWithExtended = { ...baseUser, extended: { theme: 'dark' } };
    await generateTokens(userWithExtended);
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.data.extended.theme).toBe('dark');
    expect(arg.data.extended.session).toBeDefined();
  });

  it('defaults device fields to null when no context is given', async () => {
    await generateTokens(baseUser);
    const session = prisma.user.update.mock.calls[0][0].data.extended.session;
    expect(session.device).toEqual({ userAgent: null, ip: null });
  });
});

describe('user.service - refresh token verification', () => {
  it('verifyRefreshToken returns decoded for valid, null for invalid', () => {
    const token = jwt.sign({ id: 'user-1' }, process.env.REFRESH_TOKEN_SECRET!, {
      expiresIn: '7d',
    });
    expect((verifyRefreshToken(token) as any).id).toBe('user-1');
    expect(verifyRefreshToken('not-a-token')).toBeNull();
  });

  it('verifyRefreshToken rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ id: 'user-1' }, 'wrong_secret', { expiresIn: '7d' });
    expect(verifyRefreshToken(token)).toBeNull();
  });
});

describe('user.service - activation token', () => {
  it('createActivationToken returns a 4-digit code and a JWT with a hashed code', async () => {
    const { token, activationCode } = await createActivationToken(baseUser);
    expect(activationCode).toMatch(/^\d{4}$/);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    expect(decoded.id).toBe(baseUser.id);
    // the code stored in the token is hashed, not the raw 4 digits
    expect(decoded.activationCode).not.toBe(activationCode);
    expect(await verifyPassword(activationCode, decoded.activationCode)).toBe(true);
  });

  it('verifyToken returns true for a matching otp and marks the user verified', async () => {
    prisma.user.update.mockResolvedValue({});
    const { token, activationCode } = await createActivationToken(baseUser);

    const ok = await verifyToken(token, activationCode);

    expect(ok).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { isVerified: true },
    });
  });

  it('verifyToken returns false for a wrong otp', async () => {
    const { token } = await createActivationToken(baseUser);
    expect(await verifyToken(token, '0000')).toBe(false);
  });

  it('verifyToken returns false for a malformed token', async () => {
    expect(await verifyToken('garbage', '1234')).toBe(false);
  });
});
