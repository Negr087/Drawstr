"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useNostr } from "@/lib/nostr-context";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { STROKE_COLORS, STROKE_WIDTHS, type Tool } from "@/lib/types";
import {
  MousePointer2,
  Square,
  Circle,
  ArrowUpRight,
  Pencil,
  Type,
  Eraser,
  Hand,
  Minus,
  Plus,
  RotateCcw,
  Check,
  Cloud,
  CloudOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SaveCanvasModal } from "@/components/canvas/save-canvas-modal";
import { LoadCanvasModal } from "@/components/canvas/load-canvas-modal";
import { Zap } from "lucide-react";

const tools: { id: Tool; icon: React.ReactNode; label: string; shortcut: string }[] = [
  { id: "select", icon: <MousePointer2 size={18} />, label: "Select", shortcut: "V" },
  { id: "rectangle", icon: <Square size={18} />, label: "Rectangle", shortcut: "R" },
  { id: "ellipse", icon: <Circle size={18} />, label: "Ellipse", shortcut: "O" },
  { id: "arrow", icon: <ArrowUpRight size={18} />, label: "Arrow", shortcut: "A" },
  { id: "freedraw", icon: <Pencil size={18} />, label: "Draw", shortcut: "P" },
  { id: "text", icon: <Type size={18} />, label: "Text", shortcut: "T" },
  { id: "laser", icon: <Zap size={18} />, label: "Laser Pointer", shortcut: "L" },
  { id: "eraser", icon: <Eraser size={18} />, label: "Eraser", shortcut: "E" },
  { id: "hand", icon: <Hand size={18} />, label: "Pan", shortcut: "H" },
];

// Genera un "hash" del estado actual del canvas basado en los updatedAt de todos los elementos
// Si cualquier elemento cambia (color, posición, etc.) el hash cambia
function getElementsHash(elements: Map<string, any>): string {
  const active = Array.from(elements.values()).filter(el => !el.isDeleted);
  if (active.length === 0) return "";
  return active
    .map(el => `${el.id}:${el.updatedAt}`)
    .sort()
    .join("|");
}

export function Toolbar() {
  const {
    activeTool,
    setActiveTool,
    strokeColor,
    setStrokeColor,
    strokeWidth,
    setStrokeWidth,
    fillColor,
    setFillColor,
    zoom,
    setZoom,
    setViewportOffset,
    elements,
    selectedElementIds,
    updateElement,
    canvasId,
    canvasName,
  } = useCanvasStore();

  const { saveCanvasState, user } = useNostr();

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);

  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const lastHashRef = useRef<string>("");
  const savedHashRef = useRef<string>("");  // hash del último guardado exitoso
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);

  const doSave = useCallback(async (currentHash: string) => {
    if (isSavingRef.current || !user || !canvasId || user.readOnly) {
      console.log("doSave blocked:", { isSaving: isSavingRef.current, user: !!user, canvasId, readOnly: user?.readOnly });
      return;
    }
    isSavingRef.current = true;
    setAutoSaveStatus("saving");
    console.log("doSave START — canvasId:", canvasId, "canvasName:", canvasName);

    try {
      const success = await saveCanvasState(canvasId, canvasName);
      console.log("doSave result:", success);
      if (success) {
        savedHashRef.current = currentHash;
        setAutoSaveStatus("saved");
        setLastSaved(new Date());
        setTimeout(() => setAutoSaveStatus("idle"), 3000);
      } else {
        console.warn("saveCanvasState returned false");
        setAutoSaveStatus("error");
        setTimeout(() => setAutoSaveStatus("idle"), 3000);
      }
    } catch (err) {
      console.error("Auto-save failed:", err);
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    } finally {
      isSavingRef.current = false;
    }
  }, [user, canvasId, canvasName, saveCanvasState]);

  // Auto-save: detecta CUALQUIER cambio en elementos (no solo count)
  useEffect(() => {
    if (!user || !canvasId || user.readOnly) return;
    // Solo auto-guardar si eres el autor del canvas
  // (si el canvas tiene ?author= y no eres ese author, no guardes)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const canvasAuthor = params.get("author");
    if (canvasAuthor && canvasAuthor !== user.pubkey) {
      console.log("Not canvas author, skipping auto-save");
      return;
    }
  }

    const currentHash = getElementsHash(elements);
    console.log("Auto-save check — hash:", currentHash.slice(0, 40), "| savedHash:", savedHashRef.current.slice(0, 40));

    if (!currentHash) return;
    if (currentHash === savedHashRef.current) {
      console.log("Hash unchanged, skipping");
      return;
    }

    if (currentHash !== lastHashRef.current) {
      lastHashRef.current = currentHash;
      console.log("Hash changed, scheduling save in 5s...");

      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

      autoSaveTimeoutRef.current = setTimeout(() => {
        console.log("Timer fired, saving...");
        doSave(currentHash);
      }, 5000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [elements, user, canvasId, doSave]);

  // Guardar también cuando el usuario cierra/abandona la pestaña
  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentHash = getElementsHash(elements);
      if (currentHash && currentHash !== savedHashRef.current && user && !user.readOnly && canvasId) {
        // beforeunload no puede await, pero intentamos disparar el save
        saveCanvasState(canvasId, canvasName);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [elements, user, canvasId, canvasName, saveCanvasState]);

  const getTimeSinceLastSave = () => {
    if (!lastSaved) return null;
    const diffMs = Date.now() - lastSaved.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins === 1) return "1 min ago";
    return `${diffMins} mins ago`;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const tool = tools.find((t) => t.shortcut.toLowerCase() === key);
      if (tool) { setActiveTool(tool.id); return; }
      if (e.ctrlKey || e.metaKey) {
        if (key === 's') { e.preventDefault(); setSaveModalOpen(true); }
        else if (key === 'o') { e.preventDefault(); setLoadModalOpen(true); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTool]);

  const handleZoomIn = () => setZoom(Math.min(5, zoom + 0.25));
  const handleZoomOut = () => setZoom(Math.max(0.1, zoom - 0.25));
  const handleResetView = () => { setZoom(1); setViewportOffset({ x: 0, y: 0 }); };

  const handleStrokeColorChange = (color: string) => {
    setStrokeColor(color);
    if (selectedElementIds.size > 0) {
      selectedElementIds.forEach((id) => updateElement(id, { strokeColor: color }));
    }
  };

  const handleFillColorChange = (color: string) => {
    setFillColor(color);
    if (selectedElementIds.size > 0) {
      selectedElementIds.forEach((id) => updateElement(id, { fillColor: color }));
    }
  };

  const handleStrokeWidthChange = (width: number) => {
    setStrokeWidth(width);
    if (selectedElementIds.size > 0) {
      selectedElementIds.forEach((id) => updateElement(id, { strokeWidth: width }));
    }
  };

  return (
    <TooltipProvider delayDuration={200}>

      {/* Auto-save status indicator — top right corner */}
      {user && !user.readOnly && (
        <div className="absolute top-16 right-4 flex items-center gap-1.5 text-xs text-muted-foreground z-30">
          {autoSaveStatus === "saving" && (
            <><Cloud className="h-3 w-3 animate-pulse text-blue-400" /><span>Saving...</span></>
          )}
          {autoSaveStatus === "saved" && (
            <><Check className="h-3 w-3 text-green-500" /><span className="text-green-500">Saved</span></>
          )}
          {autoSaveStatus === "error" && (
            <><CloudOff className="h-3 w-3 text-red-500" /><span className="text-red-500">Save failed</span></>
          )}
          {autoSaveStatus === "idle" && lastSaved && (
            <><Cloud className="h-3 w-3" /><span>{getTimeSinceLastSave()}</span></>
          )}
        </div>
      )}

      {/* Left Toolbar - Tools (Desktop) */}
<div className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 flex-col gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg z-30">
  {tools.map((tool) => (
    <Tooltip key={tool.id}>
      <TooltipTrigger asChild>
        <Button
          variant={activeTool === tool.id ? "default" : "ghost"}
          size="icon"
          className={cn(
            "w-10 h-10",
            activeTool === tool.id && "bg-primary text-primary-foreground"
          )}
          onClick={() => setActiveTool(tool.id)}
        >
          {tool.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{tool.label} <kbd className="ml-2 text-xs opacity-60">{tool.shortcut}</kbd></p>
      </TooltipContent>
    </Tooltip>
  ))}
</div>

{/* Top Toolbar - Tools (Mobile) */}
<div className="md:hidden absolute top-16 left-0 right-0 flex items-center gap-1 bg-card/80 backdrop-blur-sm border-b border-border p-2 overflow-x-auto z-30">
  {tools.map((tool) => (
    <Button
      key={tool.id}
      variant={activeTool === tool.id ? "default" : "ghost"}
      size="icon"
      className={cn(
        "w-12 h-12 flex-shrink-0",
        activeTool === tool.id && "bg-primary text-primary-foreground"
      )}
      onClick={() => setActiveTool(tool.id)}
    >
      {tool.icon}
    </Button>
  ))}
</div>

      {/* Bottom Toolbar - Colors & Stroke Width */}
<div className="absolute bottom-4 md:bottom-4 sm:bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 md:gap-4 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-2 md:p-3 shadow-lg max-w-[95vw] overflow-x-auto">
  <div className="flex items-center gap-1 md:gap-2">
    <span className="text-xs text-muted-foreground mr-1 hidden md:inline">Stroke</span>
    <div className="flex gap-1">
      {STROKE_COLORS.map((color) => (
        <Tooltip key={color}>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "w-8 h-8 md:w-6 md:h-6 rounded-full border-2 transition-transform active:scale-95",
                strokeColor === color ? "border-primary scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: color }}
              onClick={() => handleStrokeColorChange(color)}
            />
          </TooltipTrigger>
          <TooltipContent className="hidden md:block"><p>{color}</p></TooltipContent>
        </Tooltip>
      ))}
    </div>
  </div>

  <div className="w-px h-6 md:h-8 bg-border" />

  <div className="flex items-center gap-1 md:gap-2">
    <span className="text-xs text-muted-foreground mr-1 hidden md:inline">Width</span>
    <div className="flex gap-1">
      {STROKE_WIDTHS.map((width) => (
        <Tooltip key={width}>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "w-9 h-9 md:w-8 md:h-8 rounded flex items-center justify-center border transition-colors active:scale-95",
                strokeWidth === width
                  ? "border-primary bg-primary/20"
                  : "border-transparent hover:bg-secondary"
              )}
              onClick={() => handleStrokeWidthChange(width)}
            >
              <div
                className="rounded-full bg-foreground"
                style={{ width: Math.min(width * 3, 16), height: Math.min(width * 3, 16) }}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent className="hidden md:block"><p>{width}px</p></TooltipContent>
        </Tooltip>
      ))}
    </div>
  </div>
</div>

      {/* Right Toolbar - Zoom Controls */}
<div className="absolute right-4 bottom-4 md:bottom-4 sm:bottom-20 flex items-center gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-1 shadow-lg">
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="w-9 h-9 md:w-8 md:h-8" onClick={handleZoomOut}>
        <Minus size={18} className="md:w-4 md:h-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent className="hidden md:block">Zoom Out</TooltipContent>
  </Tooltip>

  <span className="text-sm font-mono w-12 md:w-14 text-center text-xs md:text-sm">{Math.round(zoom * 100)}%</span>

  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="w-9 h-9 md:w-8 md:h-8" onClick={handleZoomIn}>
        <Plus size={18} className="md:w-4 md:h-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent className="hidden md:block">Zoom In</TooltipContent>
  </Tooltip>

  <div className="w-px h-6 bg-border mx-1" />

  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="w-9 h-9 md:w-8 md:h-8" onClick={handleResetView}>
        <RotateCcw size={18} className="md:w-4 md:h-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent className="hidden md:block">Reset View</TooltipContent>
  </Tooltip>
</div>

      <SaveCanvasModal open={saveModalOpen} onOpenChange={setSaveModalOpen} />
      <LoadCanvasModal open={loadModalOpen} onOpenChange={setLoadModalOpen} />
    </TooltipProvider>
  );
}