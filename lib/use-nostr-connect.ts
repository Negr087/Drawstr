"use client";

import { useState, useEffect, useRef } from "react";
import { generatePrivateKey, getPublicKey, nip19 } from "nostr-tools";
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

  const clientSecretKey = useRef<string | null>(null);
  const pool = useRef<SimplePool>(new SimplePool());
  const subscriptionRef = useRef<any>(null);

  const generateConnectionUri = () => {
    // Generar clave temporal para el cliente (v1 usa hex strings)
    clientSecretKey.current = generatePrivateKey();
    const clientPubkey = getPublicKey(clientSecretKey.current);
    
    // Metadata de la app
    const metadata = {
      name: "NostrDraw",
      url: typeof window !== 'undefined' ? window.location.origin : 'https://drawstr.vercel.app',
      description: "Collaborative drawing canvas",
    };

    // URI format para Primal/Amber
    const params = new URLSearchParams();
    relays.forEach(relay => params.append('relay', relay));
    params.append('metadata', JSON.stringify(metadata));
    
    const uri = `nostrconnect://${clientPubkey}?${params.toString()}`;
    
    console.log("🔗 Generated NIP-46 URI:", uri);
    
    setState(prev => ({ 
      ...prev, 
      uri,
      isWaiting: true 
    }));

    // Escuchar respuesta del signer
    startListening(clientPubkey);
  };

  const startListening = (clientPubkey: string) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsub();
    }

    console.log("👂 Listening for NIP-46 response on relays:", relays);

    const filter = {
      kinds: [24133],
      "#p": [clientPubkey],
      since: Math.floor(Date.now() / 1000),
    };

    console.log("📝 Filter:", JSON.stringify(filter));

    // v1 usa .sub() en vez de .subscribeMany()
    subscriptionRef.current = pool.current.sub(relays, [filter]);

    subscriptionRef.current.on('event', (event: any) => {
      console.log("📨 Received NIP-46 event:", event);
      
      try {
        const remotePubkey = event.pubkey;
        const npub = nip19.npubEncode(remotePubkey);
        
        console.log("✅ Connected to remote signer:", npub);
        
        setState(prev => ({
          ...prev,
          connected: true,
          remotePubkey,
          isWaiting: false,
        }));

        subscriptionRef.current?.unsub();
      } catch (error) {
        console.error("Failed to process NIP-46 event:", error);
      }
    });

    subscriptionRef.current.on('eose', () => {
      console.log("📡 EOSE received");
    });
  };

  const reset = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsub();
    }
    clientSecretKey.current = null;
    setState({
      uri: null,
      connected: false,
      remotePubkey: null,
      isWaiting: false,
    });
  };

  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsub();
      }
    };
  }, []);

  return {
    ...state,
    generateConnectionUri,
    reset,
  };
}