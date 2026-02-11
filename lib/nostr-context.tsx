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
  getPublicKey,
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
  NOSTR_KIND_CANVAS_STATE, // NUEVO
} from "./types";
import { useCanvasStore } from "./canvas-store";
import { createNostrConnectClient, generateBunkerUri, listenForConnection, hexToBytes as hexToBytesConnect } from "./nostr-connect";

// Default relays - using more stable ones
const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.nsec.app",
  "wss://relay.primal.net",
];

// Cursor colors for collaborators
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
  loginWithNsec: (nsec: string) => Promise<void>;
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
  // NUEVAS FUNCIONES PARA PERSISTENCIA
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

  // Fetch user metadata (profile)
  const fetchUserMetadata = useCallback(async (pubkey: string) => {
    if (!pool) return null;

    try {
      const events = await pool.querySync(
        relays,
        {
          kinds: [0], // Kind 0 is metadata
          authors: [pubkey],
          limit: 1,
        }
      );

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

  // Initialize pool
  useEffect(() => {
    const simplePool = new SimplePool();
    setPool(simplePool);
    

    // Test relay connections
    const testConnections = async () => {
      try {
        setIsConnected(true);
      } catch (err) {
        console.warn("Some relays failed to connect:", err);
        setIsConnected(true); // Still consider connected if at least one relay works
      }
    };

    testConnections();

    return () => {
      simplePool.close(relays);
    };
  }, [relays]);

  useEffect(() => {
  // Intentar recuperar sesión guardada
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

  // Login with NIP-07 browser extension
  const loginWithExtension = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (typeof window === "undefined" || !window.nostr) {
        throw new Error(
          "No Nostr extension found. Please install a NIP-07 compatible extension like Alby or nos2x."
        );
      }

      const pubkey = await window.nostr.getPublicKey();
      const npub = nip19.npubEncode(pubkey);

      // Fetch user metadata
      const metadata = await fetchUserMetadata(pubkey);

      const nostrUser: NostrUser = {
        pubkey,
        npub,
        name: metadata?.name,
        picture: metadata?.picture,
      };

      setUser(nostrUser);
      setCurrentUser(nostrUser);
      setPrivateKey(null);
      setTimeout(async () => {
  const lastCanvas = localStorage.getItem(`lastCanvas:${nostrUser.pubkey}`);
  if (lastCanvas) {
    const data = await loadCanvasState(lastCanvas);
    if (data?.elements) {
      useCanvasStore.getState().loadElements(data.elements);
      console.log("Auto-loaded last canvas after login");
    }
  }
}, 500); // Pequeño delay para que termine de inicializar
      localStorage.setItem('nostr_user', JSON.stringify(nostrUser));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setIsLoading(false);
    }
  }, [setCurrentUser, fetchUserMetadata]);

  // Login with nsec key
  const loginWithNsec = useCallback(
    async (nsec: string) => {
      setIsLoading(true);
      setError(null);

      try {
        let sk: Uint8Array;

        if (nsec.startsWith("nsec")) {
          const decoded = nip19.decode(nsec);
          if (decoded.type !== "nsec") {
            throw new Error("Invalid nsec key");
          }
          sk = decoded.data as Uint8Array;
        } else {
          // Assume hex format
          sk = hexToBytes(nsec);
        }

        const pubkey = getPublicKey(sk);
        const npub = nip19.npubEncode(pubkey);

        // Fetch user metadata
        const metadata = await fetchUserMetadata(pubkey);

        const nostrUser: NostrUser = {
          pubkey,
          npub,
          name: metadata?.name,
          picture: metadata?.picture,
        };

        setUser(nostrUser);
        localStorage.setItem('nostr_user', JSON.stringify(nostrUser));
        setCurrentUser(nostrUser);
        setPrivateKey(sk);
        setTimeout(async () => {
  const lastCanvas = localStorage.getItem(`lastCanvas:${nostrUser.pubkey}`);
  if (lastCanvas) {
    const data = await loadCanvasState(lastCanvas);
    if (data?.elements) {
      useCanvasStore.getState().loadElements(data.elements);
      console.log("Auto-loaded last canvas after login");
    }
  }
}, 500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid key format");
      } finally {
        setIsLoading(false);
      }
    },
    [setCurrentUser, fetchUserMetadata]
  );

  // Login with Nostr Connect (NIP-46)
const loginWithNostrConnect = useCallback(async () => {
  setIsLoading(true);
  setError(null);

  try {
    // Limpiar conexión anterior si existe
    if (nostrConnectCleanup) {
      nostrConnectCleanup();
    }

    // Crear cliente NIP-46
    const client = createNostrConnectClient({
  relay: "wss://relay.damus.io", // Este relay está en ambos
  onConnect: async (remotePubkey) => {
        console.log("Connected with pubkey:", remotePubkey);
        
        // Obtener metadata del usuario remoto
        const metadata = await fetchUserMetadata(remotePubkey);
        const npub = nip19.npubEncode(remotePubkey);
        
        const nostrUser: NostrUser = {
          pubkey: remotePubkey,
          npub,
          name: metadata?.name,
          picture: metadata?.picture,
        };
        
        setUser(nostrUser);
        localStorage.setItem('nostr_user', JSON.stringify(nostrUser));
        setCurrentUser(nostrUser);
        setIsLoading(false);
        setNostrConnectUri(null);
        
        // Limpiar
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

    // Generar URI
    const uri = generateBunkerUri(client);
    setNostrConnectUri(uri);
    setNostrConnectClient(client);

    // Escuchar conexión
    // Escuchar en TODOS los relays
const secretKey = hexToBytesConnect(client.secret);

// Modificar el cliente para escuchar en múltiples relays
const multiRelayClient = { ...client, relay: relays[0] };

// Suscribirse a todos los relays
const subs = relays.map(relay => 
  client.pool.subscribeMany(
    [relay],
    [
      {
        kinds: [24133],
        "#p": [client.pubkey],
        since: Math.floor(Date.now() / 1000) - 60,
      },
    ] as any,
    {
      async onevent(event: any) {
        console.log(`Event from ${relay}:`, event);
        try {
          // Conectar directamente con el pubkey de Amber
          const remotePubkey = event.pubkey;
          console.log("Connection from:", remotePubkey);
          
          const metadata = await fetchUserMetadata(remotePubkey);
          const npub = nip19.npubEncode(remotePubkey);
          
          const nostrUser: NostrUser = {
            pubkey: remotePubkey,
            npub,
            name: metadata?.name,
            picture: metadata?.picture,
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

  

  // Sign event
  const signEvent = useCallback(
    async (unsignedEvent: UnsignedEvent): Promise<Event | null> => {
      try {
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
    [privateKey]
  );

  // Publish canvas action
  const publishCanvasAction = useCallback(
    async (
      action: "add" | "update" | "delete",
      element: CanvasElement,
      canvasId: string
    ) => {
      if (!pool || !user) return;

      try {
        const content = JSON.stringify({
          action,
          element,
          timestamp: Date.now(),
        });

        const unsignedEvent: UnsignedEvent = {
          kind: NOSTR_KIND_CANVAS_ACTION,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", canvasId],
            ["canvas", canvasId],
            ["author", user.pubkey],
          ],
          content,
          pubkey: user.pubkey,
        };

        const signedEvent = await signEvent(unsignedEvent);
        if (signedEvent) {
          // We use Promise.allSettled to avoid failing if one relay fails/rate-limits
          await Promise.allSettled(pool.publish(relays, signedEvent));
        }
      } catch (err) {
        // Silently fail for rate limits or connection issues to keep UI responsive
        console.warn("Failed to publish canvas action:", err);
      }
    },
    [pool, user, relays, signEvent]
  );

  // Publish cursor position (ephemeral)
  const publishCursorPosition = useCallback(
    async (x: number, y: number, canvasId: string) => {
      if (!pool || !user) return;

      try {
        const content = JSON.stringify({
          x,
          y,
          canvasId,
          timestamp: Date.now(),
        });

        const unsignedEvent: UnsignedEvent = {
          kind: NOSTR_KIND_CURSOR_POSITION,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["canvas", canvasId],
            ["author", user.pubkey],
          ],
          content,
          pubkey: user.pubkey,
        };

        const signedEvent = await signEvent(unsignedEvent);
        if (signedEvent) {
          // We use Promise.allSettled to avoid failing if one relay fails/rate-limits
          await Promise.allSettled(pool.publish(relays, signedEvent));
        }
      } catch (err) {
        // Silently fail for rate limits or connection issues to keep UI responsive
        // Cursor updates are not critical
        // console.warn("Failed to publish cursor:", err);
      }
    },
    [pool, user, relays, signEvent]
  );

  // Subscribe to canvas events
  const subscribeToCanvas = useCallback(
    (canvasId: string) => {
      if (!pool || !user) return () => { };

      // Subscribe to canvas actions
      const actionSub = pool.subscribeMany(
        relays,
        [
          {
            kinds: [NOSTR_KIND_CANVAS_ACTION],
            "#canvas": [canvasId],
          },
        ] as any,
        {
          onevent(event) {
            try {
              const data = JSON.parse(event.content);
              const element = data.element as CanvasElement;

              // Don't process our own events
              if (event.pubkey === user.pubkey) return;

              switch (data.action) {
                case "add":
                  addElement(element);
                  break;
                case "update":
                  updateElement(element.id, element);
                  break;
                case "delete":
                  deleteElement(element.id);
                  break;
              }
            } catch {
              // Invalid event
            }
          },
          oneose() {
            // End of stored events
          }
        }
      );

      // Subscribe to cursor positions
      const cursorSub = pool.subscribeMany(
        relays,
        [
          {
            kinds: [NOSTR_KIND_CURSOR_POSITION],
            "#canvas": [canvasId],
            since: Math.floor(Date.now() / 1000) - 60,
          },
        ] as any,
        {
          onevent(event) {
            try {
              // Don't process our own cursor
              if (event.pubkey === user.pubkey) return;

              const data = JSON.parse(event.content);
              const colorIndex =
                parseInt(event.pubkey.slice(-2), 16) % CURSOR_COLORS.length;

              const cursor: CursorPosition = {
                pubkey: event.pubkey,
                x: data.x,
                y: data.y,
                color: CURSOR_COLORS[colorIndex],
                timestamp: data.timestamp,
              };

              updateCursor(cursor);
            } catch {
              // Invalid event
            }
          },
          oneose() {
            // End of stored events
          }
        }
      );

      return () => {
        actionSub.close();
        cursorSub.close();
      };
    },
    [pool, relays, user, addElement, updateElement, deleteElement, updateCursor]
  );

  // Publish a note (kind 1) to Nostr
  const publishNote = useCallback(
    async (content: string, imageUrl?: string): Promise<boolean> => {
      if (!pool || !user) return false;

      try {
        const tags: string[][] = [
          ["client", "NostrDraw"],
          ["t", "nostrdraw"],
          ["t", "art"],
        ];

        // Add image with proper NIP-92 format if provided
        if (imageUrl) {
          // Add image tag
          tags.push(["image", imageUrl]);

          // Add imeta tag with detailed metadata (NIP-92)
          tags.push([
            "imeta",
            `url ${imageUrl}`,
            "m image/png",
            "blurhash LEHV6nWB2yk8pyo0adR*.7kCMdnj", // Could be generated
            "dim 1024x768", // Could be calculated
          ]);

          // Also add the image URL to the content for better client compatibility
          if (!content.includes(imageUrl)) {
            content = `${content}\n\n${imageUrl}`;
          }
        }

        const unsignedEvent: UnsignedEvent = {
          kind: 1, // Text note
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content,
          pubkey: user.pubkey,
        };

        const signedEvent = await signEvent(unsignedEvent);
        if (signedEvent) {
          const results = await Promise.allSettled(pool.publish(relays, signedEvent));
          // Consider success if at least one relay accepted it
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          return successCount > 0;
        }
        return false;
      } catch (err) {
        console.error("Failed to publish note:", err);
        return false;
      }
    },
    [pool, user, relays, signEvent]
  );

  // ============================================
  // NUEVAS FUNCIONES PARA PERSISTENCIA (NIP-33)
  // ============================================

  // Guardar el estado completo del canvas
  const saveCanvasState = useCallback(
    async (canvasId: string, canvasName: string): Promise<boolean> => {
      if (!pool || !user) return false;

      try {
        // Obtener elementos del store y filtrar los borrados
        const elementsArray = Array.from(useCanvasStore.getState().elements.values())
          .filter(el => !el.isDeleted);

        const canvasData = {
          version: "1.0",
          canvasId,
          canvasName,
          elements: elementsArray,
          timestamp: Date.now(),
        };

        const unsignedEvent: UnsignedEvent = {
          kind: NOSTR_KIND_CANVAS_STATE, // 30078
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["d", canvasId], // Identificador único del canvas (parameterized)
            ["title", canvasName],
            ["client", "NostrDraw"],
          ],
          content: JSON.stringify(canvasData),
          pubkey: user.pubkey,
        };

        const signedEvent = await signEvent(unsignedEvent);
        if (signedEvent) {
          const results = await Promise.allSettled(pool.publish(relays, signedEvent));
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          console.log(`Canvas saved to ${successCount} relays`);
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

  // Logout
  const logout = useCallback(async () => {
  // Auto-guardar antes de desloguear
  const currentCanvasId = useCanvasStore.getState().canvasId;
  const currentCanvasName = useCanvasStore.getState().canvasName;
  
  if (user && currentCanvasId) {
    console.log("Auto-saving before logout...");
    await saveCanvasState(currentCanvasId, currentCanvasName);
  }
  
  setUser(null);
  setCurrentUser(null);
  setPrivateKey(null);
  localStorage.removeItem('nostr_user');
  
  // Limpiar Nostr Connect
  if (nostrConnectCleanup) {
    nostrConnectCleanup();
    setNostrConnectCleanup(null);
  }
  setNostrConnectUri(null);
  setNostrConnectClient(null);
}, [setCurrentUser, nostrConnectCleanup, user, saveCanvasState]);

  // Cargar el estado de un canvas específico
  const loadCanvasState = useCallback(
  async (canvasId: string, authorPubkey?: string) => {
    if (!pool) return null;

    try {
      const filter: any = {
        kinds: [NOSTR_KIND_CANVAS_STATE],
        "#d": [canvasId],
        limit: 1,
      };

      // Si se especifica el autor, filtrar por él
      // Si no, buscar de cualquier autor (canvas compartido)
      if (authorPubkey) {
        filter.authors = [authorPubkey];
      } else if (user) {
        filter.authors = [user.pubkey];
      }

      const events = await pool.querySync(relays, filter);

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

  // Listar todos los canvas del usuario
  const listUserCanvases = useCallback(
    async () => {
      if (!pool || !user) return [];

      try {
        const events = await pool.querySync(relays, {
          kinds: [NOSTR_KIND_CANVAS_STATE],
          authors: [user.pubkey],
        });

        return events.map(event => {
          const data = JSON.parse(event.content);
          return {
            canvasId: data.canvasId,
            canvasName: data.canvasName,
            timestamp: data.timestamp,
            elementCount: data.elements.length,
            event: event, // Por si necesitas el evento completo
          };
        }).sort((a, b) => b.timestamp - a.timestamp); // Más reciente primero
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
        pool,
        relays,
        user,
        isConnected,
        isLoading,
        error,
        loginWithExtension,
        loginWithNsec,
        logout,
        publishCanvasAction,
        publishCursorPosition,
        subscribeToCanvas,
        publishNote,
        // NUEVAS FUNCIONES
        saveCanvasState,
        loadCanvasState,
        listUserCanvases,
        loginWithNostrConnect,
        nostrConnectUri,
      }}
    >
      {children}
    </NostrContext.Provider>
  );
}

export function useNostr() {
  const context = useContext(NostrContext);
  if (!context) {
    throw new Error("useNostr must be used within a NostrProvider");
  }
  return context;
}

// Helper function to convert hex to bytes
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// NIP-07 type declaration
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