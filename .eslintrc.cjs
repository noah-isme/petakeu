module.exports = {
  root: true,
  env: {
    es2021: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module"
  },
  plugins: ["@typescript-eslint", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier"
  ],
  settings: {
    react: {
      version: "detect"
    },
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: ["./tsconfig.base.json", "./apps/*/tsconfig.json"]
      }
    }
  },
  ignorePatterns: [
    "dist",
    "build",
    "coverage",
    "node_modules",
    "public/mockServiceWorker.js"
  ],
  overrides: [
    {
      files: ["apps/web/**/*.{ts,tsx}"],
      extends: ["plugin:react/recommended", "plugin:react-hooks/recommended"],
      parserOptions: {
        project: "./apps/web/tsconfig.json"
      },
      rules: {
        "react/react-in-jsx-scope": "off"
      }
    },
    {
      files: ["apps/server/**/*.ts"],
      parserOptions: {
        project: "./apps/server/tsconfig.json"
      },
      env: {
        node: true
      }
    },
    {
      files: ["**/*.{cjs,js,mjs}", "apps/**/vite.config.ts"],
      parserOptions: {
        project: null
      }
    }
  ]
};
