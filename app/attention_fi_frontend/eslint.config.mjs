import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design handoff reference material (HTML prototype + source TSX we copied
    // from) — not app code, so it isn't held to the app's lint rules.
    "components/Attention-fi Repository (1)/**",
  ]),
  {
    rules: {
      // `_`-prefixed names are deliberately unused: destructure-to-omit
      // (`const { image: _image, ...rest }`) and signature placeholders that
      // exist to keep a callback's arity.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
