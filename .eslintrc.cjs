/** @type {import('eslint').Linter.Config} */
module.exports = {
  env: { browser: true, node: true, es2022: true },

  extends: [
    // ---- 追加 ----
    "next/core-web-vitals",
    // 既存
    "eslint:recommended",
    "plugin:import/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    // ---- 追加 ----
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "plugin:import/typescript",
    "prettier" // ← Prettier と競合するルールをOFF
  ],

  // ---- 追加: TS/JSX を正しく解釈 ----
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
    project: false,
    tsconfigRootDir: __dirname
  },

  settings: {
    "import/resolver": {
      // 既存 + 追記: ts/tsx 解決
      node: { extensions: [".js", ".mjs", ".cjs", ".json", ".ts", ".tsx"] },
      typescript: true
    }
  },

  plugins: [
    // ---- 追加 ----
    "@typescript-eslint",
    "jsx-a11y",
    "import"
  ],

  rules: {
    // 既存
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-console": "off",
    "import/order": [
      "warn",
      {
        "groups": [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
        "newlines-between": "always"
      }
    ],

    // ---- 追加: TS/React 実務ルール ----
    "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
    // base の no-unused-vars は TS で誤検知しがちなので無効化し、TS 版に委譲
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    // Next.js の自動挿入と相性問題を避ける
    "react/jsx-key": "off"
  },

  overrides: [
    // JS ファイルだけ base ルールを復活させたい場合の保険
    {
      files: ["*.js", "*.cjs", "*.mjs"],
      rules: {
        "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
      }
    }
  ],

  ignorePatterns: [".next/", "node_modules/", "dist/", "coverage/"]
};
