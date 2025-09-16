import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // mantém as recomendações do Next
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // ⬇️ ADICIONE ESTE BLOCO PARA DESLIGAR REGRAS TS-ESLINT
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // outros exemplos se quiser:
      // "@typescript-eslint/no-unused-vars": "off",
      // "@typescript-eslint/ban-ts-comment": "off",
    },
  },

  // seus ignores
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
