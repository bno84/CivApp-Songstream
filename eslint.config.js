// SPDX-License-Identifier: AGPL-3.0-or-later
import css from '@eslint/css';
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SPDX = 'SPDX-License-Identifier: AGPL-3.0-or-later';

// Every source file starts with the SPDX header. It reads the raw text, so the
// same rule works for JS, TS and CSS; --fix inserts the header.
const local = {
  rules: {
    'spdx-header': {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [{ type: 'string' }],
        messages: { missing: 'The first line must be `{{header}}`.' },
      },
      create(context) {
        const header = context.options[0];
        const check = () => {
          if (context.sourceCode.text.split('\n', 1)[0].trim() === header) return;
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'missing',
            data: { header },
            fix: (fixer) => fixer.insertTextBeforeRange([0, 0], `${header}\n`),
          });
        };
        // The root node: `Program` in JS/TS, `StyleSheet` in CSS.
        return { Program: check, StyleSheet: check };
      },
    },
  },
};

export default defineConfig([
  globalIgnores(['dist/', 'node_modules/', 'coverage/']),

  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    plugins: { local },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'local/spdx-header': ['error', `// ${SPDX}`],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // AbortSignal.reason is typed `any`; rejecting with it is the point.
      '@typescript-eslint/prefer-promise-reject-errors': ['error', { allowThrowingAny: true }],
      'no-console': ['error', { allow: ['error'] }],
    },
  },

  // Browser code: the app and its React components.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      eslintReact.configs['recommended-type-checked'],
      eslintReact.configs['disable-conflict-eslint-plugin-react-hooks'],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: { globals: globals.browser },
    rules: {
      'react-refresh/only-export-components': 'error',
    },
  },

  // The entry point renders the app and exports nothing.
  {
    files: ['src/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // Node-side code: Vite config, its dev-server helper, this file.
  {
    files: ['*.{js,mjs}', 'src/dev-embed.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Test fakes are async to match the interfaces they stand in for.
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  {
    files: ['**/*.css'],
    language: 'css/css',
    plugins: { css, local },
    extends: [css.configs.recommended],
    rules: { 'local/spdx-header': ['error', `/* ${SPDX} */`] },
  },
]);
