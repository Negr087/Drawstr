// lib/use-nostr-connect.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { generateSecretKey, getPublicKey, finalizeEvent, nip44, nip04, SimplePool } from "nostr-tools";

interface NostrConnectState {
  uri: string | null;
  connected: boolean;
  remotePubkey: string | null;
  isWaiting: boolean;
  signerPubkey: string | null;
  clientSecretHex: string | null;
  nip46Relays: string[];
}

const NIP46_RELAYS = [
  "wss://relay.nsec.app",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

const POLL_INTERVAL_MS = 2000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isTaggedToUs(event: any, pubkey: string): boolean {
  return event.tags?.some((t: string[]) => t[0] === "p" && t[1] === pubkey) ?? false;
}

async function decryptContent(
  content: string,
  secretBytes: Uint8Array,
  signerPubkey: string
): Promise<{ text: string; usedNip44: boolean } | null> {
  try {
    const text = nip44.decrypt(content, nip44.getConversationKey(secretBytes, signerPubkey));
    return { text, usedNip44: true };
  } catch {}
  try {
    const text = nip04.decrypt(toHex(secretBytes), signerPubkey, content);
    return { text, usedNip44: false };
  } catch {}
  return null;
}

async function encryptContent(
  content: string,
  secretBytes: Uint8Array,
  signerPubkey: string,
  useNip44: boolean
): Promise<string> {
  if (useNip44) {
    return nip44.encrypt(content, nip44.getConversationKey(secretBytes, signerPubkey));
  }
  return nip04.encrypt(toHex(secretBytes), signerPubkey, content);
}

export function useNostrConnect(relays: string[]) {
  const [state, setState] = useState<NostrConnectState>({
    uri: null,
    connected: false,
    remotePubkey: null,
    isWaiting: false,
    signerPubkey: null,
    clientSecretHex: null,
    nip46Relays: [],
  });

  const clientSecretKey = useRef<Uint8Array | null>(null);
  const sessionSecret = useRef<string | null>(null);
  const listenRelays = useRef<string[]>([]);
  const clientPubkey = useRef<string | null>(null);
  const connectedRef = useRef(false);
  const listenStartedAt = useRef<number>(0);
  const pool = useRef<SimplePool>(new SimplePool());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Primal sends {result: secret} using a bunker key — we must request the real user pubkey
  const signerPubkeyRef = useRef<string | null>(null);
  const pendingGetPubkeyIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const processEvent = useCallback(async (
    event: any,
    pubkey: string,
    secretBytes: Uint8Array,
    secret: string,
    relaysToUse: string[]
  ): Promise<boolean> => {
    if (!isTaggedToUs(event, pubkey)) return false;

    const signerPubkey: string = event.pubkey;
    const dec = await decryptContent(event.content, secretBytes, signerPubkey);

    if (!dec) {
      console.warn("[NIP-46] Could not decrypt event from:", signerPubkey);
      return false;
    }

    console.log("[NIP-46] Decrypted (NIP-" + (dec.usedNip44 ? "44" : "04") + "):", dec.text);

    let message: any;
    try {
      message = JSON.parse(dec.text);
    } catch {
      console.error("[NIP-46] JSON parse failed:", dec.text);
      return false;
    }

    let userPubkey: string;

    if (message.method === "connect") {
      // Standard NIP-46: signer sends {method:"connect", params:[pubkey, secret]}
      userPubkey = message.params?.[0] ?? signerPubkey;
      const receivedSecret: string | undefined = message.params?.[1];

      if (receivedSecret && receivedSecret !== secret) {
        console.warn("[NIP-46] Secret mismatch. Got:", receivedSecret, "Expected:", secret);
        return false;
      }

      signerPubkeyRef.current = signerPubkey; // track signer for future requests

      // Send ACK
      const response = JSON.stringify({ id: message.id, result: secret, error: null });
      const encrypted = await encryptContent(response, secretBytes, signerPubkey, dec.usedNip44);
      const ackEvent = finalizeEvent(
        {
          kind: 24133,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", signerPubkey]],
          content: encrypted,
        },
        secretBytes
      );
      await Promise.allSettled(pool.current.publish(relaysToUse, ackEvent));
      console.log("[NIP-46] ACK sent");

    } else if (
      pendingGetPubkeyIdRef.current &&
      message.id === pendingGetPubkeyIdRef.current &&
      typeof message.result === "string" &&
      /^[0-9a-f]{64}$/i.test(message.result)
    ) {
      // Response to our get_public_key request — this is the real user pubkey
      userPubkey = message.result;
      pendingGetPubkeyIdRef.current = null;
      console.log("[NIP-46] Got real user pubkey:", userPubkey);

    } else if (typeof message.result === "string" && message.result === secret && !pendingGetPubkeyIdRef.current) {
      // Primal format: signer sends {id:"...", result:secret} using a bunker key
      // event.pubkey is the bunker key, NOT the user's actual Nostr pubkey
      // Request the real pubkey via get_public_key
      signerPubkeyRef.current = signerPubkey;
      const reqId = toHex(crypto.getRandomValues(new Uint8Array(8)));
      pendingGetPubkeyIdRef.current = reqId;
      const request = JSON.stringify({ id: reqId, method: "get_public_key", params: [] });
      const encrypted = await encryptContent(request, secretBytes, signerPubkey, dec.usedNip44);
      const reqEvent = finalizeEvent(
        {
          kind: 24133,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["p", signerPubkey]],
          content: encrypted,
        },
        secretBytes
      );
      await Promise.allSettled(pool.current.publish(relaysToUse, reqEvent));
      console.log("[NIP-46] Primal connect accepted, sent get_public_key request");
      return false; // Keep polling for the get_public_key response

    } else {
      console.log("[NIP-46] Unknown message format:", JSON.stringify(message));
      return false;
    }

    console.log("[NIP-46] Connected! User pubkey:", userPubkey);
    connectedRef.current = true;
    stopPolling();
    setState(prev => ({
      ...prev,
      connected: true,
      remotePubkey: userPubkey,
      isWaiting: false,
      signerPubkey: signerPubkeyRef.current,
      clientSecretHex: toHex(secretBytes),
    }));
    return true;
  }, [stopPolling]);

  const pollOnce = useCallback(async () => {
    if (connectedRef.current) { stopPolling(); return; }
    const secretBytes = clientSecretKey.current;
    const pubkey = clientPubkey.current;
    const secret = sessionSecret.current;
    const relaysToUse = listenRelays.current;
    if (!secretBytes || !pubkey || !secret) return;

    const since = listenStartedAt.current - 30;
    try {
      const events = await pool.current.querySync(
        relaysToUse,
        { kinds: [24133], "#p": [pubkey], since } as any
      );
      if (events.length > 0) console.log("[NIP-46] Poll found", events.length, "event(s)");
      for (const event of events) {
        if (connectedRef.current) return;
        const ok = await processEvent(event, pubkey, secretBytes, secret, relaysToUse);
        if (ok) return;
      }
    } catch (err) {
      console.warn("[NIP-46] Poll error:", err);
    }
  }, [processEvent, stopPolling]);

  const startPolling = useCallback((
    pubkey: string,
    secretBytes: Uint8Array,
    secret: string,
    relaysToUse: string[]
  ) => {
    stopPolling();
    // Immediate first poll
    pool.current.querySync(
      relaysToUse,
      { kinds: [24133], "#p": [pubkey], since: listenStartedAt.current - 30 } as any
    ).then(async (events) => {
      for (const event of events) {
        if (connectedRef.current) return;
        const ok = await processEvent(event, pubkey, secretBytes, secret, relaysToUse);
        if (ok) return;
      }
    }).catch(() => {});

    pollIntervalRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
    console.log("[NIP-46] Polling every", POLL_INTERVAL_MS, "ms on relays:", relaysToUse);
  }, [processEvent, pollOnce, stopPolling]);

  const generateConnectionUri = useCallback(() => {
    const secretBytes = generateSecretKey();
    clientSecretKey.current = secretBytes;
    const pubkey = getPublicKey(secretBytes);
    clientPubkey.current = pubkey;
    connectedRef.current = false;

    const randBytes = new Uint8Array(16);
    crypto.getRandomValues(randBytes);
    const secret = toHex(randBytes);
    sessionSecret.current = secret;

    const allRelays = [...new Set([...NIP46_RELAYS, ...relays])];
    listenRelays.current = allRelays;

    const params = new URLSearchParams();
    allRelays.forEach(relay => params.append("relay", relay));
    params.append("secret", secret);
    params.append("name", "NostrDraw");
    params.append("url", typeof window !== "undefined" ? window.location.origin : "https://drawstr.vercel.app");

    const uri = `nostrconnect://${pubkey}?${params.toString()}`;
    console.log("[NIP-46] Generated URI:", uri);

    const now = Math.floor(Date.now() / 1000);
    listenStartedAt.current = now;

    setState(prev => ({ ...prev, uri, isWaiting: true, nip46Relays: allRelays }));
    startPolling(pubkey, secretBytes, secret, allRelays);
  }, [relays, startPolling]);

  // On returning from background (e.g. after opening Primal deep link), force an immediate poll
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === "visible") {
        if (!connectedRef.current && clientPubkey.current) {
          console.log("[NIP-46] Page visible again, polling immediately...");
          pollOnce();
        }
      }
    };
    document.addEventListener("visibilitychange", handle);
    window.addEventListener("focus", handle);
    return () => {
      document.removeEventListener("visibilitychange", handle);
      window.removeEventListener("focus", handle);
    };
  }, [pollOnce]);

  const reset = useCallback(() => {
    stopPolling();
    clientSecretKey.current = null;
    clientPubkey.current = null;
    sessionSecret.current = null;
    connectedRef.current = false;
    signerPubkeyRef.current = null;
    pendingGetPubkeyIdRef.current = null;
    setState({ uri: null, connected: false, remotePubkey: null, isWaiting: false, signerPubkey: null, clientSecretHex: null, nip46Relays: [] });
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return { ...state, generateConnectionUri, reset };
}
