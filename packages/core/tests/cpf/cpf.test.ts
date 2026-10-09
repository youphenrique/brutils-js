import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { cpf } from "../../src/index.ts";
import { CpfError } from "../../src/utilities/cpf";
import * as cpfUtils from "../../src/utilities/cpf/utils.ts";

import spec from "../../../../spec/cpf/cases.json" with { type: "json" };

// Language-neutral cases shared with other brutils implementations; see spec/README.md.
const fixtures = spec.valid.cases;

function mockRandomDigits(digits: string) {
  const randomSpy = vi.spyOn(Math, "random");
  for (const digit of digits) {
    randomSpy.mockReturnValueOnce((Number(digit) + 0.5) / 10);
  }
  return randomSpy;
}

describe("CPF checksum conformance", () => {
  it.each(fixtures)(
    "accepts $raw and its canonical representation",
    ({ raw, formatted, masked }) => {
      for (const value of [raw, formatted]) {
        expect(cpf.validate(value)).toEqual({ success: true, error: null });
        expect(cpf.normalize(value)).toBe(raw);
        expect(cpf.format(value)).toBe(formatted);
        expect(cpf.formatAsYouType(value)).toBe(formatted);
        expect(cpf.mask(value)).toBe(masked);
      }
    },
  );

  it.each(fixtures)("rejects independent corruption of either check digit of $raw", ({ raw }) => {
    for (const position of [9, 10]) {
      for (const replacement of "0123456789") {
        if (replacement === raw[position]) continue;
        const corrupted = raw.slice(0, position) + replacement + raw.slice(position + 1);
        for (const value of [corrupted, cpf.format(corrupted)]) {
          const result = cpf.validate(value);
          expect(result.success).toBe(false);
          expect(result.error).toBeInstanceOf(CpfError);
          expect(result.error?.code).toBe(spec.checkDigitCorruption.errorCode);
        }
      }
    }
  });

  it.each(spec.repeatedDigits.cases)("rejects %s in either shape", (raw) => {
    for (const value of [raw, cpf.format(raw)]) {
      expect(cpf.validate(value).error?.code).toBe(spec.repeatedDigits.errorCode);
    }
  });
});

describe("CPF public input matrix", () => {
  it.each(spec.malformed.cases)(
    "applies each malformed-string policy to $input",
    ({ input, normalized, asYouType }) => {
      expect(cpf.normalize(input)).toBe(normalized);
      expect(cpf.format(input)).toBe(input);
      expect(cpf.mask(input)).toBeNull();
      expect(cpf.formatAsYouType(input)).toBe(asYouType);
      expect(cpf.validate(input).error?.code).toBe(spec.malformed.errorCode);
    },
  );

  it.each(
    [
      null,
      undefined,
      12345678909,
      NaN,
      true,
      123n,
      Symbol("cpf"),
      {},
      [],
      new String("12345678909"),
      () => "12345678909",
      {
        toString() {
          throw new Error("Input must not be coerced");
        },
      },
    ].map((value) => ({ value })),
  )("handles wrong runtime type %# without coercion", ({ value }) => {
    for (const transform of [cpf.normalize, cpf.format, cpf.mask, cpf.formatAsYouType]) {
      expect(() => transform(value as never)).toThrow(TypeError);
    }
    const result = cpf.validate(value);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(CpfError);
    expect(result.error?.code).toBe("INVALID_TYPE");
  });

  it.each(spec.badChecksum.cases)(
    "formats and masks bad checksum $input without claiming validity",
    ({ input, normalized, formatted, masked }) => {
      expect(cpf.format(input)).toBe(formatted);
      expect(cpf.normalize(input)).toBe(normalized);
      expect(cpf.mask(input)).toBe(masked);
      expect(cpf.validate(input).error?.code).toBe(spec.badChecksum.errorCode);
    },
  );
});

describe("cpf.mask", () => {
  it("uses defaults for omitted options and explicit undefined properties", () => {
    expect(cpf.mask("29650899006", {})).toBe("***.***.***-06");
    expect(cpf.mask("29650899006", { char: undefined, mode: undefined })).toBe("***.***.***-06");
    expect(cpf.mask("29650899006", undefined)).toBe("***.***.***-06");
  });

  it.each(spec.mask.modes)(
    "applies $mode to $input without checking the checksum",
    ({ input, mode, expected }) => {
      expect(cpf.mask(input, { mode: mode as cpf.CpfMaskMode })).toBe(expected);
    },
  );

  it.each(spec.mask.customChar)(
    "replaces every hidden digit with $char in $mode mode",
    ({ input, char, mode, expected }) => {
      expect(cpf.mask(input, { char, mode: mode as cpf.CpfMaskMode })).toBe(expected);
    },
  );

  it("rejects invalid options containers and values with descriptive TypeErrors", () => {
    for (const options of [null, [], "redacted", 1]) {
      expect(() => cpf.mask("29650899006", options as never)).toThrow(/Expected an options object/);
    }

    for (const mode of [...spec.mask.invalidModes, 0, null, false]) {
      expect(() => cpf.mask("29650899006", { mode } as never)).toThrow(/Expected CPF mask mode/);
    }

    expect(() => cpf.mask("29650899006", { mode: "redact" } as never)).toThrow(
      'Expected CPF mask mode to be one of "suffix", "prefix-suffix", "redacted", but received "redact"',
    );
    expect(() => cpf.mask("29650899006", { char: 1 } as never)).toThrow(/but received number$/);

    const loneSurrogates = spec.mask.invalidCharsUtf16.cases.map((units) =>
      String.fromCharCode(...units),
    );
    for (const char of [...spec.mask.invalidChars.cases, ...loneSurrogates, 1, null]) {
      expect(() => cpf.mask("29650899006", { char } as never)).toThrow(/Expected CPF mask char/);
    }
  });

  it("validates options before returning null for a malformed CPF", () => {
    expect(() => cpf.mask("12", { mode: "redact" } as never)).toThrow(/Expected CPF mask mode/);
    expect(() => cpf.mask("12", { char: "0" })).toThrow(/Expected CPF mask char/);
    expect(cpf.mask("12", { mode: "redacted" })).toBeNull();
  });
});

describe("cpf.validate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("describes the received type in the INVALID_TYPE message", () => {
    expect(cpf.validate(null).error?.message).toBe(
      "Expected a string for CPF validation, but received null.",
    );
    expect(cpf.validate([]).error?.message).toMatch(/received array\.$/);
    expect(cpf.validate(123).error?.message).toMatch(/received number\.$/);
  });

  it("returns the original expected validation error", () => {
    const error = new CpfError("INVALID_FORMAT");
    vi.spyOn(cpfUtils, "assertValid").mockImplementation(() => {
      throw error;
    });
    expect(cpf.validate("52263944621").error).toBe(error);
  });

  it.each([
    new Error("Internal defect"),
    new TypeError("Internal type error"),
    { defect: true },
    "defect",
    null,
    undefined,
  ])("rethrows unexpected exceptions unchanged %#", (error) => {
    vi.spyOn(cpfUtils, "assertValid").mockImplementation(() => {
      throw error;
    });

    const caught = vi.fn();

    try {
      cpf.validate("52263944621");
    } catch (thrown) {
      caught(thrown);
    }

    expect(caught).toHaveBeenCalledExactlyOnceWith(error);
  });
});

describe("CpfError", () => {
  it("is a proper subclass of Error", () => {
    const err = new CpfError("INVALID_FORMAT");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CpfError);
  });

  it("CpfError has its properties", () => {
    const err = new CpfError("INVALID_FORMAT");
    expect(err.name).toBe("CpfError");
    expect(err.code).toBe("INVALID_FORMAT");
    // uses code as default message when no message is provided
    expect(err.message).toBe("INVALID_FORMAT");
  });

  it("uses custom message when provided", () => {
    const err = new CpfError("REPEATED_DIGITS", "Custom message");
    expect(err.message).toBe("Custom message");
  });
});

describe("cpf.generate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([undefined, {}, { formatted: undefined }, { formatted: false }, { formatted: true }])(
    "generates a CPF with options %j",
    (options) => {
      mockRandomDigits("123456789");

      expect(cpf.generate(options)).toBe(options?.formatted ? "123.456.789-09" : "12345678909");
    },
  );

  it.each(fixtures)(
    "computes the fixed fixture $raw (checksum remainders $remainders)",
    ({ raw, formatted }) => {
      const randomSpy = mockRandomDigits(raw.slice(0, 9));
      expect(cpf.generate()).toBe(raw);
      expect(randomSpy).toHaveBeenCalledTimes(9);

      mockRandomDigits(raw.slice(0, 9));
      expect(cpf.generate({ formatted: true })).toBe(formatted);
    },
  );

  it.each(Array.from({ length: 10 }, (_, digit) => digit))(
    "rerolls an all-%i base until a different digit is drawn",
    (digit) => {
      const randomSpy = vi.spyOn(Math, "random");
      const repeated = (digit + 0.5) / 10;
      const replacement = (digit + 1) % 10;
      for (let i = 0; i < 9; i += 1) {
        randomSpy.mockReturnValueOnce(repeated);
      }
      randomSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(repeated)
        .mockReturnValueOnce((replacement + 0.5) / 10);

      const generated = cpf.generate();

      expect(generated.slice(0, 9)).toBe(String(replacement) + String(digit).repeat(8));
      expect(cpf.validate(generated).success).toBe(true);
      expect(randomSpy).toHaveBeenCalledTimes(12);
    },
  );

  it.each([null, 123, "x", true, [], () => {}])(
    "throws a TypeError for invalid options container %j",
    (options) => {
      expect(() => cpf.generate(options as any)).toThrow(TypeError);
    },
  );

  it.each([null, "true", "false", "", 0, 1, {}, [], Object(false)])(
    "rejects non-boolean formatted value %j before drawing digits",
    (formatted) => {
      const randomSpy = vi.spyOn(Math, "random");

      expect(() => cpf.generate({ formatted } as any)).toThrow(
        new TypeError("Expected CPF generate formatted to be a boolean."),
      );
      expect(randomSpy).not.toHaveBeenCalled();
    },
  );
});

describe("cpf.formatAsYouType", () => {
  it.each(spec.formatAsYouType.cases)(
    "inserts separators at each boundary for $input",
    ({ input, expected }) => {
      expect(cpf.formatAsYouType(input)).toBe(expected);
    },
  );
});

// CPF scope of #34 and #38; constants remain public pending the broader API audit.
describe("CPF public surface", () => {
  it("exposes the reviewed CPF runtime namespace", () => {
    expect(Object.keys(cpf).sort()).toEqual([
      "CPF_FORMATTED_PATTERN",
      "CPF_LENGTH",
      "CPF_MASK_MODES",
      "CPF_RAW_PATTERN",
      "CpfError",
      "format",
      "formatAsYouType",
      "generate",
      "mask",
      "normalize",
      "validate",
    ]);
  });

  // Type assertions are enforced by `tsc --noEmit` (the typecheck script), not at runtime.
  it("exposes the documented public types and signatures", () => {
    expectTypeOf<cpf.CpfGenerateOptions>().toEqualTypeOf<{ formatted?: boolean }>();
    expectTypeOf<cpf.CpfMaskOptions>().toEqualTypeOf<{
      char?: string;
      mode?: "suffix" | "prefix-suffix" | "redacted";
    }>();
    expectTypeOf<cpf.CpfMaskMode>().toEqualTypeOf<"suffix" | "prefix-suffix" | "redacted">();
    expectTypeOf<cpf.CpfErrorCode>().toEqualTypeOf<
      "INVALID_TYPE" | "INVALID_FORMAT" | "REPEATED_DIGITS" | "INVALID_CHECKSUM"
    >();
    for (const transform of [cpf.normalize, cpf.format, cpf.formatAsYouType]) {
      expectTypeOf(transform).toEqualTypeOf<(value: string) => string>();
    }
    expectTypeOf(cpf.mask).toEqualTypeOf<
      (value: string, options?: cpf.CpfMaskOptions) => string | null
    >();
    expectTypeOf(cpf.generate).toEqualTypeOf<(options?: cpf.CpfGenerateOptions) => string>();
    expectTypeOf(cpf.validate).parameter(0).toEqualTypeOf<unknown>();

    // @ts-expect-error formatted is a boolean, even for JavaScript-style truthy values.
    expectTypeOf(cpf.generate).toBeCallableWith({ formatted: "true" });
    // @ts-expect-error Region control was removed in #62.
    expectTypeOf(cpf.generate).toBeCallableWith({ uf: "SP" });
    // @ts-expect-error Privacy modes use the documented literal union.
    expectTypeOf(cpf.mask).toBeCallableWith("12345678909", { mode: "invalid" });
    // @ts-expect-error Mask characters must be strings.
    expectTypeOf(cpf.mask).toBeCallableWith("12345678909", { char: 1 });
    // @ts-expect-error Padding was removed in #59.
    expectTypeOf(cpf.format).toBeCallableWith("123", { pad: true });
    // @ts-expect-error Retired validation result aliases are not public.
    expectTypeOf<cpf.CpfValidateResult>().not.toBeNever();
    // @ts-expect-error Retired padding option types are not public.
    expectTypeOf<cpf.CpfFormatOptions>().not.toBeNever();
  });

  it("narrows the validation result by success", () => {
    const result: cpf.CpfValidationResult = cpf.validate("123");

    if (result.success) {
      expectTypeOf(result.error).toEqualTypeOf<null>();
    } else {
      expectTypeOf(result.error).toEqualTypeOf<cpf.CpfError>();
      expectTypeOf(result.error.code).toEqualTypeOf<cpf.CpfErrorCode>();
      expectTypeOf(result.error).toExtend<Error>();
    }
  });
});
