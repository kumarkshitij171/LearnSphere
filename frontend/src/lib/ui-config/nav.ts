/** Nav items this user should see: enabled, and either open to everyone or to their role. */
export function visibleNav<T extends { enabled: boolean; roles: string[] }>(items: T[], role?: string): T[] {
  return items.filter((item) => item.enabled && (item.roles.length === 0 || (!!role && item.roles.includes(role))));
}
