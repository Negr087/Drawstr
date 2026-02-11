"use client";

import React from "react"

import { useRef, useEffect, useCallback, useState } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useNostr } from "@/lib/nostr-context";
import type {
  Point,
  CanvasElement,
  RectangleElement,
  EllipseElement,
  ArrowElement,
  FreedrawElement,
  TextElement,
  ImageElement,
} from "@/lib/types";
import { generateId } from "@/lib/types";
import { InlineTextEditor } from "./inline-text-editor";

interface InfiniteCanvasProps {
  canvasId: string;
}

export function InfiniteCanvas({ canvasId }: InfiniteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const lastCursorBroadcast = useRef<number>(0);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [resizing, setResizing] = useState<{
    id: string;
    handle: string;
    startPoint: Point;
    originalElement: CanvasElement;
  } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    start: Point;
    current: Point;
  } | null>(null);
  const [draggingSelection, setDraggingSelection] = useState<{
    start: Point;
    initialElements: Map<string, { x: number; y: number }>;
  } | null>(null);
  const [editingText, setEditingText] = useState<{
  element: TextElement;
  position: Point;
} | null>(null);

  const {
    elements,
    selectedElementIds,
    ephemeralElements,
    viewportOffset,
    zoom,
    activeTool,
    strokeColor,
    fillColor,
    strokeWidth,
    isDrawing,
    currentElement,
    currentUser,
    collaboratorCursors,
    lastTextConfig,
    setActiveTool,
    setViewportOffset,
    setZoom,
    setIsDrawing,
    setCurrentElement,
    addElement,
    updateElement,
    deleteElement,
    addEphemeralElement,
    removeExpiredEphemeralElements,
    setSelectedElementIds,
    clearSelection,
    deleteSelectedElements,
    copySelectedElements, // ← AGREGAR
    cutSelectedElements, // ← AGREGAR
    pasteElements,
    updateLastTextConfig, // ← AGREGAR
    undo,
    redo,
    saveHistory,
  } = useCanvasStore();

  const { publishCanvasAction, publishCursorPosition, user } = useNostr();

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Cleanup expired ephemeral elements (laser pointer)
useEffect(() => {
  const interval = setInterval(() => {
    removeExpiredEphemeralElements();
  }, 100); // Cada 100ms chequea si hay elementos para borrar

  return () => clearInterval(interval);
}, [removeExpiredEphemeralElements]);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };

      return {
        x: (screenX - rect.left - viewportOffset.x) / zoom,
        y: (screenY - rect.top - viewportOffset.y) / zoom,
      };
    },
    [viewportOffset, zoom]
  );

  // Draw grid pattern
  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const gridSize = 20 * zoom;
      const offsetX = viewportOffset.x % gridSize;
      const offsetY = viewportOffset.y % gridSize;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;

      // Vertical lines
      for (let x = offsetX; x < dimensions.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dimensions.height);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = offsetY; y < dimensions.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width, y);
        ctx.stroke();
      }
    },
    [dimensions, viewportOffset, zoom]
  );

  // Draw element
  const drawElement = useCallback(
    (ctx: CanvasRenderingContext2D, element: CanvasElement) => {
      if (element.isDeleted) return;

      ctx.save();
      ctx.translate(viewportOffset.x, viewportOffset.y);
      ctx.scale(zoom, zoom);

      ctx.strokeStyle = element.strokeColor;
      ctx.fillStyle = element.fillColor;
      ctx.lineWidth = element.strokeWidth;
      ctx.globalAlpha = element.opacity;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      switch (element.type) {
        case "rectangle": {
          const rect = element as RectangleElement;
          if (rect.fillColor !== "transparent") {
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          }
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
          break;
        }

        case "ellipse": {
          const ellipse = element as EllipseElement;
          ctx.beginPath();
          ctx.ellipse(
            ellipse.x + ellipse.width / 2,
            ellipse.y + ellipse.height / 2,
            Math.abs(ellipse.width / 2),
            Math.abs(ellipse.height / 2),
            0,
            0,
            Math.PI * 2
          );
          if (ellipse.fillColor !== "transparent") {
            ctx.fill();
          }
          ctx.stroke();
          break;
        }

        case "arrow": {
          const arrow = element as ArrowElement;
          if (arrow.points.length < 2) break;

          ctx.beginPath();
          ctx.moveTo(
            arrow.x + arrow.points[0].x,
            arrow.y + arrow.points[0].y
          );

          for (let i = 1; i < arrow.points.length; i++) {
            ctx.lineTo(
              arrow.x + arrow.points[i].x,
              arrow.y + arrow.points[i].y
            );
          }
          ctx.stroke();

          // Draw arrowhead
          const lastPoint = arrow.points[arrow.points.length - 1];
          const secondLastPoint = arrow.points[arrow.points.length - 2];
          const angle = Math.atan2(
            lastPoint.y - secondLastPoint.y,
            lastPoint.x - secondLastPoint.x
          );

          const arrowLength = 15;
          const arrowAngle = Math.PI / 6;

          ctx.beginPath();
          ctx.moveTo(
            arrow.x + lastPoint.x,
            arrow.y + lastPoint.y
          );
          ctx.lineTo(
            arrow.x + lastPoint.x - arrowLength * Math.cos(angle - arrowAngle),
            arrow.y + lastPoint.y - arrowLength * Math.sin(angle - arrowAngle)
          );
          ctx.moveTo(
            arrow.x + lastPoint.x,
            arrow.y + lastPoint.y
          );
          ctx.lineTo(
            arrow.x + lastPoint.x - arrowLength * Math.cos(angle + arrowAngle),
            arrow.y + lastPoint.y - arrowLength * Math.sin(angle + arrowAngle)
          );
          ctx.stroke();
          break;
        }

        case "freedraw": {
          const freedraw = element as FreedrawElement;
          if (freedraw.points.length < 2) break;

          ctx.beginPath();
          ctx.moveTo(
            freedraw.x + freedraw.points[0].x,
            freedraw.y + freedraw.points[0].y
          );

          for (let i = 1; i < freedraw.points.length; i++) {
            ctx.lineTo(
              freedraw.x + freedraw.points[i].x,
              freedraw.y + freedraw.points[i].y
            );
          }
          ctx.stroke();
          break;
        }
        case "text": {
  const text = element as TextElement;
  
  // Calcular escala si fue redimensionado
  const originalWidth = text.text.length * (text.fontSize * 0.6);
  const scaleX = text.width / originalWidth;
  const scaleY = text.height / (text.fontSize * 1.2);
  const scale = Math.min(scaleX, scaleY);
  
  const scaledFontSize = text.fontSize * scale;
  
  const fontWeight = text.fontWeight || 'normal';
  const fontStyle = text.fontStyle || 'normal';
  ctx.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${text.fontFamily}`;
  ctx.fillStyle = text.strokeColor;

  ctx.fillText(text.text, text.x, text.y + scaledFontSize);

  if (text.textDecoration === 'underline') {
    const textWidth = ctx.measureText(text.text).width;
    ctx.strokeStyle = text.strokeColor;
    ctx.lineWidth = Math.max(1, scaledFontSize / 20);
    ctx.beginPath();
    ctx.moveTo(text.x, text.y + scaledFontSize + 2);
    ctx.lineTo(text.x + textWidth, text.y + scaledFontSize + 2);
    ctx.stroke();
  }
  break;
}

        case "image": {
          const imgElement = element as ImageElement;
          let img = imageCache.current.get(imgElement.id);

          if (!img) {
            img = new Image();
            img.src = imgElement.dataUrl;
            img.onload = () => {
              // Force re-render when image loads
            };
            imageCache.current.set(imgElement.id, img);
          }

          if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, imgElement.x, imgElement.y, imgElement.width, imgElement.height);
          }
          break;
        }
      }

      // Draw selection box
      if (selectedElementIds.has(element.id)) {
        ctx.strokeStyle = "#00d9ff";
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([5 / zoom, 5 / zoom]);

        const bounds = getElementBounds(element);
        ctx.strokeRect(
          bounds.x - 5 / zoom,
          bounds.y - 5 / zoom,
          bounds.width + 10 / zoom,
          bounds.height + 10 / zoom
        );
        ctx.setLineDash([]);

        // Draw resize handles
        const handleSize = 8 / zoom;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#00d9ff";
        ctx.lineWidth = 1 / zoom;

        const handles = getResizeHandles(bounds);
        Object.values(handles).forEach(({ x, y }) => {
          ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        });
      }

      ctx.restore();
    },
    [viewportOffset, zoom, selectedElementIds]
  );

  // Draw selection box (drag to select)
  const drawSelectionBox = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!selectionBox) return;

      ctx.save();
      ctx.translate(viewportOffset.x, viewportOffset.y);
      ctx.scale(zoom, zoom);

      const x = Math.min(selectionBox.start.x, selectionBox.current.x);
      const y = Math.min(selectionBox.start.y, selectionBox.current.y);
      const width = Math.abs(selectionBox.current.x - selectionBox.start.x);
      const height = Math.abs(selectionBox.current.y - selectionBox.start.y);

      ctx.strokeStyle = "#00d9ff";
      ctx.lineWidth = 1 / zoom;
      ctx.fillStyle = "rgba(0, 217, 255, 0.1)";

      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);

      ctx.restore();
    },
    [selectionBox, viewportOffset, zoom]
  );

  // Draw collaborator cursors
  const drawCursors = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      collaboratorCursors.forEach((cursor) => {
        // Skip old cursors (> 5 seconds)
        if (Date.now() - cursor.timestamp > 5000) return;

        ctx.save();
        ctx.translate(viewportOffset.x, viewportOffset.y);
        ctx.scale(zoom, zoom);

        // Draw cursor
        ctx.fillStyle = cursor.color;
        ctx.beginPath();
        ctx.moveTo(cursor.x, cursor.y);
        ctx.lineTo(cursor.x + 12, cursor.y + 12);
        ctx.lineTo(cursor.x + 4, cursor.y + 12);
        ctx.lineTo(cursor.x, cursor.y + 18);
        ctx.closePath();
        ctx.fill();

        // Draw name label
        if (cursor.name) {
          ctx.font = "12px sans-serif";
          ctx.fillStyle = cursor.color;
          ctx.fillRect(cursor.x + 15, cursor.y + 15, ctx.measureText(cursor.name).width + 8, 20);
          ctx.fillStyle = "#000";
          ctx.fillText(cursor.name, cursor.x + 19, cursor.y + 29);
        }

        ctx.restore();
      });
    },
    [collaboratorCursors, viewportOffset, zoom]
  );

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Draw grid
    drawGrid(ctx);

    // ============================================
    // NUEVO: Ordenar elementos por zIndex
    // ============================================
    const sortedElements = Array.from(elements.values())
      .filter(el => !el.isDeleted)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    // Draw all elements (ordenados) excepto el que se está editando
sortedElements.forEach((element) => {
  // No dibujar el elemento que se está editando inline
  if (editingText && element.id === editingText.element.id) return;
  drawElement(ctx, element);
});
    // Draw ephemeral elements (laser pointer)
ephemeralElements.forEach((element) => {
  // Calcular fade out basado en tiempo restante
  const timeLeft = element.expiresAt - Date.now();
  const totalDuration = 2000; // 2 segundos
  const fadeProgress = Math.max(0, timeLeft / totalDuration);
  
  // Dibujar con opacidad decreciente
  const originalOpacity = element.opacity;
  (element as any).opacity = fadeProgress;
  drawElement(ctx, element as CanvasElement);
  (element as any).opacity = originalOpacity;
});

    // Draw current element being drawn
    if (currentElement) {
      drawElement(ctx, currentElement);
    }

    // Draw collaborator cursors
    drawCursors(ctx);

    // Draw selection box
    drawSelectionBox(ctx);
  }, [
    dimensions,
    elements,
    ephemeralElements,
    currentElement,
    viewportOffset,
    zoom,
    selectedElementIds,
    collaboratorCursors,
    selectionBox,
    editingText,
    drawGrid,
    drawElement,
    drawCursors,
    drawSelectionBox,
  ]);

  // Handle mouse down
  const handleMouseDown = useCallback(
  (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // Bloquear dibujo si no está logueado
    if (!user && activeTool !== "select" && activeTool !== "hand") {
      return; // No hacer nada
    }

    // Cerrar editor de texto si está abierto
    if (editingText) {
      handleTextFinish();
      return;
    }

      const point = screenToCanvas(e.clientX, e.clientY);

      if (activeTool === "hand" || e.button === 1) {
        return;
      }

      // Check for resize handles first
      if (activeTool === "select" && selectedElementIds.size === 1) {
        const id = Array.from(selectedElementIds)[0];
        const element = elements.get(id);
        if (element) {
          const bounds = getElementBounds(element);
          const handles = getResizeHandles(bounds);
          const handleSize = 8 / zoom;

          for (const [key, handlePos] of Object.entries(handles)) {
            if (
              Math.abs(point.x - handlePos.x) <= handleSize &&
              Math.abs(point.y - handlePos.y) <= handleSize
            ) {
              setResizing({
                id: element.id,
                handle: key,
                startPoint: point,
                originalElement: element,
              });
              return;
            }
          }
        }
      }

      if (activeTool === "select") {
        const elementsArray = Array.from(elements.values()).reverse();
        const clickedElement = elementsArray.find((element) =>
          !element.isDeleted && isPointInElement(point, element)
        );

        if (clickedElement) {
          const isAlreadySelected = selectedElementIds.has(clickedElement.id);
          const nextSelection = new Set(selectedElementIds);

          if (e.shiftKey) {
            if (isAlreadySelected) {
              nextSelection.delete(clickedElement.id);
            } else {
              nextSelection.add(clickedElement.id);
            }
          } else {
            if (!isAlreadySelected) {
              nextSelection.clear();
              nextSelection.add(clickedElement.id);
            }
          }

          setSelectedElementIds(nextSelection);

          const elementsToDrag = new Map();
          nextSelection.forEach(id => {
            const el = elements.get(id);
            if (el) elementsToDrag.set(id, { x: el.x, y: el.y });
          });

          if (elementsToDrag.size > 0) {
            setDraggingSelection({
              start: point,
              initialElements: elementsToDrag,
            });
          }

        } else {
          if (!e.shiftKey) {
            clearSelection();
          }
          setSelectionBox({ start: point, current: point });
        }
        return;
      }

      if (activeTool === "eraser") {
        elements.forEach((element) => {
          if (element.isDeleted) return;
          if (isPointInElement(point, element)) {
            updateElement(element.id, { isDeleted: true } as Partial<CanvasElement>);
            if (user) {
              publishCanvasAction("delete", { ...element, isDeleted: true }, canvasId);
            }
          }
        });
        return;
      }

      setIsDrawing(true);

      const now = Date.now();
      const baseElement = {
        id: generateId(),
        strokeColor,
        fillColor,
        strokeWidth,
        opacity: 1,
        zIndex: now, // ← NUEVO: usar timestamp como zIndex inicial
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser?.pubkey || "anonymous",
      };

      switch (activeTool) {
        case "rectangle":
          setCurrentElement({
            ...baseElement,
            type: "rectangle",
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
          } as RectangleElement);
          break;

        case "ellipse":
          setCurrentElement({
            ...baseElement,
            type: "ellipse",
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
          } as EllipseElement);
          break;

        case "arrow":
          setCurrentElement({
            ...baseElement,
            type: "arrow",
            x: point.x,
            y: point.y,
            points: [{ x: 0, y: 0 }],
            endArrowhead: "arrow",
          } as ArrowElement);
          break;

        case "freedraw":
          setCurrentElement({
            ...baseElement,
            type: "freedraw",
            x: point.x,
            y: point.y,
            points: [{ x: 0, y: 0 }],
          } as FreedrawElement);
          break;

          case "laser":
  setCurrentElement({
    ...baseElement,
    type: "freedraw", // Usa el tipo freedraw
    strokeColor: "#ff0000", // Rojo brillante
    strokeWidth: strokeWidth * 2, // Más grueso
    x: point.x,
    y: point.y,
    points: [{ x: 0, y: 0 }],
  } as FreedrawElement);
  break;

        case "text": {
  // Crear elemento de texto inline inmediatamente
  const now = Date.now();
  const textElement: TextElement = {
    id: generateId(),
    type: "text",
    x: point.x,
    y: point.y,
    text: "",
    fontSize: lastTextConfig.fontSize, // ← Usar config guardada
    fontFamily: lastTextConfig.fontFamily, // ← Usar config guardada
    fontWeight: lastTextConfig.fontWeight, // ← Usar config guardada
    fontStyle: lastTextConfig.fontStyle, // ← Usar config guardada
    textDecoration: lastTextConfig.textDecoration, // ← Usar config guardada
    strokeColor: lastTextConfig.strokeColor, // ← Usar config guardada
    fillColor: "transparent",
    strokeWidth: 0,
    opacity: 1,
    zIndex: now,
    width: 200,
    height: lastTextConfig.fontSize * 1.2, // ← Ajustar
    createdAt: now,
    updatedAt: now,
    createdBy: currentUser?.pubkey || "anonymous",
  };
  
  // Agregar inmediatamente al canvas
  addElement(textElement);
  setEditingText({
    element: textElement,
    position: point,
  });
  break;
}
      }
    },
    [
      screenToCanvas,
      activeTool,
      elements,
      selectedElementIds,
      strokeColor,
      fillColor,
      strokeWidth,
      currentUser,
      user,
      canvasId,
      zoom,
      setIsDrawing,
      setCurrentElement,
      addElement,
      updateElement,
      setSelectedElementIds,
      clearSelection,
      publishCanvasAction,
      copySelectedElements, // ← AGREGAR
      cutSelectedElements, // ← AGREGAR
      pasteElements, // ← AGREGAR
      undo,
      redo,
      saveHistory,
    ]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const point = screenToCanvas(e.clientX, e.clientY);

      if (user && Date.now() - lastCursorBroadcast.current > 100) {
        lastCursorBroadcast.current = Date.now();
        publishCursorPosition(point.x, point.y, canvasId);
      }

      if (draggingSelection && activeTool === "select") {
        const dx = point.x - draggingSelection.start.x;
        const dy = point.y - draggingSelection.start.y;

        draggingSelection.initialElements.forEach((initialPos, id) => {
          updateElement(id, {
            x: initialPos.x + dx,
            y: initialPos.y + dy,
          });
        });
        return;
      }

      if (e.buttons === 4 || (e.buttons === 1 && activeTool === "hand")) {
        setViewportOffset({
          x: viewportOffset.x + e.movementX,
          y: viewportOffset.y + e.movementY,
        });
        return;
      }

      if (resizing) {
        const dx = point.x - resizing.startPoint.x;
        const dy = point.y - resizing.startPoint.y;
        const { originalElement, handle } = resizing;

        let newElement = { ...originalElement };

        if (["rectangle", "ellipse", "image", "text"].includes(newElement.type)) {
          const el = newElement as RectangleElement | EllipseElement | ImageElement | TextElement;

          if (handle.includes("e")) el.width = Math.max(1, (originalElement as any).width + dx);
          if (handle.includes("w")) {
            const newWidth = Math.max(1, (originalElement as any).width - dx);
            el.x = (originalElement as any).x + ((originalElement as any).width - newWidth);
            el.width = newWidth;
          }
          if (handle.includes("s")) el.height = Math.max(1, (originalElement as any).height + dy);
          if (handle.includes("n")) {
            const newHeight = Math.max(1, (originalElement as any).height - dy);
            el.y = (originalElement as any).y + ((originalElement as any).height - newHeight);
            el.height = newHeight;
          }

          updateElement(el.id, el);
        }
        return;
      }

      if (selectionBox) {
        setSelectionBox({ ...selectionBox, current: point });

        const x = Math.min(selectionBox.start.x, point.x);
        const y = Math.min(selectionBox.start.y, point.y);
        const width = Math.abs(point.x - selectionBox.start.x);
        const height = Math.abs(point.y - selectionBox.start.y);

        const selectionRect = { x, y, width, height };
        const newSelection = new Set<string>();

        elements.forEach((element) => {
          if (element.isDeleted) return;
          const bounds = getElementBounds(element);

          if (
            bounds.x < selectionRect.x + selectionRect.width &&
            bounds.x + bounds.width > selectionRect.x &&
            bounds.y < selectionRect.y + selectionRect.height &&
            bounds.y + bounds.height > selectionRect.y
          ) {
            newSelection.add(element.id);
          }
        });

        setSelectedElementIds(newSelection);
        return;
      }

      if (!isDrawing || !currentElement) return;

      switch (currentElement.type) {
        case "rectangle":
        case "ellipse":
          let width = point.x - currentElement.x;
          let height = point.y - currentElement.y;

          if (e.shiftKey) {
            const side = Math.max(Math.abs(width), Math.abs(height));
            width = side * (width < 0 ? -1 : 1);
            height = side * (height < 0 ? -1 : 1);
          }

          setCurrentElement({
            ...currentElement,
            width,
            height,
          } as RectangleElement | EllipseElement);
          break;

        case "arrow":
          let dx = point.x - currentElement.x;
          let dy = point.y - currentElement.y;

          if (e.shiftKey) {
            const angle = Math.atan2(dy, dx);
            const snap = Math.PI / 12;
            const snappedAngle = Math.round(angle / snap) * snap;
            const dist = Math.sqrt(dx * dx + dy * dy);
            dx = Math.cos(snappedAngle) * dist;
            dy = Math.sin(snappedAngle) * dist;
          }

          setCurrentElement({
            ...currentElement,
            points: [
              { x: 0, y: 0 },
              { x: dx, y: dy },
            ],
          } as ArrowElement);
          break;

        case "freedraw":
          setCurrentElement({
            ...currentElement,
            points: [
              ...(currentElement as FreedrawElement).points,
              { x: point.x - currentElement.x, y: point.y - currentElement.y },
            ],
          } as FreedrawElement);
          break;
      }
    },
    [
      screenToCanvas,
      isDrawing,
      currentElement,
      activeTool,
      viewportOffset,
      zoom,
      draggingSelection,
      selectionBox,
      resizing,
      elements,
      user,
      canvasId,
      setViewportOffset,
      setCurrentElement,
      updateElement,
      setSelectedElementIds,
      publishCursorPosition,
    ]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (resizing) {
      setResizing(null);
      return;
    }

    if (draggingSelection) {
      setDraggingSelection(null);
      if (user) {
        draggingSelection.initialElements.forEach((_, id) => {
          const finalElement = elements.get(id);
          if (finalElement) {
            publishCanvasAction("update", finalElement, canvasId);
          }
        });
      }
      return;
    }

    if (selectionBox) {
      setSelectionBox(null);
      return;
    }

    if (isDrawing && currentElement) {
      let isValid = false;

      switch (currentElement.type) {
        case "rectangle":
        case "ellipse":
          const { width, height } = currentElement as RectangleElement | EllipseElement;
          isValid = Math.abs(width) > 5 || Math.abs(height) > 5;
          break;
        case "arrow":
          const arrow = currentElement as ArrowElement;
          if (arrow.points.length >= 2) {
            const lastPoint = arrow.points[arrow.points.length - 1];
            const dist = Math.sqrt(lastPoint.x * lastPoint.x + lastPoint.y * lastPoint.y);
            isValid = dist > 5;
          }
          break;
        case "freedraw":
          isValid = (currentElement as FreedrawElement).points.length > 2;
          break;
        case "text":
          isValid = true;
          break;
      }

      if (isValid) {
        // Si es laser (viene de activeTool laser), agregar como efímero
    if (activeTool === "laser") {
      addEphemeralElement(currentElement, 2000); // 2 segundos
      // Publicar a Nostr como acción especial (opcional)
      if (user) {
        publishCanvasAction("add", currentElement, canvasId);
      }
    } else {
      // Elementos normales
      addElement(currentElement);
      saveHistory();
      if (user) {
        publishCanvasAction("add", currentElement, canvasId);
      }
    }
      }
    }

    setIsDrawing(false);
    setCurrentElement(null);
  }, [
    isDrawing,
    currentElement,
    activeTool,
    resizing,
    draggingSelection,
    selectionBox,
    user,
    canvasId,
    elements,
    addElement,
    setIsDrawing,
    setCurrentElement,
    publishCanvasAction,
  ]);

  // Handle wheel for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.001;
        const newZoom = Math.max(0.1, Math.min(5, zoom + delta));

        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const cursorX = e.clientX - rect.left;
          const cursorY = e.clientY - rect.top;

          const zoomRatio = newZoom / zoom;
          setViewportOffset({
            x: cursorX - (cursorX - viewportOffset.x) * zoomRatio,
            y: cursorY - (cursorY - viewportOffset.y) * zoomRatio,
          });
        }

        setZoom(newZoom);
      } else {
        setViewportOffset({
          x: viewportOffset.x - e.deltaX,
          y: viewportOffset.y - e.deltaY,
        });
      }
    },
    [zoom, viewportOffset, setZoom, setViewportOffset]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Delete" || e.key === "Backspace") {
    // ========== AGREGAR ESTA VALIDACIÓN ==========
    if (!user) return; // Bloquear si no está logueado
    // ============================================
    
    if (selectedElementIds.size > 0) {
      deleteSelectedElements();
      if (user) {
        selectedElementIds.forEach((id) => {
          const element = elements.get(id);
          if (element) {
            publishCanvasAction("delete", { ...element, isDeleted: true }, canvasId);
          }
        });
      }
    }
  }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
  e.preventDefault();
  if (!user) return;
  if (selectedElementIds.size > 0) {
    copySelectedElements();
  }
}

if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
  e.preventDefault();
if (!user) return;
  if (selectedElementIds.size > 0) {
    cutSelectedElements();
    if (user) {
      selectedElementIds.forEach((id) => {
        const element = elements.get(id);
        if (element) {
          publishCanvasAction("delete", { ...element, isDeleted: true }, canvasId);
        }
      });
    }
  }
}

if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
  e.preventDefault();
  if (!user) return;
  undo();
}

if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
  e.preventDefault();
  if (!user) return;
  redo();
}

if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
  e.preventDefault();
  if (!user) return;
  pasteElements();
}

      if (e.key === "Escape") {
        if (isDrawing || currentElement) {
          setIsDrawing(false);
          setCurrentElement(null);
          return;
        }

        if (selectionBox) {
          setSelectionBox(null);
          return;
        }

        if (selectedElementIds.size > 0) {
          clearSelection();
          return;
        }

        if (activeTool !== 'select') {
          setActiveTool('select');
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedElementIds,
    elements,
    user,
    canvasId,
    activeTool,
    isDrawing,
    currentElement,
    selectionBox,
    deleteSelectedElements,
    clearSelection,
    setIsDrawing,
    setCurrentElement,
    setActiveTool,
    setSelectionBox,
    publishCanvasAction,
  ]);

  // Handle Drag and Drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      const files = Array.from(e.dataTransfer.files);

      files.forEach((file) => {
        if (!file.type.startsWith("image/")) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
            let width = img.naturalWidth;
            let height = img.naturalHeight;
            const maxSize = 400;

            if (width > maxSize || height > maxSize) {
              const ratio = Math.min(maxSize / width, maxSize / height);
              width *= ratio;
              height *= ratio;
            }

            const now = Date.now();
            const imageElement: ImageElement = {
              id: generateId(),
              type: "image",
              x: x,
              y: y,
              width,
              height,
              dataUrl,
              strokeColor: "transparent",
              fillColor: "transparent",
              strokeWidth: 0,
              opacity: 1,
              zIndex: now, // ← NUEVO
              createdAt: now,
              updatedAt: now,
              createdBy: currentUser?.pubkey || "anonymous",
            };

            addElement(imageElement);
            if (user) {
              publishCanvasAction("add", imageElement, canvasId);
            }
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    },
    [screenToCanvas, addElement, currentUser, user, canvasId, publishCanvasAction]
  );

  // Handle double-click to edit text
  const handleDoubleClick = useCallback(
  (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = screenToCanvas(e.clientX, e.clientY);

    const elementsArray = Array.from(elements.values()).reverse();
    const clickedText = elementsArray.find(
      (element) =>
        element.type === "text" &&
        !element.isDeleted &&
        isPointInElement(point, element)
    ) as TextElement | undefined;

    if (clickedText) {
      // Editar inline en lugar de modal
      setEditingText({
        element: clickedText,
        position: { x: clickedText.x, y: clickedText.y },
      });
    }
  },
  [screenToCanvas, elements]
);

  // Handlers para texto inline
const handleTextUpdate = useCallback((updates: Partial<TextElement>) => {
  if (!editingText) return;
  
  // Guardar configuración para próximos textos
  const configUpdates: any = {};
  if (updates.fontSize) configUpdates.fontSize = updates.fontSize;
  if (updates.fontFamily) configUpdates.fontFamily = updates.fontFamily;
  if (updates.fontWeight) configUpdates.fontWeight = updates.fontWeight;
  if (updates.fontStyle) configUpdates.fontStyle = updates.fontStyle;
  if (updates.textDecoration) configUpdates.textDecoration = updates.textDecoration;
  if (updates.strokeColor) configUpdates.strokeColor = updates.strokeColor;
  
  if (Object.keys(configUpdates).length > 0) {
    updateLastTextConfig(configUpdates);
  }
  
  updateElement(editingText.element.id, {
    ...updates,
    width: updates.text ? updates.text.length * ((updates.fontSize || editingText.element.fontSize) * 0.6) : editingText.element.width,
    height: (updates.fontSize || editingText.element.fontSize) * 1.2,
  });
  
  setEditingText({
    ...editingText,
    element: {
      ...editingText.element,
      ...updates,
    } as TextElement,
  });
}, [editingText, updateElement, updateLastTextConfig]);

const handleTextFinish = useCallback(() => {
  if (!editingText) return;
  
  const finalElement = elements.get(editingText.element.id);
  
  // Si el texto está vacío, eliminar el elemento
  const textElement = finalElement as TextElement;
if (!finalElement || finalElement.type !== "text" || !textElement.text || textElement.text.trim() === "") {
    deleteElement(editingText.element.id);
  } else if (user) {
    // Publicar a Nostr
    publishCanvasAction("add", finalElement, canvasId);
  }
  
  setEditingText(null);
}, [editingText, elements, user, canvasId, deleteElement, publishCanvasAction]);

const handleTextCancel = useCallback(() => {
  if (!editingText) return;
  
  // Eliminar el elemento temporal
  deleteElement(editingText.element.id);
  setEditingText(null);
}, [editingText, deleteElement]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-background"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas
        id="drawstr-canvas"
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        className="cursor-crosshair"
        style={{
          cursor:
            activeTool === "hand"
              ? "grab"
              : activeTool === "select"
                ? "default"
                : "crosshair",
        }}
      />

      {/* Banner de view-only si no está logueado */}
    {!user && (
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card/95 backdrop-blur-sm border border-border rounded-lg px-6 py-4 shadow-xl pointer-events-none">
        <p className="text-sm text-muted-foreground text-center">
          👁️ View-only mode
          <br />
          <span className="text-xs">Login with Nostr to draw</span>
        </p>
      </div>
    )}
    
      {/* Editor de texto inline */}
    {editingText && (
      <InlineTextEditor
        element={editingText.element}
        position={editingText.position}
        viewportOffset={viewportOffset}
        zoom={zoom}
        onUpdate={handleTextUpdate}
        onFinish={handleTextFinish}
        onCancel={handleTextCancel}
      />
    )}
  </div>
);
}

// Helper functions
function getElementBounds(element: CanvasElement) {
  switch (element.type) {
    case "rectangle":
    case "ellipse":
    case "text":
    case "image": {
      const e = element as RectangleElement | EllipseElement | TextElement | ImageElement;
      return {
        x: Math.min(e.x, e.x + e.width),
        y: Math.min(e.y, e.y + e.height),
        width: Math.abs(e.width),
        height: Math.abs(e.height),
      };
    }
    case "arrow":
    case "freedraw": {
      const e = element as ArrowElement | FreedrawElement;
      const xs = e.points.map((p) => e.x + p.x);
      const ys = e.points.map((p) => e.y + p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    default:
      return { x: (element as any).x || 0, y: (element as any).y || 0, width: 0, height: 0 };
  }
}

function isPointInElement(point: Point, element: CanvasElement): boolean {
  const bounds = getElementBounds(element);
  const padding = 5;
  return (
    point.x >= bounds.x - padding &&
    point.x <= bounds.x + bounds.width + padding &&
    point.y >= bounds.y - padding &&
    point.y <= bounds.y + bounds.height + padding
  );
}

function getResizeHandles(bounds: { x: number; y: number; width: number; height: number }) {
  const { x, y, width, height } = bounds;
  return {
    nw: { x, y },
    n: { x: x + width / 2, y },
    ne: { x: x + width, y },
    e: { x: x + width, y: y + height / 2 },
    se: { x: x + width, y: y + height },
    s: { x: x + width / 2, y: y + height },
    sw: { x, y: y + height },
    w: { x, y: y + height / 2 },
  };
}