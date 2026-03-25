// lib/nostr-context.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  SimplePool,
  nip19,
  nip44,
  nip04,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  type UnsignedEvent,
  type Event,
} from "nostr-tools";
import type { NostrUser, CanvasElement } from "./types";
import {
  NOSTR_KIND_CANVAS_ACTION,
  NOSTR_KIND_CURSOR_POSITION,
  NOSTR_KIND_CANVAS_STATE,
} from "./types";
import { useCanvasStore } from "./canvas-store";

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.nsec.app",
  "wss://relay.primal.net",
];

const CURSOR_COLORS = [
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#10b981",
  "#f97316",
];

interface NostrContextType {
  pool: SimplePool | null;
  relays: string[];
  user: NostrUser | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  loginWithExtension: () => Promise<void>;
  loginWithNpub: (npub: string) => Promise<void>;
  loginWithRemoteSigner: (remotePubkey: string, nip46Options?: { signerPubkey: string; clientSecretHex: string; relays: string[] }) => Promise<void>;
  logout: () => void;
  publishCanvasAction: (
    action: "add" | "update" | "delete",
    element: CanvasElement,
    canvasId: string
  ) => Promise<void>;
  publishCursorPosition: (x: number, y: number, canvasId: string) => Promise<void>;
  subscribeToCanvas: (canvasId: string) => () => void;
  publishNote: (content: string, imageUrl?: string) => Promise<boolean>;
  saveCanvasState: (canvasId: string, canvasName: string) => Promise<boolean>;
  loadCanvasState: (canvasId: string, authorPubkey?: string) => Promise<any>;
  listUserCanvases: () => Promise<any[]>;
}

const NostrContext = createContext<NostrContextType | null>(null);

export function NostrProvider({ children }: { children: ReactNode }) {
  const [pool, setPool] = useState<SimplePool | null>(null);
  const [relays] = useState<string[]>(DEFAULT_RELAYS);
  const [user, setUser] = useState<NostrUser | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privateKeyHex, setPrivateKeyHex] = useState<string | null>(null);
  // Track whether the current session should use window.nostr for signing
  const useExtensionRef = useRef(false);
  // NIP-46 remote signing session
  const nip46SignerPubkeyRef = useRef<string | null>(null);
  const nip46ClientSecretRef = useRef<Uint8Array | null>(null);
  const nip46RelaysRef = useRef<string[]>([]);

  const { addElement, updateElement, deleteElement, updateCursor, setCurrentUser } =
    useCanvasStore();

  const fetchUserMetadata = useCallback(
    async (pubkey: string) => {
      if (!pool) return null;
      try {
        const events = await pool.querySync(relays, {
          kinds: [0],
          authors: [pubkey],
          limit: 1,
        });
        if (events.length > 0) {
          const metadata = JSON.parse(events[0].content);
          return {
            name: metadata.name || metadata.display_name,
            picture: metadata.picture,
            about: metadata.about,
          };
        }
      } catch (err) {
        console.error("Failed to fetch metadata:", err);
      }
      return null;
    },
    [pool, relays]
  );

  useEffect(() => {
    const simplePool = new SimplePool();
    setPool(simplePool);
    setIsConnected(true);
    return () => {
      simplePool.close(relays);
    };
  }, [relays]);

  useEffect(() => {
    const savedUser = localStorage.getItem("nostr_user");
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        // Restore NIP-46 session if present
        const savedNip46 = localStorage.getItem("nip46_session");
        if (savedNip46) {
          try {
            const nip46 = JSON.parse(savedNip46);
            nip46SignerPubkeyRef.current = nip46.signerPubkey;
            nip46ClientSecretRef.current = hexToBytes(nip46.clientSecretHex);
            nip46RelaysRef.current = nip46.relays;
          } catch {}
        }
        // If not read-only and extension is available, re-verify pubkey in case profile changed
        if (!userData.readOnly && typeof window !== "undefined" && window.nostr) {
          useExtensionRef.current = true;
          window.nostr.getPublicKey().then((currentPubkey) => {
            if (currentPubkey !== userData.pubkey) {
              const updatedUser = {
                ...userData,
                pubkey: currentPubkey,
                npub: nip19.npubEncode(currentPubkey),
              };
              setUser(updatedUser);
              setCurrentUser(updatedUser);
              localStorage.setItem("nostr_user", JSON.stringify(updatedUser));
            } else {
              setUser(userData);
              setCurrentUser(userData);
            }
          }).catch(() => {
            setUser(userData);
            setCurrentUser(userData);
          });
        } else {
          setUser(userData);
          setCurrentUser(userData);
        }
      } catch (err) {
        console.error("Failed to restore session:", err);
      }
    }
  }, [setCurrentUser]);

  const signViaNip46 = useCallback(
    async (unsignedEvent: UnsignedEvent): Promise<Event | null> => {
      const signerPubkey = nip46SignerPubkeyRef.current;
      const clientSecretBytes = nip46ClientSecretRef.current;
      const relaysToUse = nip46RelaysRef.current;
      if (!signerPubkey || !clientSecretBytes || !pool) return null;

      const clientPubkey = getPublicKey(clientSecretBytes);
      const reqId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, "0")).join("");

      // Send sign_event request to bunker
      const { pubkey: _pubkey, ...eventTemplate } = unsignedEvent as any;
      const request = JSON.stringify({ id: reqId, method: "sign_event", params: [eventTemplate] });
      let encrypted: string;
      try {
        encrypted = nip44.encrypt(request, nip44.getConversationKey(clientSecretBytes, signerPubkey));
      } catch {
        encrypted = await nip04.encrypt(
          Array.from(clientSecretBytes).map(b => b.toString(16).padStart(2, "0")).join(""),
          signerPubkey,
          request
        );
      }

      const reqEvent = finalizeEvent({
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", signerPubkey]],
        content: encrypted,
      }, clientSecretBytes);

      const sinceTs = Math.floor(Date.now() / 1000) - 5;

      // Subscribe BEFORE publishing to avoid missing fast responses
      return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout>;

        const sub = pool.subscribeMany(
          relaysToUse,
          [{ kinds: [24133], "#p": [clientPubkey], since: sinceTs }] as any,
          {
            async onevent(event) {
              // Only accept responses from our signer
              if (event.pubkey !== signerPubkey) return;
              try {
                let decrypted: string;
                try {
                  decrypted = nip44.decrypt(event.content, nip44.getConversationKey(clientSecretBytes, signerPubkey));
                } catch {
                  decrypted = await nip04.decrypt(
                    Array.from(clientSecretBytes).map(b => b.toString(16).padStart(2, "0")).join(""),
                    signerPubkey,
                    event.content
                  );
                }
                const msg = JSON.parse(decrypted);
                if (msg.id === reqId && msg.result) {
                  clearTimeout(timer);
                  sub.close();
                  resolve(msg.result as Event);
                }
              } catch {}
            },
          }
        );

        timer = setTimeout(() => { sub.close(); resolve(null); }, 15000);

        // Publish after subscription is active
        Promise.allSettled(pool.publish(relaysToUse, reqEvent));
      });
    },
    [pool]
  );

  const signEvent = useCallback(
    async (unsignedEvent: UnsignedEvent): Promise<Event | null> => {
      try {
        if (user?.readOnly) return null;
        if (privateKeyHex) {
          return finalizeEvent(unsignedEvent, hexToBytes(privateKeyHex));
        }
        if (window.nostr) {
          useExtensionRef.current = true;
          const currentPubkey = await window.nostr.getPublicKey();
          const eventToSign = { ...unsignedEvent, pubkey: currentPubkey };
          return await window.nostr.signEvent(eventToSign);
        }
        if (nip46SignerPubkeyRef.current && nip46ClientSecretRef.current) {
          return await signViaNip46(unsignedEvent);
        }
        return null;
      } catch (err) {
        console.error("Failed to sign event:", err);
        return null;
      }
    },
    [privateKeyHex, user, signViaNip46]
  );

  const loadCanvasState = useCallback(
    async (canvasId: string, authorPubkey?: string) => {
      if (!pool) return null;
      try {
        const filter: any = {
          kinds: [NOSTR_KIND_CANVAS_STATE],
          "#d": [canvasId],
          limit: 10,
        };
        const resolvedPubkey = authorPubkey ?? user?.pubkey;
        if (resolvedPubkey) filter.authors = [resolvedPubkey];

        const events = await pool.querySync(relays, filter);
        events.sort((a: any, b: any) => b.created_at - a.created_at);

        if (events.length > 0) {
          const canvasData = JSON.parse(events[0].content);
          console.log(`Canvas loaded: ${canvasData.canvasName} with ${canvasData.elements.length} elements`);
          return canvasData;
        }
        return null;
      } catch (err) {
        console.error("Failed to load canvas state:", err);
        return null;
      }
    },
    [pool, user, relays]
  );

  const loginWithExtension = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (typeof window === "undefined" || !window.nostr) {
        throw new Error("No Nostr extension found. Please install Alby or nos2x.");
      }
      const pubkey = await window.nostr.getPublicKey();
      const npub = nip19.npubEncode(pubkey);
      const metadata = await fetchUserMetadata(pubkey);

      const nostrUser: NostrUser = {
        pubkey,
        npub,
        name: metadata?.name,
        picture: metadata?.picture,
        readOnly: false,
      };
      setUser(nostrUser);
      setCurrentUser(nostrUser);
      setPrivateKeyHex(null);
      useExtensionRef.current = true;
      localStorage.setItem("nostr_user", JSON.stringify(nostrUser));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setIsLoading(false);
    }
  }, [setCurrentUser, fetchUserMetadata]);

  const loginWithNpub = useCallback(
    async (npub: string) => {
      setIsLoading(true);
      setError(null);
      try {
        let pubkey: string;
        if (npub.startsWith("npub")) {
          const decoded = nip19.decode(npub);
          if (decoded.type !== "npub") throw new Error("Invalid npub key");
          pubkey = decoded.data as string;
        } else if (/^[0-9a-fA-F]{64}$/.test(npub)) {
          pubkey = npub;
        } else {
          throw new Error("Invalid public key format");
        }

        const npubEncoded = nip19.npubEncode(pubkey);
        const metadata = await fetchUserMetadata(pubkey);

        const nostrUser: NostrUser = {
          pubkey,
          npub: npubEncoded,
          name: metadata?.name,
          picture: metadata?.picture,
          readOnly: true,
        };
        setUser(nostrUser);
        setCurrentUser(nostrUser);
        setPrivateKeyHex(null);
        useExtensionRef.current = false;
        localStorage.setItem("nostr_user", JSON.stringify(nostrUser));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid public key");
      } finally {
        setIsLoading(false);
      }
    },
    [setCurrentUser, fetchUserMetadata]
  );

  const loginWithRemoteSigner = useCallback(
    async (remotePubkey: string, nip46Options?: { signerPubkey: string; clientSecretHex: string; relays: string[] }) => {
      try {
        const npub = nip19.npubEncode(remotePubkey);

        // Use a fresh pool with expanded relays to avoid timing issues with the main pool
        const metaRelays = [
          "wss://relay.primal.net",
          "wss://relay.damus.io",
          "wss://nos.lol",
          "wss://purplepag.es",
          "wss://relay.nostr.band",
        ];
        const metaPool = new SimplePool();
        let metadata: { name?: string; picture?: string } | null = null;
        try {
          const events = await metaPool.querySync(metaRelays, {
            kinds: [0],
            authors: [remotePubkey],
            limit: 1,
          });
          if (events.length > 0) {
            const md = JSON.parse(events[0].content);
            metadata = {
              name: md.name || md.display_name,
              picture: md.picture,
            };
          }
        } finally {
          try { metaPool.close(metaRelays); } catch {}
        }

        console.log("NIP-46 metadata:", metadata);

        const nostrUser: NostrUser = {
          pubkey: remotePubkey,
          npub,
          name: metadata?.name,
          picture: metadata?.picture,
          readOnly: false,
        };
        setUser(nostrUser);
        setCurrentUser(nostrUser);
        useExtensionRef.current = false;
        localStorage.setItem("nostr_user", JSON.stringify(nostrUser));
        if (nip46Options) {
          nip46SignerPubkeyRef.current = nip46Options.signerPubkey;
          nip46ClientSecretRef.current = hexToBytes(nip46Options.clientSecretHex);
          nip46RelaysRef.current = nip46Options.relays;
          localStorage.setItem("nip46_session", JSON.stringify(nip46Options));
        }
        console.log("✅ Logged in via NIP-46");
      } catch (error) {
        console.error("Failed to login with remote signer:", error);
        setError("Failed to login with remote signer");
        throw error;
      }
    },
    [setCurrentUser]
  );

  const publishCanvasAction = useCallback(
    async (action: "add" | "update" | "delete", element: CanvasElement, canvasId: string) => {
      if (!pool || !user || user.readOnly) return;
      try {
        const unsignedEvent: UnsignedEvent = {
          kind: NOSTR_KIND_CANVAS_ACTION,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["d", canvasId], ["canvas", canvasId], ["author", user.pubkey]],
          content: JSON.stringify({ action, element, timestamp: Date.now() }),
          pubkey: user.pubkey,
        };
        const signedEvent = await signEvent(unsignedEvent);
        if (signedEvent) await Promise.allSettled(pool.publish(relays, signedEvent));
      } catch (err) {
        console.warn("Failed to publish canvas action:", err);
      }
    },
    [pool, user, relays, signEvent]
  );

  const publishCursorPosition = useCallback(
    async (x: number, y: number, canvasId: string) => {
      if (!pool || !user || user.readOnly) return;
      try {
        const unsignedEvent: UnsignedEvent = {
          kind: NOSTR_KIND_CURSOR_POSITION,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["canvas", canvasId], ["author", user.pubkey]],
          content: JSON.stringify({ x, y, canvasId, timestamp: Date.now() }),
          pubkey: user.pubkey,
        };
        const signedEvent = await signEvent(unsignedEvent);
        if (signedEvent) await Promise.allSettled(pool.publish(relays, signedEvent));
      } catch (err) {
        // Silent
      }
    },
    [pool, user, relays, signEvent]
  );

  const subscribeToCanvas = useCallback(
    (canvasId: string) => {
      if (!pool) return () => {};

      // v2: subscribeMany en vez de sub()
      const actionSub = pool.subscribeMany(
        relays,
        [{ kinds: [NOSTR_KIND_CANVAS_ACTION], "#canvas": [canvasId] }] as any,
        {
          onevent(event) {
            try {
              const data = JSON.parse(event.content);
              const element = data.element as CanvasElement;
              if (user && event.pubkey === user.pubkey) return;
              switch (data.action) {
                case "add": addElement(element); break;
                case "update": updateElement(element.id, element); break;
                case "delete": deleteElement(element.id); break;
              }
            } catch (err) {
              console.error("Failed to process canvas event:", err);
            }
          },
        }
      );

      const cursorSub = pool.subscribeMany(
        relays,
        [{
          kinds: [NOSTR_KIND_CURSOR_POSITION],
          "#canvas": [canvasId],
          since: Math.floor(Date.now() / 1000) - 60,
        }] as any,
        {
          onevent(event) {
            try {
              if (user && event.pubkey === user.pubkey) return;
              const data = JSON.parse(event.content);
              const colorIndex = parseInt(event.pubkey.slice(-2), 16) % CURSOR_COLORS.length;
              updateCursor({
                pubkey: event.pubkey,
                x: data.x,
                y: data.y,
                color: CURSOR_COLORS[colorIndex],
                timestamp: data.timestamp,
              });
            } catch (err) {
              console.error("Failed to process cursor event:", err);
            }
          },
        }
      );

      return () => {
        actionSub.close();
        cursorSub.close();
      };
    },
    [pool, relays, user, addElement, updateElement, deleteElement, updateCursor]
  );

  const publishNote = useCallback(
    async (content: string, imageUrl?: string): Promise<boolean> => {
      if (!pool || !user || user.readOnly) return false;
      try {
        const tags: string[][] = [
          ["client", "NostrDraw"],
          ["t", "nostrdraw"],
          ["t", "art"],
        ];
        if (imageUrl) {
          tags.push(["image", imageUrl]);
          tags.push(["imeta", `url ${imageUrl}`, "m image/png"]);
          if (!content.includes(imageUrl)) content = `${content}\n\n${imageUrl}`;
        }
        const unsignedEvent: UnsignedEvent = {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content,
          pubkey: user.pubkey,
        };
        const signedEvent = await signEvent(unsignedEvent);
        if (signedEvent) {
          const results = await Promise.allSettled(pool.publish(relays, signedEvent));
          return results.filter(r => r.status === "fulfilled").length > 0;
        }
        return false;
      } catch (err) {
        console.error("Failed to publish note:", err);
        return false;
      }
    },
    [pool, user, relays, signEvent]
  );

  const saveCanvasState = useCallback(
    async (canvasId: string, canvasName: string): Promise<boolean> => {
      if (!pool || !user || user.readOnly) return false;
      try {
        const elementsArray = Array.from(useCanvasStore.getState().elements.values()).filter(
          el => !el.isDeleted
        );
        const canvasData = {
          version: "1.0",
          canvasId,
          canvasName,
          elements: elementsArray,
          timestamp: Date.now(),
        };
        const unsignedEvent: UnsignedEvent = {
          kind: NOSTR_KIND_CANVAS_STATE,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["d", canvasId], ["title", canvasName], ["client", "NostrDraw"]],
          content: JSON.stringify(canvasData),
          pubkey: user.pubkey,
        };
        const signedEvent = await signEvent(unsignedEvent);
        if (signedEvent) {
          const results = await Promise.allSettled(pool.publish(relays, signedEvent));
          const successCount = results.filter(r => r.status === "fulfilled").length;
          console.log(`Canvas saved to ${successCount}/${relays.length} relays`);
          if (successCount > 0) localStorage.setItem(`lastCanvas:${user.pubkey}`, canvasId);
          return successCount > 0;
        }
        return false;
      } catch (err) {
        console.error("Failed to save canvas state:", err);
        return false;
      }
    },
    [pool, user, relays, signEvent]
  );

  const logout = useCallback(async () => {
    const currentCanvasId = useCanvasStore.getState().canvasId;
    const currentCanvasName = useCanvasStore.getState().canvasName;
    if (user && !user.readOnly && currentCanvasId) {
      await saveCanvasState(currentCanvasId, currentCanvasName);
    }
    setUser(null);
    setCurrentUser(null);
    setPrivateKeyHex(null);
    useExtensionRef.current = false;
    nip46SignerPubkeyRef.current = null;
    nip46ClientSecretRef.current = null;
    nip46RelaysRef.current = [];
    localStorage.removeItem("nostr_user");
    localStorage.removeItem("nip46_session");
  }, [setCurrentUser, user, saveCanvasState]);

  const listUserCanvases = useCallback(async () => {
    if (!pool || !user) return [];
    try {
      const events = await pool.querySync(relays, {
        kinds: [NOSTR_KIND_CANVAS_STATE],
        authors: [user.pubkey],
      });
      return events
        .map((event: any) => {
          const data = JSON.parse(event.content);
          return {
            canvasId: data.canvasId,
            canvasName: data.canvasName,
            timestamp: data.timestamp,
            elementCount: data.elements.length,
            event,
          };
        })
        .sort((a: any, b: any) => b.timestamp - a.timestamp);
    } catch (err) {
      console.error("Failed to list canvases:", err);
      return [];
    }
  }, [pool, user, relays]);

  return (
    <NostrContext.Provider
      value={{
        pool,
        relays,
        user,
        isConnected,
        isLoading,
        error,
        loginWithExtension,
        loginWithNpub,
        loginWithRemoteSigner,
        logout,
        publishCanvasAction,
        publishCursorPosition,
        subscribeToCanvas,
        publishNote,
        saveCanvasState,
        loadCanvasState,
        listUserCanvases,
      }}
    >
      {children}
    </NostrContext.Provider>
  );
}

export function useNostr() {
  const context = useContext(NostrContext);
  if (!context) throw new Error("useNostr must be used within a NostrProvider");
  return context;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: UnsignedEvent) => Promise<Event>;
    };
  }
}