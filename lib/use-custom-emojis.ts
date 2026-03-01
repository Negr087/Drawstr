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
  "7fa56f5d6962ab1e3cd424e758c3002b8665f7b0d8dcee9fe9e288d7751ac194", // emojito.meme
];

// Lista de dominios bloqueados por CORS
const BLOCKED_DOMAINS = [
  'betterttv.net',
  'frankerfacez.com',
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
          "wss://purplepag.es",
        ];
        
        console.log("🔍 Querying relays:", emojiRelays);
        
        // Buscar emoji sets
        const events = await pool.querySync(emojiRelays, {
          kinds: [NIP30_EMOJI_SET_KIND, 30030],
          authors: KNOWN_EMOJI_PUBLISHERS,
          limit: 100,
        });

        console.log(`✅ Found ${events.length} emoji sets from ${emojiRelays.length} relays`);
        
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

        const emojiPromises: Promise<CustomEmoji | null>[] = [];

        events.forEach(nostrEvent => {
          console.log("Emoji set from:", nostrEvent.pubkey.slice(0, 16), "tags:", nostrEvent.tags.length);
          
          // Extraer emojis de los tags
          nostrEvent.tags.forEach(tag => {
            if (tag[0] === "emoji" && tag[1] && tag[2]) {
              const url = tag[2];
              const shortcode = tag[1];
              
              // Filtrar URLs con CORS bloqueado
              const isBlocked = BLOCKED_DOMAINS.some(domain => url.includes(domain));
              if (isBlocked) {
                console.log("  ⚠️ Skipping CORS-blocked emoji:", shortcode, url.slice(0, 50));
                return;
              }
              
              // Validar que la imagen carga correctamente
              const validatePromise = new Promise<CustomEmoji | null>((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                
                img.onload = () => {
                  console.log("  ✅ Valid emoji:", shortcode);
                  resolve({
                    shortcode: shortcode,
                    url: url,
                    source: nostrEvent.pubkey,
                  });
                };
                
                img.onerror = () => {
                  console.log("  ❌ Failed to load:", shortcode, url.slice(0, 50));
                  resolve(null); // No agregar este emoji
                };
                
                // Timeout de 5 segundos
                setTimeout(() => {
                  console.log("  ⏱️ Timeout:", shortcode);
                  resolve(null);
                }, 5000);
                
                img.src = url;
              });
              
              emojiPromises.push(validatePromise);
            }
          });
        });

        // Esperar a que todas las imágenes se validen
        console.log(`🔄 Validating ${emojiPromises.length} emojis...`);
        const validatedEmojis = await Promise.all(emojiPromises);
        const validEmojis = validatedEmojis.filter((e): e is CustomEmoji => e !== null);

        console.log(`✅ Loaded ${validEmojis.length} valid custom emojis (${emojiPromises.length - validEmojis.length} failed)`);
        setCustomEmojis(validEmojis);
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