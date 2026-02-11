"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateId } from "@/lib/types";
import { Pencil, ArrowRight, Link2 } from "lucide-react";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WelcomeModal({ open, onOpenChange }: WelcomeModalProps) {
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateNew = () => {
    const newCanvasId = generateId();
    router.push(`/canvas/${newCanvasId}`);
    onOpenChange(false);
  };

  const handleJoinCanvas = () => {
    if (!joinId.trim()) return;
    
    // Extract canvas ID from URL if user pastes full URL
    let canvasId = joinId.trim();
    if (canvasId.includes("/canvas/")) {
      canvasId = canvasId.split("/canvas/").pop()?.split("?")[0] || canvasId;
    }
    
    router.push(`/canvas/${canvasId}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-10 h-10 text-primary-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
            </div>
          </div>
          <DialogTitle className="text-center text-2xl">
            Welcome to NostrDraw
          </DialogTitle>
          <DialogDescription className="text-center">
            A decentralized collaborative canvas powered by Nostr. Draw together
            with anyone, anywhere, without accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 mt-6">
          {/* Create New Canvas */}
          <Button
            size="lg"
            className="w-full justify-between h-16 text-left px-4"
            onClick={handleCreateNew}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center">
                <Pencil className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Create New Canvas</p>
                <p className="text-xs opacity-80 font-normal">Start a fresh drawing</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5" />
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Join Existing Canvas */}
          <div className="space-y-2">
            <Label htmlFor="join-id" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Join Existing Canvas
            </Label>
            <div className="flex gap-2">
              <Input
                id="join-id"
                placeholder="Paste canvas link or ID..."
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoinCanvas()}
              />
              <Button
                variant="secondary"
                onClick={handleJoinCanvas}
                disabled={!joinId.trim()}
              >
                Join
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            No sign-up required. Your drawings are stored on the Nostr network.
            <br />
            <a
              href="https://nostr.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Learn more about Nostr
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}