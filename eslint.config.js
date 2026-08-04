import storybook from 'eslint-plugin-storybook';
import js from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';
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
      // Untracked local agent scratch, including whole-repo worktree copies.
      // The old `scripts/` entry was matching their nested copies of this
      // repo's scripts too, so dropping it is what exposed them.
      '.claude/',
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
    // Release tooling, run by `pnpm release` and by the build workflow. It was
    // ignored here for as long as nothing ran it, which let `chalk` sit in it
    // undeclared and unimported.
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    rules: {
      // Automatic JSX runtime (tsconfig `jsx: react-jsx`), so components don't
      // import React, so the classic in-scope check would false-positive.
      'react/react-in-jsx-scope': 'off',
      // Props are typed by TypeScript, not runtime prop-types.
      'react/prop-types': 'off',
    },
  },
  prettierRecommended,
];
