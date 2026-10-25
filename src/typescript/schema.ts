import ts from "typescript";
import { propertyKey } from "../naming.js";

const MAX_DEPTH = 3;

function isArrayType(type: ts.Type, checker: ts.TypeChecker): type is ts.TypeReference {
  if (!(type.flags & ts.TypeFlags.Object)) return false;
  const objectType = type as ts.ObjectType;
  if (!(objectType.objectFlags & ts.ObjectFlags.Reference)) return false;
  const typeReference = type as ts.TypeReference;
  return checker.getTypeArguments(typeReference).length > 0 && type.symbol?.name === "Array";
}

function stringLiteralValues(type: ts.Type): string[] | null {
  if (!type.isUnion()) return type.isStringLiteral() ? [type.value] : null;
  const values: string[] = [];
  for (const part of type.types) {
    if (part.isStringLiteral()) {
      values.push(part.value);
    } else {
      return null;
    }
  }
  return values;
}

function nonNullableParts(type: ts.Type): ts.Type[] {
  if (!type.isUnion()) return [type];
  return type.types.filter((part) => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
}

export function typeToZod(
  type: ts.Type,
  checker: ts.TypeChecker,
  seen: Set<ts.Type> = new Set(),
  depth = 0,
): string {
  const enumValues = stringLiteralValues(type);
  if (enumValues) {
    return enumValues.length === 1
      ? `z.literal(${JSON.stringify(enumValues[0])})`
      : `z.enum([${enumValues.map((v) => JSON.stringify(v)).join(", ")}])`;
  }

  if (type.flags & ts.TypeFlags.String) return "z.string()";
  if (type.flags & ts.TypeFlags.Number) return "z.number()";
  if (type.flags & ts.TypeFlags.Boolean) return "z.boolean()";
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return "z.unknown()";

  if (type.isUnion()) {
    const hasNull = type.types.some((part) => Boolean(part.flags & ts.TypeFlags.Null));
    const parts = nonNullableParts(type);
    if (parts.length === 0) return hasNull ? "z.null()" : "z.unknown()";
    const converted = parts.map((part) => typeToZod(part, checker, seen, depth));
    const unique = [...new Set(converted)];
    const base = unique.length === 1 ? unique[0] : `z.union([${unique.join(", ")}])`;
    return hasNull ? `${base}.nullable()` : base;
  }

  if (depth >= MAX_DEPTH) return "z.unknown()";

  if (isArrayType(type, checker)) {
    const [elementType] = checker.getTypeArguments(type);
    return `z.array(${elementType ? typeToZod(elementType, checker, seen, depth + 1) : "z.unknown()"})`;
  }

  if (type.flags & ts.TypeFlags.Object) {
    if (seen.has(type)) return "z.unknown()";
    const properties = type.getProperties();
    if (properties.length === 0) return "z.record(z.string(), z.unknown())";

    const nextSeen = new Set(seen).add(type);
    const entries = properties.map((prop) => {
      const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
      const propType = declaration
        ? checker.getTypeOfSymbolAtLocation(prop, declaration)
        : checker.getAnyType();
      const isOptional = Boolean(prop.flags & ts.SymbolFlags.Optional);
      const zodType = typeToZod(propType, checker, nextSeen, depth + 1);
      return `${propertyKey(prop.name)}: ${isOptional ? `${zodType}.optional()` : zodType}`;
    });
    return `z.object({ ${entries.join(", ")} })`;
  }

  return "z.unknown()";
}

export function typeToTsString(type: ts.Type, checker: ts.TypeChecker): string {
  return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
}
