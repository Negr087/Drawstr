"use client";

import { useEffect, useRef, useState } from "react";
import type { TextElement } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { Check, X, Bold, Italic, Underline } from "lucide-react";

interface InlineTextEditorProps {
  element: TextElement;
  position: { x: number; y: number };
  viewportOffset: { x: number; y: number };
  zoom: number;
  onUpdate: (updates: Partial<TextElement>) => void;
  onFinish: () => void;
  onCancel: () => void;
}

const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans Serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
  { value: "cursive", label: "Cursive" },
  { value: "fantasy", label: "Fantasy" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "'Times New Roman', serif", label: "Times New Roman" },
  { value: "'Courier New', monospace", label: "Courier New" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "'Comic Sans MS', cursive", label: "Comic Sans" },
  { value: "Impact, fantasy", label: "Impact" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
];

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96];

const COLORS = [
  "#000000", // Black
  "#ffffff", // White
  "#e03131", // Red
  "#2f9e44", // Green
  "#1971c2", // Blue
  "#f08c00", // Orange
  "#9c36b5", // Purple
  "#099268", // Teal
  "#e67700", // Dark Orange
  "#c92a2a", // Dark Red
];

export function InlineTextEditor({
  element,
  position,
  viewportOffset,
  zoom,
  onUpdate,
  onFinish,
  onCancel,
}: InlineTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(element.text);
  const [localFontSize, setLocalFontSize] = useState(element.fontSize);
  const [localFontFamily, setLocalFontFamily] = useState(element.fontFamily);

  // Focus automático
  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  // Auto-resize del textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [text]);

  // Calcular posición en pantalla
  const screenX = position.x * zoom + viewportOffset.x;
  const screenY = position.y * zoom + viewportOffset.y;

  const handleTextChange = (newText: string) => {
    setText(newText);
    onUpdate({ text: newText });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    // Permitir Enter para multi-línea
    // Shift+Enter para nueva línea, Enter solo para terminar
    if (e.key === "Enter" && !e.shiftKey && text.trim()) {
      e.preventDefault();
      onFinish();
    }
  };

  const toggleBold = () => {
    const newWeight = element.fontWeight === "bold" ? "normal" : "bold";
    onUpdate({ fontWeight: newWeight });
  };

  const toggleItalic = () => {
    const newStyle = element.fontStyle === "italic" ? "normal" : "italic";
    onUpdate({ fontStyle: newStyle });
  };

  const toggleUnderline = () => {
    const newDecoration = element.textDecoration === "underline" ? "none" : "underline";
    onUpdate({ textDecoration: newDecoration });
  };

  return (
    <>
      {/* Textarea inline */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type here..."
        className="absolute bg-transparent border-2 border-primary rounded px-2 py-1 outline-none resize-none overflow-hidden"
        style={{
          left: `${screenX}px`,
          top: `${screenY}px`,
          fontSize: `${element.fontSize * zoom}px`,
          fontFamily: element.fontFamily,
          fontWeight: element.fontWeight,
          fontStyle: element.fontStyle,
          textDecoration: element.textDecoration,
          color: element.strokeColor,
          width: `${Math.max(200, element.width * zoom)}px`,
          minHeight: `${element.fontSize * zoom * 1.2}px`,
          zIndex: 1000,
          lineHeight: '1.2',
        }}
      />

      {/* Panel lateral flotante */}
      <div
        className="absolute bg-card border border-border rounded-lg p-3 shadow-xl"
        style={{
          left: `${screenX + Math.max(200, element.width * zoom) + 20}px`,
          top: `${screenY}px`,
          zIndex: 999,
          width: "280px",
        }}
        onMouseDown={(e) => e.stopPropagation()} // Evitar que se cierre al hacer click
      >
        <div className="space-y-3">
          {/* Botones de estilo */}
          <div>
            <Label className="text-xs mb-2 block">Text Style</Label>
            <div className="flex gap-1">
              <Toggle
                pressed={element.fontWeight === "bold"}
                onPressedChange={toggleBold}
                size="sm"
                aria-label="Toggle bold"
              >
                <Bold className="h-4 w-4" />
              </Toggle>
              <Toggle
                pressed={element.fontStyle === "italic"}
                onPressedChange={toggleItalic}
                size="sm"
                aria-label="Toggle italic"
              >
                <Italic className="h-4 w-4" />
              </Toggle>
              <Toggle
                pressed={element.textDecoration === "underline"}
                onPressedChange={toggleUnderline}
                size="sm"
                aria-label="Toggle underline"
              >
                <Underline className="h-4 w-4" />
              </Toggle>
            </div>
          </div>

          <Separator />

          {/* Font Family */}
          <div>
            <Label className="text-xs mb-2 block">Font Family</Label>
            <Select
  value={localFontFamily}
  onValueChange={(value) => {
    setLocalFontFamily(value);
    onUpdate({ fontFamily: value });
  }}
>
  <SelectTrigger className="h-9">
    <SelectValue />
  </SelectTrigger>
  <SelectContent className="z-[9999]" position="popper" sideOffset={5}>
    {FONT_FAMILIES.map((font) => (
      <SelectItem key={font.value} value={font.value}>
        <span style={{ fontFamily: font.value }}>{font.label}</span>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
          </div>

          {/* Font Size */}
          <div>
            <Label className="text-xs mb-2 block">Font Size</Label>
            <div className="flex gap-2">
              <Select
                value={localFontSize.toString()}
                onValueChange={(value) => {
                  const size = parseInt(value);
                  setLocalFontSize(size);
                  onUpdate({ fontSize: size });
                }}
              >
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[9999]" position="popper" sideOffset={5}>
  {FONT_SIZES.map((size) => (
    <SelectItem key={size} value={size.toString()}>
      {size}px
    </SelectItem>
  ))}
</SelectContent>
              </Select>
              <Input
                type="number"
                value={localFontSize}
                onChange={(e) => {
                  const size = parseInt(e.target.value) || 20;
                  setLocalFontSize(size);
                  onUpdate({ fontSize: size });
                }}
                className="h-9 w-20"
                min={8}
                max={200}
              />
            </div>
          </div>

          <Separator />

          {/* Color Picker */}
          <div>
            <Label className="text-xs mb-2 block">Text Color</Label>
            <div className="grid grid-cols-5 gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onUpdate({ strokeColor: color })}
                  className={`w-10 h-10 rounded border-2 transition-transform hover:scale-110 ${
                    element.strokeColor === color ? "border-primary scale-110" : "border-border"
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <Input
              type="color"
              value={element.strokeColor}
              onChange={(e) => onUpdate({ strokeColor: e.target.value })}
              className="h-9 mt-2"
            />
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={onFinish} className="flex-1">
              <Check className="h-4 w-4 mr-1" />
              Done
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1 py-0.5 bg-muted rounded">Enter</kbd> or click Done
          </p>
        </div>
      </div>
    </>
  );
}