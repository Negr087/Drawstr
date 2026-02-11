"use client";

import { useEffect, useState, useCallback } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useNostr } from "@/lib/nostr-context";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { Toolbar } from "@/components/canvas/toolbar";
import { Header } from "@/components/canvas/header";
import { LoginModal } from "@/components/auth/login-modal";
import { ShareModal } from "@/components/canvas/share-modal";
import { ExportModal } from "@/components/canvas/export-modal";
import { PostToNostrModal } from "@/components/canvas/post-to-nostr-modal";
import { Button } from "@/components/ui/button";
import { LayerControls } from "@/components/canvas/layer-controls";
import { useLastCanvas } from "@/lib/use-last-canvas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogIn, Wifi, WifiOff } from "lucide-react";

interface PageProps {
  params: { id: string };
}

export default function CanvasPage({ params }: PageProps) {
  const { id: canvasId } = params;
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);

  const { setCanvasId, setCanvasName, clearCanvas, elements, loadElements } = useCanvasStore();
  const { user, subscribeToCanvas, isConnected, loadCanvasState } = useNostr();

  useLastCanvas(canvasId, user?.pubkey);

  // Check if view-only mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsViewOnly(params.get("view") === "true");
    }
  }, []);

  // Initialize canvas
  useEffect(() => {
    setCanvasId(canvasId);
    setCanvasName(`Canvas ${canvasId.slice(0, 8)}`);
  }, [canvasId, setCanvasId, setCanvasName]);

  // Auto-load canvas state when user logs in
  useEffect(() => {
    if (!user || !canvasId) return;

    const autoLoad = async () => {
      try {
        const data = await loadCanvasState(canvasId);
        
        if (data && data.elements && data.elements.length > 0) {
          // Solo cargar si hay elementos guardados
          loadElements(data.elements);
          
          // Actualizar el nombre del canvas si existe
          if (data.canvasName) {
            setCanvasName(data.canvasName);
          }
          
          console.log(`Auto-loaded canvas: ${data.canvasName} with ${data.elements.length} elements`);
        }
      } catch (error) {
        console.error("Failed to auto-load canvas:", error);
        // Silencioso - no molestar al usuario si falla
      }
    };

    autoLoad();
  }, [user, canvasId, loadCanvasState, loadElements, setCanvasName]);

  // Subscribe to canvas events when user is logged in
  useEffect(() => {
    if (!user || !isConnected || isSubscribed) return;
    
    setIsSubscribed(true);
    const unsubscribe = subscribeToCanvas(canvasId);
    
    return () => {
      unsubscribe();
    };
  }, [user, isConnected, canvasId, isSubscribed, subscribeToCanvas]);
  
  // Reset subscription state when user logs out
  useEffect(() => {
    if (!user) {
      setIsSubscribed(false);
    }
  }, [user]);

  // Clear canvas with confirmation
  const handleClearCanvas = useCallback(() => {
    clearCanvas();
    setShowClearDialog(false);
  }, [clearCanvas]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background relative">
      {/* Header */}
      <Header
        onExport={() => setShowExportModal(true)}
        onShare={() => setShowShareModal(true)}
        onClearCanvas={() => setShowClearDialog(true)}
        onPostToNostr={() => setShowPostModal(true)}
      />

      {/* Canvas */}
      <div className="absolute inset-0 pt-14">
        <InfiniteCanvas canvasId={canvasId} />
      </div>

      {/* Toolbar */}
      {!isViewOnly && <Toolbar />}

      {/* Layer Controls */}
      {!isViewOnly && <LayerControls />}

      {/* View-Only Banner */}
      {isViewOnly && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-orange-500/90 backdrop-blur-sm border border-orange-400 rounded-lg px-4 py-2 shadow-lg">
          <p className="text-sm text-white font-medium">
            👁️ View-only mode • You cannot edit this canvas
          </p>
        </div>
      )}

      {/* Connection Status */}
      <div className="absolute top-13 left-4 flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs">
        {isConnected ? (
          <>
            <Wifi className="h-3 w-3 text-green-500" />
            <span className="text-muted-foreground">Connected to Nostr</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3 text-red-500" />
            <span className="text-muted-foreground">Disconnected</span>
          </>
        )}
      </div>

      {/* Login prompt for non-authenticated users */}
      {!user && !isViewOnly && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-lg max-w-md text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Connect with your Nostr identity to save and sync your drawings permanently
          </p>
          <Button onClick={() => setShowLoginModal(true)} className="gap-2">
            <LogIn size={16} />
            Connect Nostr
          </Button>
        </div>
      )}

      {/* Modals */}
      <LoginModal open={showLoginModal} onOpenChange={setShowLoginModal} />
      <ShareModal open={showShareModal} onOpenChange={setShowShareModal} />
      <ExportModal open={showExportModal} onOpenChange={setShowExportModal} />
      <PostToNostrModal open={showPostModal} onOpenChange={setShowPostModal} />

      {/* Clear Canvas Confirmation */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {elements.size} elements from the canvas. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearCanvas}>
              Clear Canvas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}