import { SimplePool, getPublicKey, finalizeEvent, nip04, type Event, type UnsignedEvent } from "nostr-tools";

export interface NostrConnectClient {
  pubkey: string;
  relay: string;
  secret: string;
  sessionSecret: string; // short token for nostrconnect URI
  clientPubkey?: string;
  pool: SimplePool;
  onConnect: (pubkey: string) => void;
  onError: (error: string) => void;
}

export function createNostrConnectClient(config: {
  relay: string;
  onConnect: (pubkey: string) => void;
  onError: (error: string) => void;
}): NostrConnectClient {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const pubkey = getPublicKey(secret);

  // Short random token for the nostrconnect URI secret param
  const sessionBytes = new Uint8Array(8);
  crypto.getRandomValues(sessionBytes);
  const sessionSecret = Array.from(sessionBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const pool = new SimplePool();

  return {
    pubkey,
    relay: config.relay,
    secret: Array.from(secret).map(b => b.toString(16).padStart(2, '0')).join(''),
    sessionSecret,
    pool,
    onConnect: config.onConnect,
    onError: config.onError,
  };
}

export function generateBunkerUri(client: NostrConnectClient): string {
  // Amber escanea QR con formato nostrconnect:// (no bunker://)
  // nostrconnect:// = el cliente genera el URI para que el signer escanee
  // bunker://       = el signer genera el URI para que el cliente ingrese (flujo inverso)
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
  secretKey: Uint8Array,
  allRelays: string[]
): Promise<() => void> {

  // Amber funciona mejor con relay.damus.io, ponerlo primero
  const relaysToUse = [
    "wss://relay.damus.io",
    ...allRelays.filter(r => r !== "wss://relay.damus.io"),
  ];

  console.log("🎧 Listening on relays:", relaysToUse);
  console.log("🎧 Our pubkey:", client.pubkey);
  console.log("🎧 Session secret:", client.sessionSecret);

  const sub = client.pool.subscribeMany(
    relaysToUse,
    [
      {
        kinds: [24133],
        "#p": [client.pubkey],
        // Sin "since" para no filtrar eventos recientes
      },
    ] as any,
    {
      async onevent(event: Event) {
        console.log("📨 RAW EVENT RECEIVED from:", event.pubkey);

        try {
          // Desencriptar con NIP-04
          const decrypted = await nip04.decrypt(
            secretKey,
            event.pubkey,
            event.content
          );

          console.log("🔓 Decrypted:", decrypted);
          const message = JSON.parse(decrypted);
          console.log("📩 Message method:", message.method, "| params:", message.params);

          if (message.method === "connect") {
            // params[0] = remote user pubkey, params[1] = secret token
            const userPubkey = message.params?.[0] ?? event.pubkey;
            const receivedSecret = message.params?.[1];

            // Verificar que el secret coincide con el que generamos
            if (receivedSecret && receivedSecret !== client.sessionSecret) {
              console.warn("⚠️ Secret mismatch, ignoring event");
              return;
            }

            console.log("✅ Connection established with user pubkey:", userPubkey);
            client.clientPubkey = event.pubkey;

            // Responder con ACK incluyendo el secret de vuelta
            const response = {
              id: message.id,
              result: client.sessionSecret,
              error: null,
            };

            const encrypted = await nip04.encrypt(
              secretKey,
              event.pubkey,
              JSON.stringify(response)
            );

            const responseEvent = {
              kind: 24133,
              created_at: Math.floor(Date.now() / 1000),
              tags: [["p", event.pubkey]],
              content: encrypted,
              pubkey: client.pubkey,
            };

            const signed = finalizeEvent(responseEvent as UnsignedEvent, secretKey);
            await Promise.allSettled(client.pool.publish(relaysToUse, signed as Event));
            console.log("📤 ACK sent");

            client.onConnect(userPubkey);
          }
        } catch (err) {
          console.error("❌ Error processing event:", err);
        }
      },
      oneose() {
        console.log("✅ Subscription active, waiting for events...");
      },
    }
  );

  return () => {
    console.log("🧹 Cleaning up listener");
    sub.close();
  };
}

// Helper para convertir hex a bytes
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}