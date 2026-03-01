"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCustomEmojis } from "@/lib/use-custom-emojis";

interface EmojiPanelProps {
  onEmojiSelect: (emoji: string) => void;
}

const NOSTR_EMOJIS = [
  // Crypto & Lightning
  { emoji: "⚡", label: "Lightning" },
  { emoji: "₿", label: "Bitcoin" },
  { emoji: "🟣", label: "Nostr" },

  // Nostr Ostrich (imagen)
  { 
    emoji: "/nostr-ostrich.png",
    label: "Nostr Ostrich", 
    type: "image"
  },

    // ===== AGREGAR ESTOS CUSTOM EMOJIS =====
  { emoji: "🫂", label: "Hug", type: "emoji" },
  { emoji: "🫡", label: "Salute", type: "emoji" },
  { emoji: "🤝", label: "Handshake", type: "emoji" },
  { emoji: "🫰", label: "Hand Heart", type: "emoji" },
  { emoji: "🍊", label: "Orange Pill", type: "emoji" },
  { emoji: "🌽", label: "Corn (Podcast)", type: "emoji" },
  { emoji: "🐸", label: "Pepe", type: "emoji" },
  { emoji: "🌊", label: "Wave", type: "emoji" },
  
  // Nostr culture
  { emoji: "🤙", label: "Shaka" },
  { emoji: "🦩", label: "Flamingo" },
  { emoji: "💜", label: "Purple Heart" },
  { emoji: "🧡", label: "Orange Heart" },
  
  // Popular
  { emoji: "🔥", label: "Fire" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "👍", label: "Thumbs Up" },
  { emoji: "🎨", label: "Art" },
  { emoji: "✨", label: "Sparkles" },
  { emoji: "💎", label: "Gem" },
  { emoji: "🌟", label: "Star" },
  { emoji: "🎯", label: "Target" },
];

export function EmojiPanel({ onEmojiSelect }: EmojiPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const { customEmojis, loading } = useCustomEmojis();
  const [activeTab, setActiveTab] = useState<"default" | "custom">("default");

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        x: rect.left,
        y: rect.top - 280, // Arriba del botón
      });
    }
  }, [isOpen]);
  
  useEffect(() => {
  if (!isOpen) return;

  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // No cerrar si clickeás el botón o dentro del panel
    if (
      buttonRef.current?.contains(target) ||
      target.closest('[data-emoji-panel]')
    ) {
      return;
    }
    
    setIsOpen(false);
  };

  // Delay para evitar que se cierre inmediatamente al abrir
  setTimeout(() => {
    document.addEventListener('mousedown', handleClickOutside);
  }, 0);

  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, [isOpen]);

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    setIsOpen(false);
  };

  return (
    <>
      {/* Toggle Button */}
      <Button
        ref={buttonRef}
        variant="outline"
        size="icon"
        className={cn(
          "w-10 h-10",
          isOpen && "bg-primary text-primary-foreground"
        )}
        onClick={() => {
          console.log("🎯 Emoji button clicked! isOpen:", isOpen);
          setIsOpen(!isOpen);
        }}
      >
        <Smile size={18} />
      </Button>

      {/* Emoji Grid (Portal) */}
      {isOpen && typeof window !== 'undefined' && createPortal(
  <div 
    data-emoji-panel
    className="fixed bg-card border border-border rounded-lg shadow-xl z-[9999] w-72"
    style={{
      left: `${position.x}px`,
      top: `${position.y}px`,
    }}
  >
    {/* Tabs */}
    <div className="flex border-b border-border">
      <button
        className={cn(
          "flex-1 px-4 py-2 text-sm font-medium transition-colors",
          activeTab === "default" 
            ? "bg-primary/10 text-primary border-b-2 border-primary" 
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => setActiveTab("default")}
      >
        Nostr Emojis
      </button>
      <button
        className={cn(
          "flex-1 px-4 py-2 text-sm font-medium transition-colors",
          activeTab === "custom" 
            ? "bg-primary/10 text-primary border-b-2 border-primary" 
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => setActiveTab("custom")}
      >
        Custom {customEmojis.length > 0 && `(${customEmojis.length})`}
      </button>
    </div>

    {/* Content */}
    <div className="p-3 max-h-80 overflow-y-auto">
      {activeTab === "default" ? (
        <div className="grid grid-cols-4 gap-1">
          {NOSTR_EMOJIS.map(({ emoji, label, type }) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="w-14 h-14 flex items-center justify-center hover:bg-secondary rounded transition-colors active:scale-95"
              title={label}
            >
              {type === "image" ? (
                <img 
                  src={emoji} 
                  alt={label} 
                  className="w-10 h-10 object-contain"
                />
              ) : (
                <span className="text-3xl">{emoji}</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Loading custom emojis...
            </div>
          ) : customEmojis.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No custom emojis found.<br/>
              <span className="text-xs">Check your relay connections.</span>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {customEmojis.map((customEmoji, index) => (
  <button
    key={`${customEmoji.source}-${customEmoji.shortcode}-${index}`}
    onClick={() => handleEmojiClick(customEmoji.url)}
    className="w-14 h-14 flex items-center justify-center hover:bg-secondary rounded transition-colors active:scale-95"
    title={customEmoji.shortcode}
  >
    <img 
      src={customEmoji.url} 
      alt={customEmoji.shortcode}
      className="w-10 h-10 object-contain"
    />
  </button>
))}
            </div>
          )}
        </div>
      )}
    </div>
  </div>,
  document.body
)}
    </>
  );
}