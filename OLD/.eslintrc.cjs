/** @type {import('eslint').Linter.Config} */
module.exports = {
  env: { browser: true, node: true, es2022: true },
  extends: [
    "eslint:recommended",
    "plugin:import/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "prettier" // ← Prettierと競合するルールをOFF
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  settings: {
    "import/resolver": {
      node: { extensions: [".js", ".mjs", ".cjs", ".json"] }
    }
  },
  rules: {
    // よく使う実用ルール（好みでON/OFFしてOK）
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-console": "off",
    "import/order": [
      "warn",
      {
        "groups": [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
        "newlines-between": "always"
      }
    ]
  }
};