"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

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
          className="fixed bg-card border border-border rounded-lg p-3 shadow-xl z-[9999] w-64"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
          }}
        >
          <div className="text-xs text-muted-foreground mb-2 font-medium">Nostr Emojis</div>
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
        </div>,
        document.body
      )}
    </>
  );
}