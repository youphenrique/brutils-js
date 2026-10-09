# brutils-spec

Language-neutral conformance cases for every brutils implementation (`@brutils/core` today, `brutils-kotlin`
next). A behavior change starts here: update the cases, bump `specVersion` when existing expectations change, then
make each implementation pass.

This directory is incubated inside the JS monorepo and will be split into its own `brutils-spec` repository
(`git subtree split --prefix=spec`) once a second implementation consumes it.

## Layout

```
spec/
  <module>/cases.json   # one file per module (cpf, ...)
```

## Format

Each `cases.json` holds:

- `module`, `specVersion`, and the module's public enums (`errorCodes`, `maskModes`, ...).
- One section per behavior. A section has a `description` stating the rule every case must satisfy, any shared
  expectation (such as `errorCode`), and its `cases`.
- Some sections are derived: they state a rule over another section's cases instead of listing cases (for example,
  `checkDigitCorruption` mutates every `valid` case).

Strings are plain JSON. Invisible or ambiguous characters are written as `\uXXXX` escapes, so the formatter skips
`spec/**/*.json`. Lone surrogates are not valid in strict JSON, so cases that need them are given as UTF-16 code
units in a separate `*Utf16` section that only UTF-16 languages (JavaScript, JVM) apply.

## What stays out

Cases that only make sense in one language remain in that implementation's own tests: runtime type checks on
dynamically typed input, exact error messages, randomness mocking, and public type signatures.

## Rules not expressed as cases

- Validation reports the first failing rule in this order: type, format, repeated digits, checksum.
- Options are validated before the input value.
- Generation never returns a base made of a single repeated digit.
