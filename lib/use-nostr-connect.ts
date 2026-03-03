// lib/use-nostr-connect.ts
"use client";

import { useState, useEffect, useRef } from "react";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { SimplePool } from "nostr-tools";

interface NostrConnectState {
  uri: string | null;
  connected: boolean;
  remotePubkey: string | null;
  isWaiting: boolean;
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
    const clientPubkey = getPublicKey(secretBytes);

    const metadata = {
      name: "NostrDraw",
      url: typeof window !== "undefined" ? window.location.origin : "https://drawstr.vercel.app",
      description: "Collaborative drawing canvas",
    };

    const params = new URLSearchParams();
    relays.forEach(relay => params.append("relay", relay));
    params.append("metadata", JSON.stringify(metadata));

    const uri = `nostrconnect://${clientPubkey}?${params.toString()}`;
    console.log("Generated NIP-46 URI:", uri);

    setState(prev => ({ ...prev, uri, isWaiting: true }));
    startListening(clientPubkey);
  };

  const startListening = (clientPubkey: string) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
    }

    console.log("Listening for NIP-46 response on relays:", relays);

    subscriptionRef.current = pool.current.subscribeMany(
      relays,
      [
        {
          kinds: [24133],
          "#p": [clientPubkey],
          since: Math.floor(Date.now() / 1000),
        },
      ] as any,
      {
        onevent(event: any) {
          console.log("Received NIP-46 event:", event);
          try {
            const remotePubkey = event.pubkey;
            const npub = nip19.npubEncode(remotePubkey);
            console.log("Connected to remote signer:", npub);
            setState(prev => ({
              ...prev,
              connected: true,
              remotePubkey,
              isWaiting: false,
            }));
            subscriptionRef.current?.close();
          } catch (error) {
            console.error("Failed to process NIP-46 event:", error);
          }
        },
        oneose() {
          console.log("EOSE received");
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