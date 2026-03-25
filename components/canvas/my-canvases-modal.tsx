"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Clock } from "lucide-react";
import {
  getCanvasHistory,
  removeFromCanvasHistory,
  type CanvasHistoryEntry,
} from "@/lib/canvas-history";
import { generateId } from "@/lib/types";

interface MyCanvasesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userPubkey: string;
  currentCanvasId?: string;
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function MyCanvasesModal({
  open,
  onOpenChange,
  userPubkey,
  currentCanvasId,
}: MyCanvasesModalProps) {
  const router = useRouter();
  const [history, setHistory] = useState<CanvasHistoryEntry[]>([]);

  const refresh = useCallback(() => {
    setHistory(getCanvasHistory(userPubkey));
  }, [userPubkey]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleOpen = (canvasId: string) => {
    onOpenChange(false);
    router.push(`/canvas/${canvasId}`);
  };

  const handleRemove = (canvasId: string) => {
    removeFromCanvasHistory(canvasId, userPubkey);
    refresh();
  };

  const handleNew = () => {
    onOpenChange(false);
    router.push(`/canvas/${generateId()}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            My Canvases
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No canvases yet. Create one to get started!
            </p>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {entry.name}
                    </span>
                    {entry.id === currentCanvasId && (
                      <Badge variant="secondary" className="text-[10px] py-0 shrink-0">
                        current
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(entry.lastAccessed)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">
                      {entry.id.slice(0, 8)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpen(entry.id)}
                    disabled={entry.id === currentCanvasId}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(entry.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-3 border-t border-border">
          <Button className="w-full gap-2" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            New Canvas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
