import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // spec/ is the brutils-spec submodule: its files are edited there, and its \uXXXX escapes must not be decoded.
  fmt: { ignorePatterns: ["spec/**"] },
  lint: { options: { typeAware: true, typeCheck: true } },
});
