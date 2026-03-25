"use client";

import { useEffect } from "react";
import { addToCanvasHistory } from "@/lib/canvas-history";

export function useLastCanvas(
  canvasId: string,
  canvasName: string,
  userPubkey: string | undefined
) {
  useEffect(() => {
    if (userPubkey && canvasId) {
      localStorage.setItem(`lastCanvas:${userPubkey}`, canvasId);
      addToCanvasHistory(canvasId, canvasName || canvasId, userPubkey);
    }
  }, [canvasId, canvasName, userPubkey]);
}

export function getLastCanvas(userPubkey: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`lastCanvas:${userPubkey}`);
}
