import assert from "node:assert/strict";
import test from "node:test";
import { functionRange } from "../ai";

/**
 * `functionRange` decides how much source is sent to OpenAI. If it over-reads
 * we leak more of the file than we promised; if it under-reads the model gets
 * a truncated function and its patch will not splice back cleanly. Both are
 * worth a test.
 */

const SOURCE = `import sqlite3


def fetch(user_id):
    conn = sqlite3.connect("app.db")
    if user_id is None:
        return None
    conn.close()
    return 1


def safe(path):
    with open(path) as fh:
        return fh.read()
`;

test("finds the enclosing function from a line inside it", () => {
  const range = functionRange(SOURCE.split("\n"), 5);
  assert.deepEqual(range, { start: 4, end: 9 });
});

test("stops at the next top-level def rather than running to end of file", () => {
  const lines = SOURCE.split("\n");
  const range = functionRange(lines, 5);
  assert.ok(range);
  const body = lines.slice(range.start - 1, range.end).join("\n");
  assert.ok(body.includes("def fetch"));
  assert.ok(!body.includes("def safe"), "must not bleed into the following function");
});

test("finds the second function too", () => {
  const range = functionRange(SOURCE.split("\n"), 13);
  assert.ok(range);
  assert.equal(SOURCE.split("\n")[range.start - 1].trim(), "def safe(path):");
});

test("handles an indented method", () => {
  const lines = [
    "class Store:",
    "    def open_it(self, path):",
    "        f = open(path)",
    "        return f.read()",
    "",
    "    def other(self):",
    "        pass",
  ];
  const range = functionRange(lines, 3);
  assert.deepEqual(range, { start: 2, end: 4 });
});

test("returns null when there is no enclosing def", () => {
  assert.equal(functionRange(["x = 1", "y = 2"], 1), null);
});

test("returns null for an out-of-range line", () => {
  assert.equal(functionRange(SOURCE.split("\n"), 9999), null);
});
