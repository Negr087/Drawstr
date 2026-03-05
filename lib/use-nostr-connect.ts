// lib/use-nostr-connect.ts
"use client";

import { useState, useEffect, useRef } from "react";
import { generateSecretKey, getPublicKey, finalizeEvent, nip44 } from "nostr-tools";
import { SimplePool } from "nostr-tools";

interface NostrConnectState {
  uri: string | null;
  connected: boolean;
  remotePubkey: string | null;
  isWaiting: boolean;
}

const NIP46_RELAY = "wss://relay.nsec.app";

export function useNostrConnect(relays: string[]) {
  const [state, setState] = useState<NostrConnectState>({
    uri: null,
    connected: false,
    remotePubkey: null,
    isWaiting: false,
  });

  const clientSecretKey = useRef<Uint8Array | null>(null);
  const clientPubkey = useRef<string | null>(null);
  const sessionSecret = useRef<string | null>(null);
  const pool = useRef<SimplePool>(new SimplePool());
  const subscriptionRef = useRef<any>(null);

  const generateConnectionUri = () => {
    const secretBytes = generateSecretKey();
    clientSecretKey.current = secretBytes;
    const pubkey = getPublicKey(secretBytes);
    clientPubkey.current = pubkey;

    // Random secret that the signer must echo back
    const randBytes = new Uint8Array(16);
    crypto.getRandomValues(randBytes);
    const secret = Array.from(randBytes).map(b => b.toString(16).padStart(2, "0")).join("");
    sessionSecret.current = secret;

    // NIP-46 relays: always include relay.nsec.app which is dedicated to NIP-46
    const nip46Relays = [NIP46_RELAY, ...relays.filter(r => r !== NIP46_RELAY)];

    const params = new URLSearchParams();
    nip46Relays.forEach(relay => params.append("relay", relay));
    params.append("secret", secret);
    params.append("name", "NostrDraw");
    params.append("url", typeof window !== "undefined" ? window.location.origin : "https://drawstr.vercel.app");

    const uri = `nostrconnect://${pubkey}?${params.toString()}`;
    console.log("[NIP-46] Generated URI:", uri);

    setState(prev => ({ ...prev, uri, isWaiting: true }));
    startListening(pubkey, secretBytes, secret, nip46Relays);
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
          try {
            const signerPubkey = event.pubkey;
            const convKey = nip44.getConversationKey(secretBytes, signerPubkey);
            const decrypted = nip44.decrypt(event.content, convKey);
            console.log("[NIP-46] Decrypted:", decrypted);

            const message = JSON.parse(decrypted);
            console.log("[NIP-46] Method:", message.method, "Params:", message.params);

            if (message.method === "connect") {
              const userPubkey: string = message.params?.[0] ?? signerPubkey;
              const receivedSecret: string | undefined = message.params?.[1];

              if (receivedSecret && receivedSecret !== secret) {
                console.warn("[NIP-46] Secret mismatch, ignoring");
                return;
              }

              // Send ACK response
              const response = JSON.stringify({ id: message.id, result: secret, error: null });
              const ackConvKey = nip44.getConversationKey(secretBytes, signerPubkey);
              const encrypted = nip44.encrypt(response, ackConvKey);

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
          } catch (error) {
            console.error("[NIP-46] Failed to process event:", error);
          }
        },
        oneose() {
          console.log("[NIP-46] EOSE - waiting for signer...");
        },
      }
    );
  };

  const reset = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
    }
    clientSecretKey.current = null;
    clientPubkey.current = null;
    sessionSecret.current = null;
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
