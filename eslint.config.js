import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

const readabilityRules = {
  '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],
  '@stylistic/padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: 'directive', next: '*' },
    { blankLine: 'any', prev: 'directive', next: 'directive' },
    { blankLine: 'always', prev: 'import', next: '*' },
    { blankLine: 'any', prev: 'import', next: 'import' },
    { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
    { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
  ],
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.pnpm-store/**',
      '.codex/**',
      'app/**',
      'components/**',
      'hooks/**',
      'public/vendor/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: { '@stylistic': stylistic },
    rules: readabilityRules,
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: { '@stylistic': stylistic },
    rules: readabilityRules,
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaVersion: 'latest',
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
    plugins: { '@stylistic': stylistic },
    rules: readabilityRules,
  },
];
