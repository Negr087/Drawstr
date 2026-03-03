import {
  SimplePool,
  getPublicKey,
  finalizeEvent,
  nip04,
  type Event,
  type UnsignedEvent,
} from "nostr-tools";

export interface NostrConnectClient {
  pubkey: string;
  relay: string;
  secretHex: string;
  sessionSecret: string;
  clientPubkey?: string;
  pool: SimplePool;
  onConnect: (pubkey: string) => void;
  onError: (error: string) => void;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function createNostrConnectClient(config: {
  relay: string;
  onConnect: (pubkey: string) => void;
  onError: (error: string) => void;
}): NostrConnectClient {
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secretHex = bytesToHex(secretBytes);

  const pubkey = getPublicKey(secretBytes);

  const sessionBytes = new Uint8Array(8);
  crypto.getRandomValues(sessionBytes);
  const sessionSecret = bytesToHex(sessionBytes);

  const pool = new SimplePool();

  return {
    pubkey,
    relay: config.relay,
    secretHex,
    sessionSecret,
    pool,
    onConnect: config.onConnect,
    onError: config.onError,
  };
}

export function generateBunkerUri(client: NostrConnectClient): string {
  const relay = "wss://relay.damus.io";
  const metadata = JSON.stringify({
    name: "NostrDraw",
    url: typeof window !== "undefined" ? window.location.origin : "https://drawstr.vercel.app",
    description: "Collaborative canvas on Nostr",
  });

  return (
    `nostrconnect://${client.pubkey}` +
    `?relay=${encodeURIComponent(relay)}` +
    `&secret=${client.sessionSecret}` +
    `&metadata=${encodeURIComponent(metadata)}`
  );
}

export async function listenForConnection(
  client: NostrConnectClient,
  secretHex: string,
  allRelays: string[]
): Promise<() => void> {
  const relaysToUse = [
    "wss://relay.damus.io",
    ...allRelays.filter(r => r !== "wss://relay.damus.io"),
  ];

  console.log("Listening on relays:", relaysToUse);
  console.log("Our pubkey:", client.pubkey);
  console.log("Session secret:", client.sessionSecret);

  const sub = client.pool.subscribeMany(
    relaysToUse,
    [{ kinds: [24133], "#p": [client.pubkey] }] as any,
  {
      async onevent(event: Event) {
        console.log("RAW EVENT RECEIVED from:", event.pubkey);
        try {
          const decrypted = await nip04.decrypt(secretHex, event.pubkey, event.content);
          console.log("Decrypted:", decrypted);
          const message = JSON.parse(decrypted);
          console.log("Message method:", message.method, "| params:", message.params);

          if (message.method === "connect") {
            const userPubkey = message.params?.[0] ?? event.pubkey;
            const receivedSecret = message.params?.[1];

            if (receivedSecret && receivedSecret !== client.sessionSecret) {
              console.warn("Secret mismatch, ignoring event");
              return;
            }

            console.log("Connection established with user pubkey:", userPubkey);
            client.clientPubkey = event.pubkey;

            const response = { id: message.id, result: client.sessionSecret, error: null };
            const encrypted = await nip04.encrypt(secretHex, event.pubkey, JSON.stringify(response));

            const unsignedEvent: UnsignedEvent = {
              kind: 24133,
              created_at: Math.floor(Date.now() / 1000),
              tags: [["p", event.pubkey]],
              content: encrypted,
              pubkey: client.pubkey,
            };

            const signed = finalizeEvent(unsignedEvent, hexToBytes(secretHex));
            await Promise.allSettled(client.pool.publish(relaysToUse, signed));
            console.log("ACK sent");

            client.onConnect(userPubkey);
          }
        } catch (err) {
          console.error("Error processing event:", err);
        }
      },
      oneose() {
        console.log("Subscription active, waiting for events...");
      },
    }
  );

  return () => {
    console.log("Cleaning up listener");
    sub.close();
  };
}