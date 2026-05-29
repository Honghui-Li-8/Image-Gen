interface Token {
  token: string;
  userId: string;
  createdAt: Date;
}

export const tokenStore = new Map<string, Token>();

export function resolveTokenUserId(token: string): string | null {
  return tokenStore.get(token)?.userId ?? null;
}
