const registeredNames = new Set<string>();

export function preparedName(name: string): string {
  if (registeredNames.has(name)) {
    throw new Error(`Duplicate prepared statement name: "${name}"`);
  }
  registeredNames.add(name);
  return name;
}
