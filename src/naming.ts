const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isValidIdentifier(name: string): boolean {
  return VALID_IDENTIFIER.test(name);
}

export function propertyKey(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name);
}

export function argAccess(name: string): string {
  return isValidIdentifier(name) ? `args.${name}` : `args[${JSON.stringify(name)}]`;
}

export function toSnakeCase(input: string): string {
  const withUnderscores = input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase();
  const trimmed = withUnderscores.replace(/^_+|_+$/g, "").replace(/_+/g, "_");
  return trimmed.length > 0 ? trimmed : "unnamed";
}

export function toolNameFrom(input: string): string {
  const snake = toSnakeCase(input);
  return /^[0-9]/.test(snake) ? `tool_${snake}` : snake;
}

export function uniqueName(base: string, taken: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}
