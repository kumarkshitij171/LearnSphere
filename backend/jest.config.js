/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  // rootDir (not tests/) so the <rootDir>/__mocks__ manual mock for the
  // @prisma/client node module is picked up automatically.
  roots: ['<rootDir>'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  clearMocks: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  // The AWS SDK / kafkajs deep imports don't need transforming.
  transformIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: [
    'services/**/*.ts',
    'middleware/**/*.ts',
    'controllers/**/*.ts',
    'utils/**/*.ts',
  ],
};
