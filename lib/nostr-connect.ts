import { SimplePool, getPublicKey, finalizeEvent, nip04, type Event, type UnsignedEvent } from "nostr-tools";

export interface NostrConnectClient {
  pubkey: string;
  relay: string;
  secret: string;
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
  // Generar claves temporales para la conexión
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const pubkey = getPublicKey(secret);
  
  const pool = new SimplePool();
  
  return {
    pubkey,
    relay: config.relay,
    secret: Array.from(secret).map(b => b.toString(16).padStart(2, '0')).join(''),
    pool,
    onConnect: config.onConnect,
    onError: config.onError,
  };
}

export function generateBunkerUri(client: NostrConnectClient): string {
  // Usar relay.damus.io porque está en ambos lados
  return `nostrconnect://${client.pubkey}?relay=${encodeURIComponent("wss://relay.damus.io")}`;
}

export async function listenForConnection(
  client: NostrConnectClient,
  secretKey: Uint8Array,
  allRelays: string[]
): Promise<() => void> {
  
  console.log("🎧 Listening on relays:", allRelays);
  console.log("🎧 Our pubkey:", client.pubkey);
  console.log("🎧 Looking for events with #p tag:", client.pubkey);
  
  const sub = client.pool.subscribeMany(
    allRelays,
    [
      {
        kinds: [24133],
        "#p": [client.pubkey],
        since: Math.floor(Date.now() / 1000) - 60,
      },
    ] as any,
    {
      async onevent(event: Event) {
        console.log("📨 RAW EVENT RECEIVED:", JSON.stringify(event, null, 2));
        console.log("📨 From pubkey:", event.pubkey);
        console.log("📨 Tags:", event.tags);
        console.log("📨 Content (encrypted):", event.content);
        
        try {
          // Intentar desencriptar con NIP-04
          const decrypted = await nip04.decrypt(
            secretKey,
            event.pubkey,
            event.content
          );
          
          console.log("🔓 Decrypted:", decrypted);
          const message = JSON.parse(decrypted);
          
          // Amber envía method: "connect"
          if (message.method === "connect") {
            console.log("✅ Connection established!");
            client.clientPubkey = event.pubkey;
            
            // Responder
            const response = {
              id: message.id,
              result: "ack",
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
            await client.pool.publish(allRelays, signed as Event);
            
            client.onConnect(event.pubkey);
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