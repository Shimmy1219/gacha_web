const path = require('node:path');

const js = require('@eslint/js');
const eslintPluginImport = require('eslint-plugin-import');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

const importSettings = {
  'import/resolver': {
    node: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      moduleDirectory: ['node_modules', '../../node_modules'],
    },
    typescript: {
      project: path.resolve(__dirname, './tsconfig.json'),
      tsconfigRootDir: __dirname,
      alwaysTryTypes: true,
    },
  },
  'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
};

module.exports = [
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts', 'tailwind.config.ts'],
    ignores: ['dist/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: false,
        tsconfigRootDir: __dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        JSX: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: eslintPluginImport,
    },
    settings: importSettings,
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...eslintPluginImport.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'import/order': 'off',
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      import: eslintPluginImport,
    },
    settings: importSettings,
    rules: {
      ...js.configs.recommended.rules,
      ...eslintPluginImport.configs.recommended.rules,
      'import/order': 'off',
    },
  },
];
