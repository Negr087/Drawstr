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
import { ZapModal } from "@/components/canvas/zap-modal";
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
import { LogIn, Wifi, WifiOff, Zap } from "lucide-react";

interface PageProps {
  params: { id: string };
}

interface AuthorInfo {
  pubkey: string;
  name?: string;
  picture?: string;
}

export default function CanvasPage({ params }: PageProps) {
  const { id: canvasId } = params;
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showZapModal, setShowZapModal] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [canvasAuthor, setCanvasAuthor] = useState<AuthorInfo | null>(null);

  const { setCanvasId, setCanvasName, clearCanvas, elements, loadElements, canvasName } = useCanvasStore();
  const { user, subscribeToCanvas, isConnected, loadCanvasState, pool, relays } = useNostr();

  useLastCanvas(canvasId, user?.pubkey);

  // Check URL params and fetch author info
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    setIsViewOnly(params.get("view") === "true");

    const authorPubkey = params.get("author");
    if (authorPubkey) {
      setCanvasAuthor({ pubkey: authorPubkey });

      // Fetch author metadata
      if (pool) {
        pool.querySync(relays, {
          kinds: [0],
          authors: [authorPubkey],
          limit: 1,
        }).then((events) => {
          if (events.length > 0) {
            const metadata = JSON.parse(events[0].content);
            setCanvasAuthor({
              pubkey: authorPubkey,
              name: metadata.name || metadata.display_name,
              picture: metadata.picture,
            });
          }
        }).catch(console.error);
      }
    }
  }, [pool, relays]);

  // Initialize canvas
  useEffect(() => {
    setCanvasId(canvasId);
    setCanvasName(`Canvas ${canvasId.slice(0, 8)}`);
  }, [canvasId, setCanvasId, setCanvasName]);

  // Auto-load canvas state
  useEffect(() => {
    if (!canvasId) return;
    if (!user && !canvasAuthor) return;

    const autoLoad = async () => {
      try {
        const data = await loadCanvasState(canvasId, canvasAuthor?.pubkey);
        if (data && data.elements && data.elements.length > 0) {
          loadElements(data.elements);
          if (data.canvasName) setCanvasName(data.canvasName);
          console.log(`Auto-loaded canvas: ${data.canvasName}`);
        }
      } catch (error) {
        console.error("Failed to auto-load canvas:", error);
      }
    };

    autoLoad();
  }, [user, canvasId, canvasAuthor, loadCanvasState, loadElements, setCanvasName]);

  // Subscribe to canvas events
  useEffect(() => {
    if (!user || !isConnected || isSubscribed) return;
    setIsSubscribed(true);
    const unsubscribe = subscribeToCanvas(canvasId);
    return () => { unsubscribe(); };
  }, [user, isConnected, canvasId, isSubscribed, subscribeToCanvas]);

  useEffect(() => {
    if (!user) setIsSubscribed(false);
  }, [user]);

  const handleClearCanvas = useCallback(() => {
    clearCanvas();
    setShowClearDialog(false);
  }, [clearCanvas]);

  // Show floating zap button when viewing someone else's canvas
  const showZapButton = canvasAuthor && canvasAuthor.pubkey !== user?.pubkey;

  return (
    <div className="h-screen w-screen overflow-hidden bg-background relative">
      {/* Header */}
      <Header
        onExport={() => setShowExportModal(true)}
        onShare={() => setShowShareModal(true)}
        onClearCanvas={() => setShowClearDialog(true)}
        onPostToNostr={() => setShowPostModal(true)}
        canvasAuthor={canvasAuthor?.pubkey}
        canvasAuthorName={canvasAuthor?.name}
        canvasAuthorPicture={canvasAuthor?.picture}
      />

      {/* Canvas */}
      <div className="absolute inset-0 pt-14">
        <InfiniteCanvas canvasId={canvasId} />
      </div>

      {/* Toolbar */}
      {!isViewOnly && <Toolbar />}

      {/* Layer Controls */}
      {!isViewOnly && <LayerControls />}

      {/* Floating Zap Button — visible when viewing someone else's canvas */}
      {showZapButton && (
        <div className="absolute bottom-8 right-4 flex flex-col items-center gap-1 z-50">
          <button
            onClick={() => setShowZapModal(true)}
            className="group relative w-14 h-14 rounded-full bg-yellow-500 hover:bg-yellow-400 shadow-lg shadow-yellow-500/30 hover:shadow-yellow-400/50 transition-all duration-200 hover:scale-110 flex items-center justify-center"
          >
            <Zap className="w-6 h-6 text-black fill-black" />
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full bg-yellow-400 animate-ping opacity-20" />
          </button>
          <span className="text-[10px] text-yellow-400/80 font-medium">Zap ⚡</span>
        </div>
      )}

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

      {/* Login prompt */}
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

      {/* Floating Zap Modal */}
      {showZapButton && (
        <ZapModal
          open={showZapModal}
          onOpenChange={setShowZapModal}
          recipientPubkey={canvasAuthor.pubkey}
          recipientName={canvasAuthor.name}
          recipientPicture={canvasAuthor.picture}
          canvasName={canvasName}
        />
      )}

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