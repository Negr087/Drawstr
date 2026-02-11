"use client";

import { create } from "zustand";
import type {
  Tool,
  Point,
  CanvasElement,
  CursorPosition,
  NostrUser,
} from "./types";
import { generateId } from "./types";

interface CanvasStore {
  // Canvas State
  elements: Map<string, CanvasElement>;
  selectedElementIds: Set<string>;
  viewportOffset: Point;
  zoom: number;
  canvasId: string;
  canvasName: string;
  ephemeralElements: Map<string, CanvasElement & { expiresAt: number }>;

  // Tool State
  activeTool: Tool;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;

  // Drawing State
  isDrawing: boolean;
  currentElement: CanvasElement | null;

  // Clipboard State
  clipboard: CanvasElement[] | null;

  // Last Text Config
  lastTextConfig: {
    fontSize: number;
    fontFamily: string;
    fontWeight: "normal" | "bold";
    fontStyle: "normal" | "italic";
    textDecoration: "none" | "underline";
    strokeColor: string;
  };

  // History State
  history: Map<string, CanvasElement>[];
  historyIndex: number;

  // User State
  currentUser: NostrUser | null;
  collaboratorCursors: Map<string, CursorPosition>;

  // Actions
  setActiveTool: (tool: Tool) => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setZoom: (zoom: number) => void;
  setViewportOffset: (offset: Point) => void;
  setCanvasId: (id: string) => void;
  setCanvasName: (name: string) => void;

  // Element Actions
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
  deleteSelectedElements: () => void;
  setSelectedElementIds: (ids: Set<string>) => void;
  clearSelection: () => void;

  // Layer/Z-Index Actions
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;

  // Clipboard Actions
  copySelectedElements: () => void;
  cutSelectedElements: () => void;
  pasteElements: () => void;

  // Text Config Action
  updateLastTextConfig: (config: Partial<CanvasStore['lastTextConfig']>) => void;

  // History Actions
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;

  // Drawing Actions
  setIsDrawing: (isDrawing: boolean) => void;
  setCurrentElement: (element: CanvasElement | null) => void;

  // User Actions
  setCurrentUser: (user: NostrUser | null) => void;
  updateCursor: (cursor: CursorPosition) => void;
  removeCursor: (pubkey: string) => void;

  // Ephemeral Actions
  addEphemeralElement: (element: CanvasElement, duration?: number) => void;
  removeExpiredEphemeralElements: () => void;

  // Bulk Actions
  loadElements: (elements: CanvasElement[]) => void;
  clearCanvas: () => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // Initial Canvas State
  elements: new Map(),
  selectedElementIds: new Set(),
  viewportOffset: { x: 0, y: 0 },
  zoom: 1,
  canvasId: "",
  canvasName: "Untitled Canvas",
  ephemeralElements: new Map(),

  // Initial Tool State
  activeTool: "select",
  strokeColor: "#ffffff",
  fillColor: "transparent",
  strokeWidth: 2,

  // Initial Drawing State
  isDrawing: false,
  currentElement: null,

  // Initial Clipboard State
  clipboard: null,

  // Initial Last Text Config
  lastTextConfig: {
    fontSize: 20,
    fontFamily: "sans-serif",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    strokeColor: "#ffffff",
  },

  // Initial History State
  history: [],
  historyIndex: -1,

  // Initial User State
  currentUser: null,
  collaboratorCursors: new Map(),

  // Tool Actions
  setActiveTool: (tool) => set({ activeTool: tool }),
  setStrokeColor: (color) => set({ strokeColor: color }),
  setFillColor: (color) => set({ fillColor: color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setViewportOffset: (offset) => set({ viewportOffset: offset }),
  setCanvasId: (id) => set({ canvasId: id }),
  setCanvasName: (name) => set({ canvasName: name }),

  // Element Actions
  addElement: (element) =>
    set((state) => {
      const newElements = new Map(state.elements);
      newElements.set(element.id, element);
      return { elements: newElements };
    }),

  updateElement: (id, updates) =>
    set((state) => {
      const element = state.elements.get(id);
      if (!element) return state;
      const newElements = new Map(state.elements);
      newElements.set(id, {
        ...element,
        ...updates,
        updatedAt: Date.now(),
      } as CanvasElement);
      return { elements: newElements };
    }),

  deleteElement: (id) =>
    set((state) => {
      const newElements = new Map(state.elements);
      const element = newElements.get(id);
      if (element) {
        newElements.set(id, { ...element, isDeleted: true } as CanvasElement);
      }
      return { elements: newElements };
    }),

  deleteSelectedElements: () =>
    set((state) => {
      const newElements = new Map(state.elements);
      for (const id of state.selectedElementIds) {
        const element = newElements.get(id);
        if (element) {
          newElements.set(id, { ...element, isDeleted: true } as CanvasElement);
        }
      }
      return { elements: newElements, selectedElementIds: new Set() };
    }),

  setSelectedElementIds: (ids) => set({ selectedElementIds: ids }),
  clearSelection: () => set({ selectedElementIds: new Set() }),

  // Layer/Z-Index Actions
  bringToFront: (id) =>
    set((state) => {
      const element = state.elements.get(id);
      if (!element) return state;

      const maxZIndex = Math.max(
        0,
        ...Array.from(state.elements.values())
          .filter(el => !el.isDeleted)
          .map(el => el.zIndex || 0)
      );

      const newElements = new Map(state.elements);
      newElements.set(id, {
        ...element,
        zIndex: maxZIndex + 1,
        updatedAt: Date.now(),
      } as CanvasElement);

      return { elements: newElements };
    }),

  sendToBack: (id) =>
    set((state) => {
      const element = state.elements.get(id);
      if (!element) return state;

      const minZIndex = Math.min(
        0,
        ...Array.from(state.elements.values())
          .filter(el => !el.isDeleted)
          .map(el => el.zIndex || 0)
      );

      const newElements = new Map(state.elements);
      newElements.set(id, {
        ...element,
        zIndex: minZIndex - 1,
        updatedAt: Date.now(),
      } as CanvasElement);

      return { elements: newElements };
    }),

  bringForward: (id) =>
    set((state) => {
      const element = state.elements.get(id);
      if (!element) return state;

      const currentZIndex = element.zIndex || 0;

      const higherElements = Array.from(state.elements.values())
        .filter(el => !el.isDeleted && (el.zIndex || 0) > currentZIndex)
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

      let newZIndex: number;
      if (higherElements.length > 0) {
        const nextElement = higherElements[0];
        newZIndex = (nextElement.zIndex || 0);
        
        const newElements = new Map(state.elements);
        newElements.set(nextElement.id, {
          ...nextElement,
          zIndex: currentZIndex,
          updatedAt: Date.now(),
        } as CanvasElement);
        newElements.set(id, {
          ...element,
          zIndex: newZIndex,
          updatedAt: Date.now(),
        } as CanvasElement);
        return { elements: newElements };
      } else {
        return state;
      }
    }),

  sendBackward: (id) =>
    set((state) => {
      const element = state.elements.get(id);
      if (!element) return state;

      const currentZIndex = element.zIndex || 0;

      const lowerElements = Array.from(state.elements.values())
        .filter(el => !el.isDeleted && (el.zIndex || 0) < currentZIndex)
        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

      let newZIndex: number;
      if (lowerElements.length > 0) {
        const prevElement = lowerElements[0];
        newZIndex = (prevElement.zIndex || 0);
        
        const newElements = new Map(state.elements);
        newElements.set(prevElement.id, {
          ...prevElement,
          zIndex: currentZIndex,
          updatedAt: Date.now(),
        } as CanvasElement);
        newElements.set(id, {
          ...element,
          zIndex: newZIndex,
          updatedAt: Date.now(),
        } as CanvasElement);
        return { elements: newElements };
      } else {
        return state;
      }
    }),

  // Clipboard Actions
  copySelectedElements: () =>
    set((state) => {
      const selected = Array.from(state.selectedElementIds)
        .map(id => state.elements.get(id))
        .filter(Boolean) as CanvasElement[];
      
      console.log(`Copied ${selected.length} elements`);
      return { clipboard: selected };
    }),

  cutSelectedElements: () =>
    set((state) => {
      const selected = Array.from(state.selectedElementIds)
        .map(id => state.elements.get(id))
        .filter(Boolean) as CanvasElement[];
      
      const newElements = new Map(state.elements);
      selected.forEach(el => {
        newElements.set(el.id, { ...el, isDeleted: true } as CanvasElement);
      });
      
      console.log(`Cut ${selected.length} elements`);
      return { 
        clipboard: selected, 
        elements: newElements,
        selectedElementIds: new Set()
      };
    }),

  pasteElements: () =>
    set((state) => {
      if (!state.clipboard || state.clipboard.length === 0) {
        console.log("Nothing to paste");
        return state;
      }
      
      const newElements = new Map(state.elements);
      const newIds = new Set<string>();
      let now = Date.now();
      
      state.clipboard.forEach(el => {
        const newElement = {
          ...el,
          id: generateId(),
          x: el.x + 20,
          y: el.y + 20,
          zIndex: now++,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        } as CanvasElement;
        
        newElements.set(newElement.id, newElement);
        newIds.add(newElement.id);
      });
      
      console.log(`Pasted ${newIds.size} elements`);
      return {
        elements: newElements,
        selectedElementIds: newIds,
      };
    }),

    // Text Config Action
  updateLastTextConfig: (config) =>
    set((state) => ({
      lastTextConfig: { ...state.lastTextConfig, ...config },
    })),

  // History Actions
  saveHistory: () =>
    set((state) => {
      const snapshot = new Map(state.elements);
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(snapshot);
      
      // Limitar a 50 estados
      if (newHistory.length > 50) {
        newHistory.shift();
      }
      
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    }),

  undo: () =>
    set((state) => {
      if (state.historyIndex <= 0) {
        console.log("Nothing to undo");
        return state;
      }
      
      const prevIndex = state.historyIndex - 1;
      const prevState = state.history[prevIndex];
      
      console.log(`Undo to state ${prevIndex}`);
      return {
        elements: new Map(prevState),
        historyIndex: prevIndex,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) {
        console.log("Nothing to redo");
        return state;
      }
      
      const nextIndex = state.historyIndex + 1;
      const nextState = state.history[nextIndex];
      
      console.log(`Redo to state ${nextIndex}`);
      return {
        elements: new Map(nextState),
        historyIndex: nextIndex,
      };
    }),

  // Drawing Actions
  setIsDrawing: (isDrawing) => set({ isDrawing }),
  setCurrentElement: (element) => set({ currentElement: element }),

  // User Actions
  setCurrentUser: (user) => set({ currentUser: user }),

  updateCursor: (cursor) =>
    set((state) => {
      const newCursors = new Map(state.collaboratorCursors);
      newCursors.set(cursor.pubkey, cursor);
      return { collaboratorCursors: newCursors };
    }),

  removeCursor: (pubkey) =>
    set((state) => {
      const newCursors = new Map(state.collaboratorCursors);
      newCursors.delete(pubkey);
      return { collaboratorCursors: newCursors };
    }),

  // Ephemeral Actions
  addEphemeralElement: (element, duration = 2000) =>
    set((state) => {
      const ephemeralElement = {
        ...element,
        expiresAt: Date.now() + duration,
      };
      const newEphemeralElements = new Map(state.ephemeralElements);
      newEphemeralElements.set(element.id, ephemeralElement);
      return { ephemeralElements: newEphemeralElements };
    }),

  removeExpiredEphemeralElements: () =>
    set((state) => {
      const now = Date.now();
      const newEphemeralElements = new Map(state.ephemeralElements);
      
      for (const [id, element] of newEphemeralElements.entries()) {
        if (element.expiresAt <= now) {
          newEphemeralElements.delete(id);
        }
      }
      
      return { ephemeralElements: newEphemeralElements };
    }),

  // Bulk Actions
  loadElements: (elements) =>
    set(() => {
      const newElements = new Map<string, CanvasElement>();
      for (const element of elements) {
        newElements.set(element.id, element);
      }
      return { elements: newElements };
    }),

  clearCanvas: () =>
    set({
      elements: new Map(),
      selectedElementIds: new Set(),
      currentElement: null,
    }),
}));

// Selectors for performance
export const useElements = () =>
  useCanvasStore((state) => state.elements);
export const useActiveTool = () =>
  useCanvasStore((state) => state.activeTool);
export const useZoom = () =>
  useCanvasStore((state) => state.zoom);
export const useViewportOffset = () =>
  useCanvasStore((state) => state.viewportOffset);
export const useCurrentUser = () =>
  useCanvasStore((state) => state.currentUser);
export const useCollaboratorCursors = () =>
  useCanvasStore((state) => state.collaboratorCursors);