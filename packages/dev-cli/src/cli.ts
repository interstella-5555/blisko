import { Command } from "commander";

const API = process.env.API_URL || "http://localhost:3000";

// ── Token cache (avoids repeated auto-logins within a session) ──────

const tokenCache = new Map<string, { userId: string; token: string }>();

async function resolveUser(email: string) {
  const cached = tokenCache.get(email);
  if (cached) return cached;

  const res = await fetch(`${API}/dev/auto-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const entry = { userId: data.user.id, token: data.token };
  tokenCache.set(email, entry);
  return entry;
}

// ── HTTP helpers ──────────────────────────────────────────────────────

async function trpc(
  path: string,
  token: string,
  input: unknown,
  method: "query" | "mutation" = "mutation"
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  if (method === "query") {
    const encoded = encodeURIComponent(JSON.stringify(input));
    const res = await fetch(`${API}/trpc/${path}?input=${encoded}`, {
      headers,
    });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error, null, 2));
    return data.result?.data;
  }

  const res = await fetch(`${API}/trpc/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error, null, 2));
  return data.result?.data;
}

// ── CLI setup ─────────────────────────────────────────────────────────

const program = new Command();

program
  .name("blisko-dev")
  .description("Dev CLI for testing Blisko API")
  .version("0.1.0");

program
  .command("create-user")
  .description("Create user + profile + location")
  .argument("<email>", "email (e.g. marta@example.com)")
  .argument("<displayName>", "display name (e.g. Marta)")
  .action(async (email: string, displayName: string) => {
    const { userId, token } = await resolveUser(email);

    // Create profile (ignore if already exists)
    try {
      await trpc("profiles.create", token, {
        displayName,
        bio: `Czesc! Jestem ${displayName} i szukam nowych znajomosci.`,
        lookingFor: `Szukam ludzi do wspolnych aktywnosci w okolicy.`,
      });
    } catch (e: any) {
      const msg = String(e);
      if (!msg.includes("CONFLICT") && !msg.includes("already")) throw e;
    }

    // Set location (Warsaw center with some jitter)
    const lat = 52.23 + (Math.random() - 0.5) * 0.02;
    const lon = 21.01 + (Math.random() - 0.5) * 0.02;
    await trpc("profiles.updateLocation", token, {
      latitude: lat,
      longitude: lon,
    });

    console.log(`  ✓ ${displayName} (${userId})`);
  });

program
  .command("send-wave")
  .description("Send a wave")
  .requiredOption("--from <email>", "sender email")
  .requiredOption("--to <email>", "recipient email")
  .argument("[message]", "optional wave message")
  .action(async (message: string | undefined, opts: { from: string; to: string }) => {
    const from = await resolveUser(opts.from);
    const to = await resolveUser(opts.to);
    const wave = await trpc("waves.send", from.token, {
      toUserId: to.userId,
      ...(message ? { message } : {}),
    });
    console.log(`  ✓ Wave sent  id=${wave.id}`);
  });

program
  .command("waves")
  .description("Show received & sent waves")
  .argument("<email>", "user email")
  .action(async (email: string) => {
    const { token } = await resolveUser(email);

    const received = await trpc("waves.getReceived", token, undefined, "query");
    const sent = await trpc("waves.getSent", token, undefined, "query");

    console.log(`  Received (${received.length}):`);
    for (const r of received) {
      const from = r.fromProfile?.displayName ?? r.wave?.fromUserId;
      console.log(
        `    id=${r.wave.id}  from=${from}  msg=${r.wave.message ?? "—"}  status=${r.wave.status}`
      );
    }

    console.log(`  Sent (${sent.length}):`);
    for (const s of sent) {
      const to = s.toProfile?.displayName ?? s.wave?.toUserId;
      console.log(
        `    id=${s.wave.id}  to=${to}  msg=${s.wave.message ?? "—"}  status=${s.wave.status}`
      );
    }
  });

program
  .command("respond-wave")
  .description("Accept or decline a wave")
  .argument("<email>", "recipient email")
  .argument("<waveId>", "wave ID")
  .argument("<action>", "'accept' or 'decline'")
  .action(async (email: string, waveId: string, action: string) => {
    const { token } = await resolveUser(email);
    const accept = action.toLowerCase() === "accept";
    const result = await trpc("waves.respond", token, { waveId, accept });
    if (result.conversationId) {
      console.log(`  ✓ Accepted  conversationId=${result.conversationId}`);
    } else {
      console.log(`  ✓ Declined`);
    }
  });

program
  .command("chats")
  .description("List conversations")
  .argument("<email>", "user email")
  .action(async (email: string) => {
    const { token } = await resolveUser(email);
    const convos = await trpc(
      "messages.getConversations",
      token,
      undefined,
      "query"
    );

    if (convos.length === 0) {
      console.log("  No conversations yet.");
      return;
    }

    for (const c of convos) {
      const other = c.participant?.displayName ?? "?";
      const last = c.lastMessage?.content ?? "—";
      console.log(
        `  convId=${c.conversation.id}  with=${other}  last="${last}"  unread=${c.unreadCount}`
      );
    }
  });

program
  .command("messages")
  .description("Show messages in a conversation")
  .argument("<email>", "user email")
  .argument("<convId>", "conversation ID")
  .action(async (email: string, convId: string) => {
    const { token } = await resolveUser(email);
    const result = await trpc(
      "messages.getMessages",
      token,
      { conversationId: convId },
      "query"
    );

    const msgs = result.messages ?? result;
    if (!msgs || msgs.length === 0) {
      console.log("  No messages yet.");
      return;
    }

    for (const m of [...msgs].reverse()) {
      const time = new Date(m.createdAt).toLocaleTimeString();
      console.log(`  [${time}] ${m.senderId.slice(0, 8)}: ${m.content}`);
    }
  });

program
  .command("send-message")
  .description("Send a message in a conversation")
  .argument("<email>", "sender email")
  .argument("<convId>", "conversation ID")
  .argument("<text...>", "message text")
  .action(async (email: string, convId: string, text: string[]) => {
    const { token } = await resolveUser(email);
    const msg = await trpc("messages.send", token, {
      conversationId: convId,
      content: text.join(" "),
    });
    console.log(`  ✓ Sent  id=${msg.id}`);
  });

// ── Main ──────────────────────────────────────────────────────────────

program.parseAsync().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
