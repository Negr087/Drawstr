"use client";

import { useState, useMemo } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useNostr } from "@/lib/nostr-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Share2,
  Users,
  LogOut,
  Menu,
  Trash2,
  Copy,
  Check,
  Zap,
} from "lucide-react";

interface HeaderProps {
  onExport: () => void;
  onShare: () => void;
  onClearCanvas: () => void;
  onPostToNostr: () => void;
}

export function Header({ onExport, onShare, onClearCanvas, onPostToNostr }: HeaderProps) {
  const [copied, setCopied] = useState(false);
  const { canvasName, setCanvasName, collaboratorCursors, canvasId } = useCanvasStore();
  const { user, logout } = useNostr();

  // Memoize active collaborators to prevent re-renders
  const activeCollaborators = useMemo(() => {
    return Array.from(collaboratorCursors.values()).filter(
      (cursor) => Date.now() - cursor.timestamp < 10000
    );
  }, [collaboratorCursors]);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/canvas/${canvasId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-4 bg-card/80 backdrop-blur-sm border-b border-border z-40">
      {/* Left - Logo & Canvas Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-primary-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </div>
          <span className="font-semibold text-lg hidden sm:inline">NostrDraw</span>
        </div>

        <div className="w-px h-6 bg-border hidden sm:block" />

        <input
          type="text"
          value={canvasName}
          onChange={(e) => setCanvasName(e.target.value)}
          className="bg-transparent border-none text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary rounded px-2 py-1 max-w-[200px]"
          placeholder="Untitled Canvas"
        />
      </div>

      {/* Center - Connected Users */}
      <div className="hidden md:flex items-center gap-2">
        {user && (
          <div className="flex items-center gap-2">
            <div className="flex items-center -space-x-2">
              {/* Current user */}
              <Avatar className="w-7 h-7 border-2 border-card ring-2 ring-primary">
                {user.picture && <AvatarImage src={user.picture} alt={user.name || "You"} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : user.npub.slice(5, 7).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              {/* Collaborators */}
              {activeCollaborators.slice(0, 5).map((cursor) => (
                <Avatar
                  key={cursor.pubkey}
                  className="w-7 h-7 border-2 border-card"
                  style={{ backgroundColor: cursor.color }}
                >
                  <AvatarFallback
                    className="text-xs"
                    style={{ backgroundColor: cursor.color, color: "#000" }}
                  >
                    {cursor.pubkey.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}

              {activeCollaborators.length > 5 && (
                <Badge variant="secondary" className="ml-2">
                  +{activeCollaborators.length - 5}
                </Badge>
              )}
            </div>

            {activeCollaborators.length > 0 && (
              <Badge variant="outline">
                <Users size={12} className="mr-1" />
                {activeCollaborators.length + 1} online
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-2">
        {user && (
          <Button
            variant="default"
            size="sm"
            className="hidden sm:flex gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            onClick={onPostToNostr}
          >
            <Zap size={14} />
            Post to Nostr
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex gap-2 bg-transparent"
          onClick={handleCopyLink}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy Link"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex gap-2 bg-transparent"
          onClick={onShare}
        >
          <Share2 size={14} />
          Share
        </Button>

        <Button
          variant="default"
          size="sm"
          className="hidden sm:flex gap-2"
          onClick={onExport}
        >
          <Download size={14} />
          Export
        </Button>

        {/* Mobile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="sm:hidden">
              <Menu size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[100]">
            <DropdownMenuItem onClick={handleCopyLink}>
              <Copy size={14} className="mr-2" />
              Copy Link
            </DropdownMenuItem>
            {user && (
              <DropdownMenuItem onClick={onPostToNostr}>
                <Zap size={14} className="mr-2" />
                Post to Nostr
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onShare}>
              <Share2 size={14} className="mr-2" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <Download size={14} className="mr-2" />
              Export
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClearCanvas} className="text-destructive">
              <Trash2 size={14} className="mr-2" />
              Clear Canvas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
{user ? (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary">
        <Avatar className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity">
          {user.picture && <AvatarImage src={user.picture} alt={user.name || "You"} />}
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {user.name ? user.name.slice(0, 2).toUpperCase() : user.npub.slice(5, 7).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <div className="px-2 py-1.5">
        <p className="text-sm font-medium">{user.name || "Nostr User"}</p>
        <p className="text-xs text-muted-foreground truncate">
          {user.npub.slice(0, 20)}...
        </p>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => {
        console.log('Logout clicked!');
        logout();
      }}>
        <LogOut size={14} className="mr-2" />
        Disconnect
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
) : (
  <Badge variant="secondary" className="text-xs">
    Not connected
  </Badge>
)}
      </div>
    </header>
  );
}