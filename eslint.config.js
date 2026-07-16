import storybook from 'eslint-plugin-storybook';
import js from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '.github/dependabot.yml',
      '!.*',
      '*.tgz',
      // Built output and generated artifacts live under each package.
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      'scripts/',
      'build-storybook.log',
      '.DS_Store',
      '.env',
      '.idea',
      '.vscode',
    ],
  },
  js.configs.recommended,
  reactPlugin.configs.flat.recommended,
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  ...tseslint.configs.recommended,
  ...storybook.configs['flat/recommended'],
  {
    rules: {
      // Automatic JSX runtime (tsconfig `jsx: react-jsx`) — components don't
      // import React, so the classic in-scope check would false-positive.
      'react/react-in-jsx-scope': 'off',
      // Props are typed by TypeScript, not runtime prop-types.
      'react/prop-types': 'off',
    },
  },
  prettierRecommended,
];
