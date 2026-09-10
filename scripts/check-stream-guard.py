#!/usr/bin/env python3
"""Refuse a gate script that can print a character its console cannot encode.

A Windows console decodes cp1252 by default. A script that prints a typographic
dash, a middot or an arrow therefore raises UnicodeEncodeError there -- and it
raises it on the run that HAS a finding to report, never on a quiet one, so the
gate reads as healthy in precisely the state where its output is needed.

The remedy is one statement in the module body:

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

It is a no-op wherever the stream already encodes UTF-8, so it costs nothing on
POSIX and rescues every run on Windows.

The guard has to be a statement in the module body. Spliced into the docstring
it is prose, and prose reconfigures nothing -- which is why the check reads the
parsed tree rather than grepping for the word.

So there are two rules. Presence: a module that prints carries the guard in its
body. Placement: the guard's opening statement never sits at column 0 inside the
module docstring.

Presence asks of every printing module rather than only of one holding non-ASCII
text in its own source, because the characters that break a console usually arrive
at run time from somewhere else -- a ledger row, a design title, a locale catalogue
entry -- and a module whose own literals are all ASCII is the exact shape that
escaped the narrower rule and shipped unguarded under a green run. The guard is one
statement and a no-op wherever the stream already encodes UTF-8, so what it costs is
a line and what it protects is the module's next print.

Placement exists because a bulk pass once wrote the guard's text into docstrings
across the ecosystem, splitting a sentence in half, and where no later commit added
the real statement below the imports the module ran unguarded while reading as
though it did not. Column 0 is the whole discriminator: a block quoted in prose is
indented, as the one above is, and an indented quotation is documentation.

Exit 0 when every script that needs the guard carries it in its body and none
carries a copy in its docstring, 1 on any violation, 2 when the scripts
directory cannot be read.
"""

from __future__ import annotations

import argparse
import ast
import pathlib
import sys
import tempfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SCRIPTS = pathlib.Path(__file__).resolve().parent

# A gate that read no files cannot tell a clean tree from a blinded one, so a census
# below this floor fails. The floor is deliberately far under the real count -- it
# catches a moved root or a broken glob, and never has to move when scripts land.
CENSUS_FLOOR = 10

GUARD_SRC = (
    'if hasattr(sys.stdout, "reconfigure"):\n'
    '    sys.stdout.reconfigure(encoding="utf-8", errors="replace")\n'
    '    sys.stderr.reconfigure(encoding="utf-8", errors="replace")\n'
)

# The placement rule keys on the guard's opening statement, taken from the guard
# itself so the two cannot drift apart. Its two body lines are indented already,
# and a splice carries the whole block, so the head is the line that identifies
# one wherever it landed.
GUARD_HEAD = GUARD_SRC.splitlines()[0]


def needs_guard(tree: ast.Module) -> bool:
    """True when the module calls `print`.

    Nothing narrower survives contact. A module whose own literals are all ASCII
    still prints whatever it read from a file, and that is where the character a
    cp1252 console cannot encode usually comes from. A module that never prints has
    nothing to guard and is never asked.
    """
    return any(isinstance(n, ast.Name) and n.id == "print" for n in ast.walk(tree))


def reconfigures(node: ast.AST) -> bool:
    """True when a real call to `.reconfigure` sits under node, above any `def`.

    The walk stops at every `def` and `class`, because a guard inside a function
    runs when that function is called, which is not the same promise as running at
    import. It tests for an `ast.Call`, not for the word: the remedy this gate
    prints, and every docstring quoting the guard, are string constants, and a rule
    that read text would take them for the thing itself.
    """
    stack = [node]
    while stack:
        current = stack.pop()
        if isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        if (
            isinstance(current, ast.Call)
            and isinstance(current.func, ast.Attribute)
            and current.func.attr == "reconfigure"
        ):
            return True
        stack.extend(ast.iter_child_nodes(current))
    return False


def has_guard(tree: ast.Module) -> bool:
    """True when a module-body statement reconfigures a stream at import.

    Within a module-body statement the shape is free, because what matters is that
    the call runs before anything prints. The estate writes it as an `if hasattr`
    block, as a `for` over both streams, and as a bare call, and all three
    reconfigure; a rule that admitted only the first would report two sound modules
    as unguarded and teach its reader to work around it.
    """
    return any(reconfigures(n) for n in tree.body)


def spliced(doc: str) -> list[int]:
    """Docstring line numbers, 1-based, where the guard's head sits at column 0.

    Indentation is the whole test. A code block quoted inside prose is indented --
    this module's own explanation of the guard quotes it under four spaces, and
    that quotation is documentation. Flush against the margin the same text is a
    splice that landed in the docstring instead of the module body, where it
    reconfigures nothing and breaks the sentence it fell into.
    """
    return [
        number
        for number, line in enumerate(doc.splitlines(), 1)
        if line.startswith(GUARD_HEAD)
    ]


def unguarded(root: pathlib.Path) -> tuple[list[str], list[str], list[str]]:
    """Return (violations, misplaced, unparsable) for every *.py under root, at any depth.

    Recursive rather than top-level. A top-level glob grows a scope hole the moment a
    subdirectory appears under `scripts/`, and a gate that never asks reads exactly
    like a clean tree -- four repositories in this ecosystem keep a generator package
    there whose modules print the most translated text in the estate, so the hole is
    measured rather than hypothetical.

    A module can appear in both lists. The two rules are independent: one asks
    whether the guard runs, the other where its text was written.
    """
    violations: list[str] = []
    misplaced: list[str] = []
    unparsable: list[str] = []
    for path in sorted(root.rglob("*.py")):
        try:
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source)
        except (OSError, SyntaxError, UnicodeDecodeError) as err:
            unparsable.append(f"{path.relative_to(root).as_posix()}: {err}")
            continue
        doc = ast.get_docstring(tree, clean=False) or ""
        if needs_guard(tree) and not has_guard(tree):
            violations.append(path.relative_to(root).as_posix())
        lines = spliced(doc)
        if lines:
            live = "the module body guards the streams too, so only the prose is wrong"
            dead = "and the module body guards nothing, so this module runs unguarded"
            state = live if has_guard(tree) else dead
            numbers = ", ".join(str(n) for n in lines)
            misplaced.append(
                f"{path.relative_to(root).as_posix()}: docstring line {numbers} -- {state}"
            )
    return violations, misplaced, unparsable


# The legitimate shape: the same block, indented, the way prose quotes code.
GUARD_QUOTED = "".join(f"    {line}\n" for line in GUARD_SRC.splitlines())

# Each case is (label, source, flagged by the presence rule, flagged by placement).
SELFTEST_CASES = [
    ("prints a non-ASCII literal, no guard", 'print("a — b")\n', True, False),
    ("prints a non-ASCII literal, guarded", "import sys\n" + GUARD_SRC + 'print("a — b")\n', False, False),
    ("prints only ASCII, and prints what it read from a file", 'print(open("f").read())\n', True, False),
    ("non-ASCII literal, never prints", 'X = "a — b"\n', False, False),
    ("prints only ASCII, guarded", "import sys\n" + GUARD_SRC + 'print("plain")\n', False, False),
    ("guarded by a loop over both streams", 'import sys\nfor stream in (sys.stdout, sys.stderr):\n    if hasattr(stream, "reconfigure"):\n        stream.reconfigure(encoding="utf-8", errors="replace")\nprint("plain")\n', False, False),
    ("guarded by a bare module-level call", 'import sys\nsys.stdout.reconfigure(encoding="utf-8", errors="replace")\nprint("plain")\n', False, False),
    ("the remedy printed as advice is a string, not a call", 'print("  sys.stdout.reconfigure(encoding=\\"utf-8\\")")\n', True, False),
    ("guard sits inside a function, so it does not run at import", 'import sys\ndef f():\n    ' + GUARD_SRC.replace("\n", "\n    ").rstrip() + '\nprint("a — b")\n', True, False),
    ("guard spliced into the docstring is prose", '"""' + GUARD_SRC + '"""\nprint("a — b")\n', True, True),
    ("non-ASCII reaches the stream through an f-string", 'v = 1\nprint(f"{v} · ok")\n', True, False),
    ("a live guard and a copy spliced into the docstring", '"""Prose.\n\n' + GUARD_SRC + '\nMore prose.\n"""\nimport sys\n' + GUARD_SRC + 'print("a — b")\n', False, True),
    ("the guard exists only in the docstring, so nothing runs it", '"""Prose.\n\n' + GUARD_SRC + '\nMore prose.\n"""\nprint("plain")\n', True, True),
    ("the docstring quotes the guard indented, which is documentation", '"""Prose.\n\n' + GUARD_QUOTED + '\nMore prose.\n"""\nimport sys\n' + GUARD_SRC + 'print("a — b")\n', False, False),
]


def selftest() -> int:
    """Prove each rule fires, over synthetic files, in a throwaway directory."""
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        for index, (label, source, want_flag, want_splice) in enumerate(SELFTEST_CASES):
            path = root / f"case_{index}.py"
            path.write_text(source, encoding="utf-8", newline="\n")
            violations, misplaced, unparsable = unguarded(root)
            got = (path.name in violations, any(m.startswith(f"{path.name}:") for m in misplaced))
            if unparsable:
                print(f"check-stream-guard --selftest: FAIL {label} -- unparsable: {unparsable}")
                failures += 1
            elif got != (want_flag, want_splice):
                print(
                    f"check-stream-guard --selftest: FAIL {label} -- wanted"
                    f" (unguarded={want_flag}, misplaced={want_splice}), got"
                    f" (unguarded={got[0]}, misplaced={got[1]})"
                )
                failures += 1
            path.unlink()
        # The recursion is a rule, so it gets a case that fails without it. The
        # source is case 0's, which the loop above already proved the presence rule
        # flags -- so a red here can only be the scan scope.
        nested = root / "package" / "module.py"
        nested.parent.mkdir()
        nested.write_text(SELFTEST_CASES[0][1], encoding="utf-8", newline="\n")
        nested_violations, _, _ = unguarded(root)
        if nested_violations != ["package/module.py"]:
            print(
                "check-stream-guard --selftest: FAIL a script in a subdirectory of"
                f" scripts/ was never asked -- got {nested_violations}"
            )
            failures += 1
        nested.unlink()
        nested.parent.rmdir()
        empty_violations, empty_misplaced, _ = unguarded(root)
        if empty_violations or empty_misplaced:
            print("check-stream-guard --selftest: FAIL an empty directory reported violations")
            failures += 1
        if len(list(root.rglob("*.py"))) >= CENSUS_FLOOR:
            print("check-stream-guard --selftest: FAIL the empty case is above the census floor")
            failures += 1
    total = len(SELFTEST_CASES) + 3
    print(f"check-stream-guard --selftest: {total - failures}/{total} passed")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selftest", action="store_true", help="prove the rules bite")
    args = parser.parse_args(argv[1:])
    if args.selftest:
        return selftest()

    if not SCRIPTS.is_dir():
        print(f"check-stream-guard: {SCRIPTS} is not a directory", file=sys.stderr)
        return 2

    violations, misplaced, unparsable = unguarded(SCRIPTS)
    scanned = len(list(SCRIPTS.rglob("*.py")))
    if scanned < CENSUS_FLOOR:
        print(
            f"check-stream-guard: scanned {scanned} script(s) under {SCRIPTS}, below the"
            f" floor of {CENSUS_FLOOR}. A gate that examined nothing reports success"
            " indistinguishable from a clean tree, so this is a failure rather than a"
            " pass: the root moved, the glob was blinded, or the checkout is partial.",
            file=sys.stderr,
        )
        return 2
    print(
        f"stream guard: scripts={scanned}  unguarded={len(violations)}"
        f"  misplaced={len(misplaced)}"
    )
    for name in unparsable:
        print(f"  unparsable: {name}", file=sys.stderr)
    if violations:
        print(
            "check-stream-guard: a script can print a character its console may not"
            " hold, and the guard is missing or is not a module-level statement:",
            file=sys.stderr,
        )
        for name in violations:
            print(f"  {name}", file=sys.stderr)
        print(
            "  add, beside the imports:\n"
            '    if hasattr(sys.stdout, "reconfigure"):\n'
            '        sys.stdout.reconfigure(encoding="utf-8", errors="replace")\n'
            '        sys.stderr.reconfigure(encoding="utf-8", errors="replace")',
            file=sys.stderr,
        )
    if misplaced:
        print(
            "check-stream-guard: the guard's opening statement sits at column 0 inside"
            " a module docstring, where it is prose and reconfigures nothing:",
            file=sys.stderr,
        )
        for entry in misplaced:
            print(f"  {entry}", file=sys.stderr)
        print(
            "  move it below the imports, and restore the sentence it landed in. To"
            " quote the guard in prose on purpose, indent the block -- an indented"
            " quotation is documentation and passes.",
            file=sys.stderr,
        )
    if violations or misplaced:
        return 1
    if unparsable:
        return 2
    print("check-stream-guard: OK - every script that can print non-ASCII reconfigures first.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
