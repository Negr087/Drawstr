"use client";

export interface CanvasHistoryEntry {
  id: string;
  name: string;
  lastAccessed: number; // ms timestamp
}

const MAX_HISTORY = 30;
const KEY = (pubkey: string) => `canvasHistory:${pubkey}`;

export function getCanvasHistory(userPubkey: string): CanvasHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY(userPubkey));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToCanvasHistory(
  canvasId: string,
  name: string,
  userPubkey: string
): void {
  if (typeof window === "undefined") return;
  const history = getCanvasHistory(userPubkey);
  const idx = history.findIndex((e) => e.id === canvasId);
  const entry: CanvasHistoryEntry = { id: canvasId, name, lastAccessed: Date.now() };
  if (idx !== -1) {
    history[idx] = entry;
  } else {
    history.unshift(entry);
  }
  history.sort((a, b) => b.lastAccessed - a.lastAccessed);
  localStorage.setItem(KEY(userPubkey), JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export function removeFromCanvasHistory(canvasId: string, userPubkey: string): void {
  if (typeof window === "undefined") return;
  const history = getCanvasHistory(userPubkey).filter((e) => e.id !== canvasId);
  localStorage.setItem(KEY(userPubkey), JSON.stringify(history));
}
