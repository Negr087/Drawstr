"use client";

import { useState, useEffect } from "react";
import { useNostr } from "./nostr-context";

interface CustomEmoji {
  shortcode: string;
  url: string;
  source?: string; // Quién publicó el pack
}

const NIP30_EMOJI_SET_KIND = 10030;

// Algunos pubkeys conocidos que publican buenos emoji packs
const KNOWN_EMOJI_PUBLISHERS = [
  "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2", // amethyst
  // Podés agregar más pubkeys de clientes conocidos
];

export function useCustomEmojis() {
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([]);
  const [loading, setLoading] = useState(true);
  const { pool, relays } = useNostr();

  useEffect(() => {
    if (!pool) return;

    const loadEmojis = async () => {
      try {
        console.log("📦 Loading NIP-30 custom emojis...");
        
       // Relays especializados en custom content + tus relays normales
      const emojiRelays = [
        ...relays,
        "wss://relay.nostr.band",
        "wss://nos.lol",
        "wss://relay.snort.social",
        "wss://relay.damus.io",
      ];
      
      // Buscar emoji sets
      const events = await pool.querySync(emojiRelays, {
        kinds: [NIP30_EMOJI_SET_KIND],
        limit: 100, // ← Aumentar límite
      });

        console.log(`Found ${events.length} emoji sets`);

            // Mostrar de qué relays vienen
    const relayCount = new Map<string, number>();
    events.forEach(e => {
      const relay = (e as any).relay || "unknown";
      relayCount.set(relay, (relayCount.get(relay) || 0) + 1);
    });
    console.log("📊 Events per relay:", Object.fromEntries(relayCount));

    // También buscar emojis individuales (algunos clientes usan esto)
const individualEmojis = await pool.querySync(emojiRelays, {
  kinds: [1063], // NIP-94 File metadata
  "#m": ["image/gif", "image/png"], // Solo imágenes
  limit: 50,
});

console.log(`Found ${individualEmojis.length} individual emoji files`);

const emojis: CustomEmoji[] = [];

events.forEach(nostrEvent => {  // ← Cambiar 'event' por 'nostrEvent'
  console.log("Emoji set from:", nostrEvent.pubkey.slice(0, 16), "tags:", nostrEvent.tags.length);
  
  // Extraer emojis de los tags
  nostrEvent.tags.forEach(tag => {
    if (tag[0] === "emoji" && tag[1] && tag[2]) {
      console.log("  - Found emoji:", tag[1], tag[2].slice(0, 50));
      emojis.push({
        shortcode: tag[1],
        url: tag[2],
        source: nostrEvent.pubkey,  // ← Cambiar aquí también
      });
    }
  });
});

        console.log(`Loaded ${emojis.length} custom emojis`);
        setCustomEmojis(emojis);
      } catch (error) {
        console.error("Failed to load custom emojis:", error);
      } finally {
        setLoading(false);
      }
    };

    loadEmojis();
  }, [pool, relays]);

  return { customEmojis, loading };
}