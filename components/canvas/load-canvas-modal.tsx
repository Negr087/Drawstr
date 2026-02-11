"use client";

import { useState, useEffect } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useNostr } from "@/lib/nostr-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FolderOpen, 
  Loader2, 
  FileText, 
  AlertCircle,
  Calendar,
  Layers,
  Trash2
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SavedCanvas {
  canvasId: string;
  canvasName: string;
  timestamp: number;
  elementCount: number;
  event?: any;
}

interface LoadCanvasModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoadCanvasModal({ open, onOpenChange }: LoadCanvasModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCanvas, setIsLoadingCanvas] = useState(false);
  const [canvases, setCanvases] = useState<SavedCanvas[]>([]);
  const [error, setError] = useState("");
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);

  const { loadElements, clearCanvas, setCanvasId, setCanvasName } = useCanvasStore();
  const { listUserCanvases, loadCanvasState, user } = useNostr();

  // Cargar lista de canvas cuando se abre el modal
  useEffect(() => {
    if (open && user) {
      fetchCanvases();
    }
  }, [open, user]);

  const fetchCanvases = async () => {
    setIsLoading(true);
    setError("");

    try {
      const userCanvases = await listUserCanvases();
      setCanvases(userCanvases);

      if (userCanvases.length === 0) {
        setError("No saved canvases found. Create and save one first!");
      }
    } catch (err) {
      console.error("Failed to fetch canvases:", err);
      setError("Failed to load your canvases. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadCanvas = async (canvas: SavedCanvas) => {
    setIsLoadingCanvas(true);
    setSelectedCanvasId(canvas.canvasId);
    setError("");

    try {
      const canvasData = await loadCanvasState(canvas.canvasId);

      if (canvasData && canvasData.elements) {
        // Limpiar canvas actual
        clearCanvas();

        // Cargar nuevos elementos
        loadElements(canvasData.elements);

        // Actualizar metadata
        setCanvasId(canvasData.canvasId);
        setCanvasName(canvasData.canvasName);

        // Cerrar modal
        setTimeout(() => {
          onOpenChange(false);
          setSelectedCanvasId(null);
        }, 500);
      } else {
        setError("Canvas data is corrupted or empty.");
      }
    } catch (err) {
      console.error("Failed to load canvas:", err);
      setError("Failed to load canvas. Please try again.");
    } finally {
      setIsLoadingCanvas(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isLoadingCanvas) {
      onOpenChange(newOpen);
      if (!newOpen) {
        setError("");
        setSelectedCanvasId(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Load Canvas from Nostr
          </DialogTitle>
          <DialogDescription>
            Select a canvas to load. Your current canvas will be replaced.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Loading your canvases from relays...
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <Alert variant={canvases.length === 0 ? "default" : "destructive"}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* No User */}
          {!user && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please login with Nostr to load your saved canvases.
              </AlertDescription>
            </Alert>
          )}

          {/* Canvas List */}
          {!isLoading && canvases.length > 0 && (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {canvases.map((canvas) => (
                  <button
                    key={canvas.canvasId}
                    onClick={() => handleLoadCanvas(canvas)}
                    disabled={isLoadingCanvas}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all hover:border-primary hover:bg-primary/5 ${
                      selectedCanvasId === canvas.canvasId
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    } ${
                      isLoadingCanvas ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Canvas Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <h3 className="font-semibold text-sm truncate">
                            {canvas.canvasName || "Untitled Canvas"}
                          </h3>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2">
                          <div className="flex items-center gap-1">
                            <Layers className="h-3 w-3" />
                            <span>{canvas.elementCount} element{canvas.elementCount !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(canvas.timestamp)}</span>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-muted-foreground font-mono truncate">
                          ID: {canvas.canvasId.slice(0, 16)}...
                        </div>
                      </div>

                      {/* Loading Indicator */}
                      {isLoadingCanvas && selectedCanvasId === canvas.canvasId && (
                        <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Empty State */}
          {!isLoading && canvases.length === 0 && user && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="rounded-full bg-muted p-3">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No saved canvases yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create a canvas and save it to Nostr to see it here.
                </p>
              </div>
            </div>
          )}

          {/* Warning about replacing */}
          {canvases.length > 0 && !isLoading && (
            <Alert className="bg-amber-500/10 border-amber-500/50">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-600 dark:text-amber-500 text-xs">
                Loading a canvas will replace your current work. Make sure to save first!
              </AlertDescription>
            </Alert>
          )}

          {/* Refresh Button */}
          {!isLoading && canvases.length > 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={fetchCanvases}
              disabled={isLoadingCanvas}
            >
              Refresh List
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}