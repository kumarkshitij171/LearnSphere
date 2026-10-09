import { weakSecrets } from '../../utils/secretPolicy';

const strong = (c: string) => c.repeat(40);

describe('production secret policy', () => {
  it('accepts long, distinct secrets', () => {
    expect(
      weakSecrets({ JWT_SECRET: strong('a'), ACCESS_TOKEN_SECRET: strong('b'), REFRESH_TOKEN_SECRET: strong('c'), INTERNAL_API_KEY: strong('d'), TRANCODER_API_KEY: strong('e') }, {})
    ).toEqual([]);
  });

  it('rejects short secrets, sample values and reuse', () => {
    const problems = weakSecrets(
      { JWT_SECRET: 'jwt_secret', ACCESS_TOKEN_SECRET: strong('b'), REFRESH_TOKEN_SECRET: strong('b') },
      { JWT_SECRET: 'jwt_secret' }
    );
    expect(problems).toEqual([
      'JWT_SECRET is shorter than 32 characters',
      'JWT_SECRET is the example value from .env.sample',
      'REFRESH_TOKEN_SECRET reuses the value of ACCESS_TOKEN_SECRET',
    ]);
  });
});
