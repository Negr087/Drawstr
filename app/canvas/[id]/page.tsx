"use client";

import { useEffect, useState, useCallback } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { NOSTR_KIND_CANVAS_ACTION } from "@/lib/types";
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
    
    const explicitViewOnly = params.get("view") === "true";
    const author = params.get("author");
    
    if (author) {
      setCanvasAuthor({ pubkey: author });
      
      if (pool) {
        const profileRelays = [
          ...relays,
          "wss://purplepag.es",
          "wss://relay.nostr.band",
          "wss://relay.damus.io",
          "wss://nos.lol",
        ].filter((r, i, arr) => arr.indexOf(r) === i);

        (async () => {
          try {
            const events = await pool.querySync(profileRelays, {
              kinds: [0],
              authors: [author],
              limit: 1,
            } as any);
            if (events.length > 0) {
              const metadata = JSON.parse(events[0].content);
              setCanvasAuthor({
                pubkey: author,
                name: metadata.name || metadata.display_name,
                picture: metadata.picture,
              });
            }
          } catch (err) {
            console.error("Failed to fetch author profile:", err);
          }
        })();
      }
    }
    
    setIsViewOnly(explicitViewOnly);
  }, [pool, relays]);

  // Update isViewOnly when user loads
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const params = new URLSearchParams(window.location.search);
    const explicitViewOnly = params.get("view") === "true";
    
    if (explicitViewOnly) {
      setIsViewOnly(true);
    } else if (canvasAuthor?.pubkey && user && canvasAuthor.pubkey !== user.pubkey) {
      setIsViewOnly(false);
    } else if (canvasAuthor?.pubkey && !user) {
      setIsViewOnly(true);
    } else {
      setIsViewOnly(false);
    }
  }, [canvasAuthor?.pubkey, user]);

  useEffect(() => {
    if (isViewOnly) {
      useCanvasStore.getState().setActiveTool("hand");
    }
  }, [isViewOnly]);

  // Initialize canvas
  useEffect(() => {
    setCanvasId(canvasId);
    setCanvasName(`Canvas ${canvasId.slice(0, 8)}`);
  }, [canvasId, setCanvasId, setCanvasName]);

  // Auto-load canvas state
  useEffect(() => {
    if (!canvasId) return;
    
    const authorToLoad = canvasAuthor?.pubkey ?? user?.pubkey;
    if (!authorToLoad) return;

    const autoLoad = async () => {
      try {
        console.log("Auto-loading canvas from author:", authorToLoad);
        const data = await loadCanvasState(canvasId, authorToLoad);
        
        if (data && data.elements) {
          loadElements(data.elements);
          if (data.canvasName) setCanvasName(data.canvasName);
          console.log(`Loaded base canvas with ${data.elements.length} elements`);
          
          // Load events after canvas timestamp
          if (pool && data.timestamp) {
            const sinceTimestamp = Math.floor(data.timestamp / 1000);
            console.log("🔍 Searching for events - kind:", NOSTR_KIND_CANVAS_ACTION, "canvas:", canvasId, "since:", sinceTimestamp);
            
            // Query events using v1 syntax
            const events: any[] = await new Promise((resolve) => {
  const collected: any[] = [];
  const sub = pool.subscribeMany(
    relays,
    [{
      kinds: [NOSTR_KIND_CANVAS_ACTION],
      "#canvas": [canvasId],
      since: sinceTimestamp,
    }] as any,
    {
      onevent(event: any) {
        collected.push(event);
      },
      oneose() {
        sub.close();
        resolve(collected);
      },
    }
  );

  setTimeout(() => {
    sub.close();
    resolve(collected);
  }, 5000);
});
            
            console.log(`Found ${events.length} events since last save`);
            if (events.length > 0) {
              console.log("First event kind:", events[0].kind, "content preview:", events[0].content.slice(0, 100));
            }
            
            // Apply events in chronological order
            events.sort((a: any, b: any) => a.created_at - b.created_at).forEach((event: any) => {
              try {
                const eventData = JSON.parse(event.content);
                const element = eventData.element;
                
                switch (eventData.action) {
                  case "add":
                    useCanvasStore.getState().addElement(element);
                    break;
                  case "update":
                    useCanvasStore.getState().updateElement(element.id, element);
                    break;
                  case "delete":
                    useCanvasStore.getState().deleteElement(element.id);
                    break;
                }
              } catch (err) {
                console.error("Failed to apply event:", err);
              }
            });
          }
        } else {
          console.log("No canvas data found");
        }
      } catch (error) {
        console.error("Failed to auto-load canvas:", error);
      }
    };

    autoLoad();
  }, [canvasId, canvasAuthor?.pubkey, user?.pubkey, loadCanvasState, loadElements, setCanvasName, pool, relays]);

  // Subscribe to canvas events (works for both authenticated and unauthenticated users)
  useEffect(() => {
    if (!isConnected || isSubscribed) return;

    console.log("Subscribing to canvas:", canvasId);
    setIsSubscribed(true);
    const unsubscribe = subscribeToCanvas(canvasId);

    return () => {
      console.log("Unsubscribing from canvas:", canvasId);
      unsubscribe();
    };
  }, [isConnected, canvasId, isSubscribed, subscribeToCanvas]);

  // Re-subscribe when auth state changes (subscribeToCanvas ref changes with user)
  useEffect(() => {
    setIsSubscribed(false);
  }, [subscribeToCanvas]);

  const handleClearCanvas = useCallback(() => {
    clearCanvas();
    setShowClearDialog(false);
  }, [clearCanvas]);

  const showZapButton = canvasAuthor && canvasAuthor.pubkey !== user?.pubkey;

  return (
    <div className="h-screen w-screen overflow-hidden bg-background relative">
      {/* Header */}
      <Header
        onExport={() => setShowExportModal(true)}
        onShare={() => setShowShareModal(true)}
        onClearCanvas={() => setShowClearDialog(true)}
        onPostToNostr={() => setShowPostModal(true)}
        onLogin={() => setShowLoginModal(true)}
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

      {/* Floating Zap Button */}
      {showZapButton && (
        <div className="absolute bottom-8 right-4 flex flex-col items-center gap-1 z-50">
          <button
            onClick={() => setShowZapModal(true)}
            className="group relative w-14 h-14 rounded-full bg-yellow-500 hover:bg-yellow-400 shadow-lg shadow-yellow-500/30 hover:shadow-yellow-400/50 transition-all duration-200 hover:scale-110 flex items-center justify-center"
          >
            <Zap className="w-6 h-6 text-black fill-black" />
            <span className="absolute inset-0 rounded-full bg-yellow-400 animate-ping opacity-20" />
          </button>
          <span className="text-[10px] text-yellow-400/80 font-medium">Zap ⚡</span>
        </div>
      )}

      {/* View-Only Banner */}
      {isViewOnly && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-orange-500/90 backdrop-blur-sm border border-orange-400 rounded-lg px-4 py-2 shadow-lg flex items-center gap-3">
          <p className="text-sm text-white font-medium">
            View-only mode
          </p>
          {!user && showZapButton && (
            <button
              onClick={() => setShowLoginModal(true)}
              className="text-xs text-white underline underline-offset-2 hover:text-orange-100 transition-colors whitespace-nowrap"
            >
              Connect Nostr to Zap
            </button>
          )}
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