# brutils - The essential Brazilian toolkit for the modern web

This file serves as the unified documentation and guidelines for AI coding agents (Gemini, Copilot, Antigravity, Claude,
etc.) and human contributors working on `brutils`.

---

## Project Overview

`brutils` is a TypeScript monorepo focused on providing utilities for Brazilian business rules and data modeling,
validation, formatting, and generation. The core of the project is the `@brutils/core` package.

### Key Technologies

- **Monorepo Manager:** [pnpm](https://pnpm.io/)
- **Tooling Engine:** [vite-plus (vp)](https://github.com/voidzero-dev/vite-plus) - Handles building, testing, linting,
  and formatting.
- **Bundler:** [tsdown](https://github.com/privatenumber/tsdown) (via `vp pack` inside package directory)
- **Testing:** [vitest](https://vitest.dev/) (via `vp test` inside package directory)
- **Language:** TypeScript (strict mode enabled)

---

## Project Structure

- `packages/core/`: The main library containing utility functions.
  - `src/`: Core logic (shared helpers, utility modules).
  - `tests/`: Vitest test suites.
- `packages/cep-resolver/`: CEP → address lookup via third-party providers (network I/O). Kept out of core so
  provider changes never affect core's semver contract.
- `apps/docs/`: Planned documentation website.
- `spec/`: Git submodule of [brutils-spec](https://github.com/youphenrique/brutils-spec), the language-neutral
  conformance cases shared with brutils-kotlin. Tests import them (e.g. `spec/cpf/cases.json`); change cases in that
  repository, then move the submodule pointer here. Clone with `--recurse-submodules` or run
  `git submodule update --init`.

---

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite
Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+
is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands
and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts
cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and
`vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via
      `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking
      for help.

<!--VITE PLUS END-->

---

## Command Reference

All package development tasks should ideally go through the `vp` CLI or pnpm workspace commands.

| Context / Location  | Task / Goal                     | Command                                  |
| :------------------ | :------------------------------ | :--------------------------------------- |
| **Root**            | Install dependencies            | `vp install`                             |
| **Root**            | Format codebase                 | `vp fmt`                                 |
| **Root**            | Lint (type-aware)               | `vp lint`                                |
| **Root**            | Type-check + Format + Lint      | `vp check`                               |
| **Root**            | Full validation pipeline        | `pnpm run ready`                         |
| **Root**            | Run linting and workspace tests | `pnpm run test`                          |
| **Root**            | Build all packages in monorepo  | `pnpm -r run build`                      |
| **`packages/core`** | Run all tests                   | `vp test`                                |
| **`packages/core`** | Run a specific test             | `vp test <pattern>` (e.g. `vp test cpf`) |
| **`packages/core`** | Build library                   | `vp pack`                                |
| **`packages/core`** | Watch and build on change       | `vp pack --watch`                        |
| **`packages/core`** | Manual Type Check               | `tsc --noEmit`                           |

---

## Architecture

`packages/core/src/` is organized into a shared helpers directory (`common/`) and feature modules (`utilities/`).

### Directory Layout

```
packages/core/src/
  common/             # Shared helpers (e.g., assert-options.ts, progressive-format.ts)
  utilities/
    <module>/         # Feature modules (cep, cnpj, cpf, ufs)
      constants.ts    # Exported module constants (e.g., LENGTH, REGION_MAP)
      types.ts        # TypeScript types and interfaces
      utils.ts        # Internal helpers, the module's Error class, and assertValid()
      <module>.ts     # Public API functions (validate, format, generate, normalize, mask)
      index.ts        # Entry point re-exporting everything public from the module
```

### Module Namespace Re-exports

The root `packages/core/src/index.ts` re-exports each module as a namespace:

```ts
export * as cnpj from "./utilities/cnpj/index";
export * as cpf from "./utilities/cpf/index";
export * as ufs from "./utilities/ufs/index";
export * as cep from "./utilities/cep/index";
```

### Imports

Always import from `vite-plus` rather than from raw dependencies directly:

```ts
import { defineConfig } from "vite-plus";
import { expect, test, vi } from "vite-plus/test";
import { defineConfig } from "vite-plus/pack"; // for tsdown.config.ts configuration
```

---

## Key Conventions

### 1. Validate Functions Return Results for Expected Invalid Input

Public `validate(value: unknown)` functions return result objects for expected invalid inputs and rethrow unexpected internal exceptions unchanged:

```ts
// ✅ Correct pattern
validate("123"); // { success: false, error: CpfError("INVALID_FORMAT") }

validate(123); // { success: false, error: CpfError("INVALID_TYPE") }
```

### 2. Error Classes Have a `code` Property

Each module defines its own error class extending `Error`, with a `readonly code` property typed as a union of string
literal error codes:

```ts
export type CpfErrorCode =
  "INVALID_TYPE" | "INVALID_FORMAT" | "REPEATED_DIGITS" | "INVALID_CHECKSUM";

export class CpfError extends Error {
  constructor(
    readonly code: CpfErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CpfError";
  }
}
```

### 3. Internal `assertValid` Pattern

Public `validate()` functions delegate to:

- `assertValid(value)` (defined in `utils.ts`) — Enforces a strict format (raw digits OR standard mask only) throwing
  `ModuleError("INVALID_FORMAT")` for anything else. Then it normalizes the input to digits and validates business rules
  (checksums, identical digit guards, etc.), throwing the corresponding `ModuleError` on failure.

### 4. Options Validation

Any function accepting an `options` object must call `assertOptions(options)` from `src/common/assert-options.ts` before
destructuring:

```ts
import { assertOptions } from "../../common/assert-options";

export function generate(options: CpfGenerateOptions = {}): string {
  assertOptions(options);
  const { uf, formatted = false } = options;
  // ...
}
```

### 5. TypeScript Strictness

`packages/core/tsconfig.json` enables strict type-checking (`strict`, `noUnusedLocals`, `verbatimModuleSyntax`, etc.).

- Use `import type` for type-only imports and exports where applicable.
- To enable proper IDE and linter resolution for test files, the `tests` directory is included in
  `packages/core/tsconfig.json` with `"allowImportingTsExtensions": true`.

---

## Adding a New Utility Module

To add a new utility module (e.g., `rg`, `cnh`, `pis`):

1. **Create the files** under `packages/core/src/utilities/<module>/`:

- `constants.ts` for regexes and lengths.
- `types.ts` for error codes, option interfaces, and result interfaces.
- `utils.ts` for helpers, `assertValid`, and the module's custom Error class.
- `<module>.ts` for the public functions (`validate`, `format`, `generate`, etc.).
- `index.ts` to export everything public.

2. **Export the namespace** in `packages/core/src/index.ts`.
3. **Write comprehensive tests** under `packages/core/tests/<module>/<module>.test.ts`.
4. **Verify changes** by running `pnpm run ready` and building using `pnpm -r run build` from the workspace root.
