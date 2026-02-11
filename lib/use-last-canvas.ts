"use client";

import { useEffect } from "react";

export function useLastCanvas(canvasId: string, userPubkey: string | undefined) {
  // Guardar último canvas cuando cambia
  useEffect(() => {
    if (userPubkey && canvasId) {
      localStorage.setItem(`lastCanvas:${userPubkey}`, canvasId);
    }
  }, [canvasId, userPubkey]);
}

export function getLastCanvas(userPubkey: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`lastCanvas:${userPubkey}`);
}