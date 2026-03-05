// lib/use-nostr-connect.ts
"use client";

import { useState, useEffect, useRef } from "react";
import { generateSecretKey, getPublicKey, finalizeEvent, nip44, nip04 } from "nostr-tools";
import { SimplePool } from "nostr-tools";

interface NostrConnectState {
  uri: string | null;
  connected: boolean;
  remotePubkey: string | null;
  isWaiting: boolean;
}

// Dedicated NIP-46 relays used by major signers
const NIP46_RELAYS = [
  "wss://relay.nsec.app",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
];

async function encryptAck(
  content: string,
  secretBytes: Uint8Array,
  signerPubkey: string,
  usedNip44: boolean
): Promise<string> {
  if (usedNip44) {
    const convKey = nip44.getConversationKey(secretBytes, signerPubkey);
    return nip44.encrypt(content, convKey);
  }
  const secretHex = Array.from(secretBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return nip04.encrypt(secretHex, signerPubkey, content);
}

export function useNostrConnect(relays: string[]) {
  const [state, setState] = useState<NostrConnectState>({
    uri: null,
    connected: false,
    remotePubkey: null,
    isWaiting: false,
  });

  const clientSecretKey = useRef<Uint8Array | null>(null);
  const pool = useRef<SimplePool>(new SimplePool());
  const subscriptionRef = useRef<any>(null);

  const generateConnectionUri = () => {
    const secretBytes = generateSecretKey();
    clientSecretKey.current = secretBytes;
    const pubkey = getPublicKey(secretBytes);

    // Random secret that the signer must echo back
    const randBytes = new Uint8Array(16);
    crypto.getRandomValues(randBytes);
    const secret = Array.from(randBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Merge dedicated NIP-46 relays with app relays, deduped
    const allRelays = [...new Set([...NIP46_RELAYS, ...relays])];

    const params = new URLSearchParams();
    allRelays.forEach(relay => params.append("relay", relay));
    params.append("secret", secret);
    params.append("name", "NostrDraw");
    params.append("url", typeof window !== "undefined" ? window.location.origin : "https://drawstr.vercel.app");

    const uri = `nostrconnect://${pubkey}?${params.toString()}`;
    console.log("[NIP-46] Generated URI:", uri);

    setState(prev => ({ ...prev, uri, isWaiting: true }));
    startListening(pubkey, secretBytes, secret, allRelays);
  };

  const startListening = (
    pubkey: string,
    secretBytes: Uint8Array,
    secret: string,
    listenRelays: string[]
  ) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
    }

    console.log("[NIP-46] Listening on relays:", listenRelays);

    subscriptionRef.current = pool.current.subscribeMany(
      listenRelays,
      [
        {
          kinds: [24133],
          "#p": [pubkey],
          since: Math.floor(Date.now() / 1000) - 10,
        },
      ] as any,
      {
        async onevent(event: any) {
          console.log("[NIP-46] Received event from:", event.pubkey);
          const signerPubkey: string = event.pubkey;
          let decrypted: string;
          let usedNip44 = true;

          try {
            const convKey = nip44.getConversationKey(secretBytes, signerPubkey);
            decrypted = nip44.decrypt(event.content, convKey);
            console.log("[NIP-46] Decrypted (NIP-44):", decrypted);
          } catch {
            console.log("[NIP-46] NIP-44 failed, trying NIP-04...");
            usedNip44 = false;
            try {
              const secretHex = Array.from(secretBytes).map(b => b.toString(16).padStart(2, "0")).join("");
              decrypted = nip04.decrypt(secretHex, signerPubkey, event.content);
              console.log("[NIP-46] Decrypted (NIP-04):", decrypted);
            } catch (err) {
              console.error("[NIP-46] Both NIP-44 and NIP-04 decryption failed:", err);
              return;
            }
          }

          try {
            const message = JSON.parse(decrypted);
            console.log("[NIP-46] Method:", message.method, "Params:", message.params);

            if (message.method === "connect") {
              const userPubkey: string = message.params?.[0] ?? signerPubkey;
              const receivedSecret: string | undefined = message.params?.[1];

              if (receivedSecret && receivedSecret !== secret) {
                console.warn("[NIP-46] Secret mismatch, ignoring. Got:", receivedSecret, "Expected:", secret);
                return;
              }

              // Send ACK using same encryption the signer used
              const response = JSON.stringify({ id: message.id, result: secret, error: null });
              const encrypted = await encryptAck(response, secretBytes, signerPubkey, usedNip44);

              const ackEvent = finalizeEvent(
                {
                  kind: 24133,
                  created_at: Math.floor(Date.now() / 1000),
                  tags: [["p", signerPubkey]],
                  content: encrypted,
                },
                secretBytes
              );

              await Promise.allSettled(pool.current.publish(listenRelays, ackEvent));
              console.log("[NIP-46] ACK sent, user pubkey:", userPubkey);

              setState(prev => ({
                ...prev,
                connected: true,
                remotePubkey: userPubkey,
                isWaiting: false,
              }));

              subscriptionRef.current?.close();
            }
          } catch (err) {
            console.error("[NIP-46] Failed to parse/handle message:", err);
          }
        },
        oneose() {
          console.log("[NIP-46] EOSE - subscription active, waiting for signer...");
        },
      }
    );
  };

  const reset = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
    }
    clientSecretKey.current = null;
    setState({ uri: null, connected: false, remotePubkey: null, isWaiting: false });
  };

  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.close();
      }
    };
  }, []);

  return { ...state, generateConnectionUri, reset };
}
