/**
 * How a person signs public content: first name and last-name initial
 * ("Juan P."), never the full name. Shared by ratings (CU45) and community
 * experiences (#106).
 */
export function authorAlias(name: string, lastName: string): string {
  return `${name} ${lastName.slice(0, 1).toUpperCase()}.`;
}
