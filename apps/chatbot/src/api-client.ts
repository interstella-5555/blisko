const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TokenEntry {
  userId: string;
  token: string;
}

const tokens = new Map<string, TokenEntry>();

export async function getToken(email: string): Promise<TokenEntry> {
  const cached = tokens.get(email);
  if (cached) return cached;

  const res = await fetch(`${API_URL}/dev/auto-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const entry: TokenEntry = { userId: data.user.id, token: data.token };
  tokens.set(email, entry);
  return entry;
}

async function trpc(
  path: string,
  token: string,
  input: unknown,
  method: 'query' | 'mutation' = 'mutation',
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  if (method === 'query') {
    const encoded = encodeURIComponent(JSON.stringify(input));
    const res = await fetch(`${API_URL}/trpc/${path}?input=${encoded}`, { headers });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data.result?.data;
  }

  const res = await fetch(`${API_URL}/trpc/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result?.data;
}

export async function respondToWave(
  token: string,
  waveId: string,
  accept: boolean,
): Promise<{ conversationId: string | null }> {
  const result = await trpc('waves.respond', token, { waveId, accept });
  return { conversationId: result.conversationId ?? null };
}

export async function sendMessage(
  token: string,
  conversationId: string,
  content: string,
): Promise<void> {
  await trpc('messages.send', token, { conversationId, content, metadata: { source: 'chatbot' } });
}
