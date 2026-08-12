# Vendor parser policy

The bundled checker provides cross-format safety checks for JSON, ARB, YAML, common PO, XLIFF, and Qt TS structures. It is not a replacement for every vendor-native parser.

When a repository provides a native linter, compiler, schema validator, CAT-tool check, or vendor SDK, run it in addition to the bundled checker. Treat the repository-native validator as authoritative for format-specific syntax and extensions. Use the bundled checker for cross-format checks such as protected tokens, numbers, dates, URLs, empty targets, and key parity.

For unsupported or extended formats:

1. Preserve the original file and work on a copy.
2. Identify the repository-native validation command.
3. Run native validation before and after localization.
4. Add a project adapter that emits units as `key -> text` and reuses the shared protected-token checks.
5. Add fixtures covering plural forms, contexts, inline codes, locked units, metadata, and vendor extensions.
6. Do not claim full format support until those fixtures pass.
