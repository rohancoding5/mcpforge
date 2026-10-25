import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidIdentifier, propertyKey, argAccess, toSnakeCase, toolNameFrom, uniqueName } from "../naming.js";

test("isValidIdentifier accepts plain identifiers and rejects the rest", () => {
  assert.equal(isValidIdentifier("userId"), true);
  assert.equal(isValidIdentifier("_private"), true);
  assert.equal(isValidIdentifier("user-id"), false);
  assert.equal(isValidIdentifier("1id"), false);
});

test("propertyKey quotes only when needed", () => {
  assert.equal(propertyKey("userId"), "userId");
  assert.equal(propertyKey("user-id"), '"user-id"');
});

test("argAccess uses dot or bracket notation to match propertyKey", () => {
  assert.equal(argAccess("userId"), "args.userId");
  assert.equal(argAccess("user-id"), 'args["user-id"]');
});

test("toSnakeCase handles camelCase, spaces, and punctuation", () => {
  assert.equal(toSnakeCase("getUserById"), "get_user_by_id");
  assert.equal(toSnakeCase("Find Pets By Status"), "find_pets_by_status");
  assert.equal(toSnakeCase("GET /users/{id}"), "get_users_id");
});

test("toSnakeCase falls back to a placeholder for empty input", () => {
  assert.equal(toSnakeCase("!!!"), "unnamed");
});

test("toolNameFrom prefixes a leading digit", () => {
  assert.equal(toolNameFrom("2fa_check"), "tool_2fa_check");
  assert.equal(toolNameFrom("getUser"), "get_user");
});

test("uniqueName disambiguates repeated names", () => {
  const taken = new Set<string>();
  assert.equal(uniqueName("get_user", taken), "get_user");
  assert.equal(uniqueName("get_user", taken), "get_user_2");
  assert.equal(uniqueName("get_user", taken), "get_user_3");
});
