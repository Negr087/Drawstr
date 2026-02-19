"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  SimplePool,
  nip19,
  finalizeEvent,
  type Event,
  type UnsignedEvent
} from "nostr-tools";
import type {
  NostrUser,
  CanvasElement,
  CursorPosition,
} from "./types";
import {
  NOSTR_KIND_CANVAS_ACTION,
  NOSTR_KIND_CURSOR_POSITION,
  NOSTR_KIND_CANVAS_STATE,
} from "./types";
import { useCanvasStore } from "./canvas-store";
import { createNostrConnectClient, generateBunkerUri, listenForConnection, hexToBytes as hexToBytesConnect } from "./nostr-connect";

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
  logout: () => void;
  publishCanvasAction: (
    action: "add" | "update" | "delete",
    element: CanvasElement,
    canvasId: string
  ) => Promise<void>;
  publishCursorPosition: (
    x: number,
    y: number,
    canvasId: string
  ) => Promise<void>;
  subscribeToCanvas: (canvasId: string) => () => void;
  publishNote: (content: string, imageUrl?: string) => Promise<boolean>;
  saveCanvasState: (canvasId: string, canvasName: string) => Promise<boolean>;
  loadCanvasState: (canvasId: string, authorPubkey?: string) => Promise<any>;
  listUserCanvases: () => Promise<any[]>;
  loginWithNostrConnect: () => Promise<void>;
  nostrConnectUri: string | null;
}

const NostrContext = createContext<NostrContextType | null>(null);

export function NostrProvider({ children }: { children: ReactNode }) {
  const [pool, setPool] = useState<SimplePool | null>(null);
  const [relays] = useState<string[]>(DEFAULT_RELAYS);
  const [user, setUser] = useState<NostrUser | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privateKey, setPrivateKey] = useState<Uint8Array | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null);
  const [nostrConnectClient, setNostrConnectClient] = useState<any>(null);
  const [nostrConnectCleanup, setNostrConnectCleanup] = useState<(() => void) | null>(null);

  const { addElement, updateElement, deleteElement, updateCursor, setCurrentUser } =
    useCanvasStore();

  const fetchUserMetadata = useCallback(async (pubkey: string) => {
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
  }, [pool, relays]);

  useEffect(() => {
    const simplePool = new SimplePool();
    setPool(simplePool);
    const testConnections = async () => {
      try { setIsConnected(true); }
      catch (err) { console.warn("Some relays failed:", err); setIsConnected(true); }
    };
    testConnections();
    return () => { simplePool.close(relays); };
  }, [relays]);

  useEffect(() => {
    const savedUser = localStorage.getItem('nostr_user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setCurrentUser(userData);
      } catch (err) {
        console.error('Failed to restore session:', err);
      }
    }
  }, []);

  // Sign event — returns null for readOnly users
  const signEvent = useCallback(
    async (unsignedEvent: UnsignedEvent): Promise<Event | null> => {
      try {
        if (user?.readOnly) return null;
        if (window.nostr && !privateKey) {
          return await window.nostr.signEvent(unsignedEvent);
        } else if (privateKey) {
          return finalizeEvent(unsignedEvent, privateKey) as Event;
        }
        return null;
      } catch {
        return null;
      }
    },
    [privateKey, user]
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
        events.sort((a, b) => b.created_at - a.created_at);
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

  // Login with NIP-07 browser extension
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
        pubkey, npub,
        name: metadata?.name,
        picture: metadata?.picture,
        readOnly: false,
      };
      setUser(nostrUser);
      setCurrentUser(nostrUser);
      setPrivateKey(null);
      localStorage.setItem('nostr_user', JSON.stringify(nostrUser));
      setTimeout(async () => {
        const lastCanvas = localStorage.getItem(`lastCanvas:${nostrUser.pubkey}`);
        if (lastCanvas) {
          const data = await loadCanvasState(lastCanvas, nostrUser.pubkey);
          if (data?.elements) {
            useCanvasStore.getState().loadElements(data.elements);
            console.log("Auto-loaded last canvas after login");
          }
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setIsLoading(false);
    }
  }, [setCurrentUser, fetchUserMetadata, loadCanvasState]);

  // Login with npub — read-only mode, can draw locally but cannot sign
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
          throw new Error("Invalid public key format. Use npub1... or a 64-char hex.");
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
        setPrivateKey(null);
        localStorage.setItem('nostr_user', JSON.stringify(nostrUser));
        setTimeout(async () => {
          const lastCanvas = localStorage.getItem(`lastCanvas:${nostrUser.pubkey}`);
          if (lastCanvas) {
            const data = await loadCanvasState(lastCanvas, nostrUser.pubkey);
            if (data?.elements) {
              useCanvasStore.getState().loadElements(data.elements);
              console.log("Auto-loaded last canvas after npub login");
            }
          }
        }, 500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid public key");
      } finally {
        setIsLoading(false);
      }
    },
    [setCurrentUser, fetchUserMetadata, loadCanvasState]
  );

  // Login with Nostr Connect (NIP-46)
  const loginWithNostrConnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (nostrConnectCleanup) nostrConnectCleanup();

      const client = createNostrConnectClient({
        relay: "wss://relay.damus.io",
        onConnect: async (remotePubkey) => {
          console.log("Connected with pubkey:", remotePubkey);
          const metadata = await fetchUserMetadata(remotePubkey);
          const npub = nip19.npubEncode(remotePubkey);
          const nostrUser: NostrUser = {
            pubkey: remotePubkey, npub,
            name: metadata?.name,
            picture: metadata?.picture,
            readOnly: false,
          };
          setUser(nostrUser);
          localStorage.setItem('nostr_user', JSON.stringify(nostrUser));
          setCurrentUser(nostrUser);
          setIsLoading(false);
          setNostrConnectUri(null);
          if (nostrConnectCleanup) {
            nostrConnectCleanup();
            setNostrConnectCleanup(null);
          }
        },
        onError: (errorMsg) => {
          setError(errorMsg);
          setIsLoading(false);
        },
      });

      const uri = generateBunkerUri(client);
      setNostrConnectUri(uri);
      setNostrConnectClient(client);

      const secretKey = hexToBytesConnect(client.secret);

      const subs = relays.map(relay =>
        client.pool.subscribeMany(
          [relay],
          [{ kinds: [24133], "#p": [client.pubkey], since: Math.floor(Date.now() / 1000) - 60 }] as any,
          {
            async onevent(event: any) {
              console.log(`Event from ${relay}:`, event);
              try {
                const remotePubkey = event.pubkey;
                const metadata = await fetchUserMetadata(remotePubkey);
                const npub = nip19.npubEncode(remotePubkey);
                const nostrUser: NostrUser = {
                  pubkey: remotePubkey, npub,
                  name: metadata?.name,
                  picture: metadata?.picture,
                  readOnly: false,
                };
                setUser(nostrUser);
                localStorage.setItem('nostr_user', JSON.stringify(nostrUser));
                setCurrentUser(nostrUser);
                setIsLoading(false);
                setNostrConnectUri(null);
              } catch (err) {
                console.error("Failed to connect:", err);
              }
            }
          }
        )
      );

      const cleanup = await listenForConnection(client, secretKey, relays);
      setNostrConnectCleanup(() => cleanup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start connection");
      setIsLoading(false);
    }
  }, [relays, fetchUserMetadata, setCurrentUser, nostrConnectCleanup]);

  // Publish canvas action — skips for readOnly users
  const publishCanvasAction = useCallback(
  async (action: "add" | "update" | "delete", element: CanvasElement, canvasId: string) => {
    // Bloquear solo si NO hay user, o si es readOnly (npub login)
    if (!pool || !user || user.readOnly) {
      console.log("publishCanvasAction blocked - readOnly or no user");
      return;
    }
    
    try {
      const unsignedEvent: UnsignedEvent = {
        kind: NOSTR_KIND_CANVAS_ACTION,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["d", canvasId], ["canvas", canvasId], ["author", user.pubkey]],
        content: JSON.stringify({ action, element, timestamp: Date.now() }),
        pubkey: user.pubkey,
      };
      console.log("📤 Publishing CANVAS ACTION - kind:", NOSTR_KIND_CANVAS_ACTION, "action:", action, "element id:", element.id);
      const signedEvent = await signEvent(unsignedEvent);
      if (signedEvent) {
        await Promise.allSettled(pool.publish(relays, signedEvent));
        console.log("Published canvas action:", action);
      } else {
        console.warn("Failed to sign event - no signing method available");
      }
    } catch (err) {
      console.warn("Failed to publish canvas action:", err);
    }
  },
  [pool, user, relays, signEvent]
);

  // Publish cursor position — skips for readOnly users
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
      } catch (err) { /* silent */ }
    },
    [pool, user, relays, signEvent]
  );

  const subscribeToCanvas = useCallback(
    (canvasId: string) => {
      if (!pool || !user) return () => { };

      const actionSub = pool.subscribeMany(
        relays,
        [{ kinds: [NOSTR_KIND_CANVAS_ACTION], "#canvas": [canvasId] }] as any,
        {
          onevent(event) {
            console.log("📨 Received canvas event from:", event.pubkey.slice(0, 8), "action:", JSON.parse(event.content).action);
            try {
              const data = JSON.parse(event.content);
              const element = data.element as CanvasElement;
              if (event.pubkey === user.pubkey) return;
              console.log("✅ Processing event:", data.action, "element:", element.id);
              switch (data.action) {
                case "add": addElement(element); break;
                case "update": updateElement(element.id, element); break;
                case "delete": deleteElement(element.id); break;
              }
            } catch { }
          },
          oneose() { }
        }
      );

      const cursorSub = pool.subscribeMany(
        relays,
        [{ kinds: [NOSTR_KIND_CURSOR_POSITION], "#canvas": [canvasId], since: Math.floor(Date.now() / 1000) - 60 }] as any,
        {
          onevent(event) {
            try {
              if (event.pubkey === user.pubkey) return;
              const data = JSON.parse(event.content);
              const colorIndex = parseInt(event.pubkey.slice(-2), 16) % CURSOR_COLORS.length;
              updateCursor({ pubkey: event.pubkey, x: data.x, y: data.y, color: CURSOR_COLORS[colorIndex], timestamp: data.timestamp });
            } catch { }
          },
          oneose() { }
        }
      );

      return () => { actionSub.close(); cursorSub.close(); };
    },
    [pool, relays, user, addElement, updateElement, deleteElement, updateCursor]
  );

  // Publish note — blocked for readOnly users
  const publishNote = useCallback(
    async (content: string, imageUrl?: string): Promise<boolean> => {
      if (!pool || !user || user.readOnly) return false;
      try {
        const tags: string[][] = [["client", "NostrDraw"], ["t", "nostrdraw"], ["t", "art"]];
        if (imageUrl) {
          tags.push(["image", imageUrl]);
          tags.push(["imeta", `url ${imageUrl}`, "m image/png", "blurhash LEHV6nWB2yk8pyo0adR*.7kCMdnj", "dim 1024x768"]);
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
          return results.filter(r => r.status === 'fulfilled').length > 0;
        }
        return false;
      } catch (err) {
        console.error("Failed to publish note:", err);
        return false;
      }
    },
    [pool, user, relays, signEvent]
  );

  // Save canvas state — blocked for readOnly users
  const saveCanvasState = useCallback(
  async (canvasId: string, canvasName: string): Promise<boolean> => {
    if (!pool || !user || user.readOnly) return false;
    try {
      const elementsArray = Array.from(useCanvasStore.getState().elements.values())
        .filter(el => !el.isDeleted)
        .map(el => {
          // Si es imagen y tiene dataUrl, NO guardarlo (muy grande)
          if (el.type === 'image' && 'dataUrl' in el) {
            const { dataUrl, ...rest } = el;
            return rest;
          }
          return el;
        });
        const canvasData = { version: "1.0", canvasId, canvasName, elements: elementsArray, timestamp: Date.now() };
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
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          console.log(`Published canvas action to ${successCount}/${relays.length} relays`);
          console.log(`Canvas saved to ${successCount} relays`);
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
      console.log("Auto-saving before logout...");
      await saveCanvasState(currentCanvasId, currentCanvasName);
    }
    setUser(null);
    setCurrentUser(null);
    setPrivateKey(null);
    localStorage.removeItem('nostr_user');
    if (nostrConnectCleanup) { nostrConnectCleanup(); setNostrConnectCleanup(null); }
    setNostrConnectUri(null);
    setNostrConnectClient(null);
  }, [setCurrentUser, nostrConnectCleanup, user, saveCanvasState]);

  const listUserCanvases = useCallback(
    async () => {
      if (!pool || !user) return [];
      try {
        const events = await pool.querySync(relays, { kinds: [NOSTR_KIND_CANVAS_STATE], authors: [user.pubkey] });
        return events.map(event => {
          const data = JSON.parse(event.content);
          return { canvasId: data.canvasId, canvasName: data.canvasName, timestamp: data.timestamp, elementCount: data.elements.length, event };
        }).sort((a, b) => b.timestamp - a.timestamp);
      } catch (err) {
        console.error("Failed to list canvases:", err);
        return [];
      }
    },
    [pool, user, relays]
  );

  return (
    <NostrContext.Provider
      value={{
        pool, relays, user, isConnected, isLoading, error,
        loginWithExtension, loginWithNpub, logout,
        publishCanvasAction, publishCursorPosition, subscribeToCanvas,
        publishNote, saveCanvasState, loadCanvasState, listUserCanvases,
        loginWithNostrConnect, nostrConnectUri,
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
      getRelays?: () => Promise<Record<string, { read: boolean; write: boolean }>>;
      nip04?: {
        encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
      };
    };
  }
}