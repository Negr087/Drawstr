"use client";

import { useEffect, useState, useRef } from "react";
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
  Save,
  FolderOpen,
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

export function Toolbar() {
  const {
    activeTool,
    setActiveTool,
    strokeColor,
    setStrokeColor,
    strokeWidth,
    setStrokeWidth,
    zoom,
    setZoom,
    setViewportOffset,
    elements,
    canvasId,
    canvasName,
  } = useCanvasStore();

  const { saveCanvasState, user } = useNostr();

  // Estados para los modales
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);

  // Estados para auto-save
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const lastElementsCountRef = useRef(0);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save cada 30 segundos si hay cambios
  useEffect(() => {
    if (!user || !canvasId) return;

    const currentElementCount = Array.from(elements.values()).filter(el => !el.isDeleted).length;

    // Si cambió la cantidad de elementos, programar auto-save
    if (currentElementCount !== lastElementsCountRef.current && currentElementCount > 0) {
      // Cancelar timeout anterior si existe
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      // Programar nuevo auto-save en 30 segundos
      autoSaveTimeoutRef.current = setTimeout(async () => {
        setAutoSaveStatus("saving");
        
        try {
          const success = await saveCanvasState(canvasId, canvasName);
          
          if (success) {
            setAutoSaveStatus("saved");
            setLastSaved(new Date());
            // Volver a idle después de 3 segundos
            setTimeout(() => setAutoSaveStatus("idle"), 3000);
          } else {
            setAutoSaveStatus("error");
            setTimeout(() => setAutoSaveStatus("idle"), 3000);
          }
        } catch (error) {
          console.error("Auto-save failed:", error);
          setAutoSaveStatus("error");
          setTimeout(() => setAutoSaveStatus("idle"), 3000);
        }
      }, 30000); // 30 segundos

      lastElementsCountRef.current = currentElementCount;
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [elements, user, canvasId, canvasName, saveCanvasState]);

  // Formatear tiempo desde último guardado
  const getTimeSinceLastSave = () => {
    if (!lastSaved) return null;
    
    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins === 1) return "1 min ago";
    return `${diffMins} mins ago`;
  };

  // Keyboard shortcuts with proper cleanup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const key = e.key.toLowerCase();
      
      // Shortcuts para herramientas
      const tool = tools.find((t) => t.shortcut.toLowerCase() === key);
      if (tool) {
        setActiveTool(tool.id);
        return;
      }

      // Shortcuts para Save/Load
      if (e.ctrlKey || e.metaKey) {
        if (key === 's') {
          e.preventDefault();
          setSaveModalOpen(true);
        } else if (key === 'o') {
          e.preventDefault();
          setLoadModalOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTool]);

  const handleZoomIn = () => setZoom(Math.min(5, zoom + 0.25));
  const handleZoomOut = () => setZoom(Math.max(0.1, zoom - 0.25));
  const handleResetView = () => {
    setZoom(1);
    setViewportOffset({ x: 0, y: 0 });
  };

  return (
    <TooltipProvider delayDuration={200}>
      {/* ========== COMENTADO: Top Toolbar - Save & Load ==========
      <div className="absolute top-13 right-4 flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setSaveModalOpen(true)}
            >
              <Save size={16} />
              <span className="hidden sm:inline">Save</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Save to Nostr <kbd className="ml-2 text-xs opacity-60">Ctrl+S</kbd></p>
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-6 bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setLoadModalOpen(true)}
            >
              <FolderOpen size={16} />
              <span className="hidden sm:inline">Load</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Load from Nostr <kbd className="ml-2 text-xs opacity-60">Ctrl+O</kbd></p>
          </TooltipContent>
        </Tooltip>

        {user && (
          <>
            <div className="w-px h-6 bg-border" />
            
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 px-2 text-xs">
                  {autoSaveStatus === "saving" && (
                    <>
                      <Cloud className="h-4 w-4 animate-pulse text-blue-500" />
                      <span className="text-muted-foreground hidden sm:inline">Saving...</span>
                    </>
                  )}
                  {autoSaveStatus === "saved" && (
                    <>
                      <Check className="h-4 w-4 text-green-500" />
                      <span className="text-green-500 hidden sm:inline">Saved</span>
                    </>
                  )}
                  {autoSaveStatus === "error" && (
                    <>
                      <CloudOff className="h-4 w-4 text-red-500" />
                      <span className="text-red-500 hidden sm:inline">Error</span>
                    </>
                  )}
                  {autoSaveStatus === "idle" && lastSaved && (
                    <>
                      <Cloud className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground hidden sm:inline">
                        {getTimeSinceLastSave()}
                      </span>
                    </>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <p className="font-semibold mb-1">Auto-save</p>
                  {lastSaved ? (
                    <p>Last saved: {getTimeSinceLastSave()}</p>
                  ) : (
                    <p>Auto-saves every 30 seconds</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
      ========================================================== */}

      {/* Left Toolbar - Tools */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg">
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
              <p>
                {tool.label} <kbd className="ml-2 text-xs opacity-60">{tool.shortcut}</kbd>
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Bottom Toolbar - Colors & Stroke Width */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
        {/* Stroke Colors */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Stroke</span>
          <div className="flex gap-1">
            {STROKE_COLORS.map((color) => (
              <Tooltip key={color}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
                      strokeColor === color ? "border-primary scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setStrokeColor(color)}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{color}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="w-px h-8 bg-border" />

        {/* Stroke Width */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Width</span>
          <div className="flex gap-1">
            {STROKE_WIDTHS.map((width) => (
              <Tooltip key={width}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "w-8 h-8 rounded flex items-center justify-center border transition-colors",
                      strokeWidth === width
                        ? "border-primary bg-primary/20"
                        : "border-transparent hover:bg-secondary"
                    )}
                    onClick={() => setStrokeWidth(width)}
                  >
                    <div
                      className="rounded-full bg-foreground"
                      style={{
                        width: Math.min(width * 3, 16),
                        height: Math.min(width * 3, 16),
                      }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{width}px</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>

      {/* Right Toolbar - Zoom Controls */}
      <div className="absolute right-4 bottom-4 flex items-center gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-1 shadow-lg">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleZoomOut}>
              <Minus size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>

        <span className="text-sm font-mono w-14 text-center">
          {Math.round(zoom * 100)}%
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleZoomIn}>
              <Plus size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>

        <div className="w-px h-6 bg-border mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleResetView}>
              <RotateCcw size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset View</TooltipContent>
        </Tooltip>
      </div>

      {/* Modales */}
      <SaveCanvasModal open={saveModalOpen} onOpenChange={setSaveModalOpen} />
      <LoadCanvasModal open={loadModalOpen} onOpenChange={setLoadModalOpen} />
    </TooltipProvider>
  );
}