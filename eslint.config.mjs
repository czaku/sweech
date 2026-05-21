import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/cli.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CatchClause[param=null]',
          message: 'CLI catch clauses must bind the error and either handle it or pass it to logSilent(error, context).',
        },
      ],
    },
  },
];
