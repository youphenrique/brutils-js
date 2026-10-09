import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // Spec fixtures keep invisible characters as \uXXXX escapes, which the formatter would decode.
  fmt: { ignorePatterns: ["spec/**/*.json"] },
  lint: { options: { typeAware: true, typeCheck: true } },
});
