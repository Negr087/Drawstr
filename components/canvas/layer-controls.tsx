"use client";

import { useCanvasStore } from "@/lib/canvas-store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  ArrowUp, 
  ArrowDown, 
  ChevronsUp, 
  ChevronsDown 
} from "lucide-react";

export function LayerControls() {
  const { 
    selectedElementIds, 
    bringToFront, 
    sendToBack,
    bringForward,
    sendBackward 
  } = useCanvasStore();

  const hasSelection = selectedElementIds.size > 0;
  const selectedId = hasSelection ? Array.from(selectedElementIds)[0] : null;

  // No mostrar controles si no hay selección
  if (!hasSelection) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10"
              onClick={() => selectedId && bringToFront(selectedId)}
            >
              <ChevronsUp size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Bring to Front <kbd className="ml-2 text-xs opacity-60">]</kbd></p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10"
              onClick={() => selectedId && bringForward(selectedId)}
            >
              <ArrowUp size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Bring Forward <kbd className="ml-2 text-xs opacity-60">[</kbd></p>
          </TooltipContent>
        </Tooltip>

        <div className="w-full h-px bg-border my-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10"
              onClick={() => selectedId && sendBackward(selectedId)}
            >
              <ArrowDown size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Send Backward</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10"
              onClick={() => selectedId && sendToBack(selectedId)}
            >
              <ChevronsDown size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Send to Back</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}