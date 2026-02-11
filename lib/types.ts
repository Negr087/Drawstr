// Canvas Element Types
export type Tool =
  | 'select'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'freedraw'
  | 'text'
  | 'eraser'
  | 'hand'
  | 'laser';

// Element types (only drawable elements)
export type ElementType =
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'freedraw'
  | 'text'
  | 'image';

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string; // pubkey
  isDeleted?: boolean;
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle';
  width: number;
  height: number;
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
  width: number;
  height: number;
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  points: Point[];
  startArrowhead?: 'none' | 'arrow';
  endArrowhead?: 'none' | 'arrow';
}

export interface FreedrawElement extends BaseElement {
  type: 'freedraw';
  points: Point[];
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  width: number;
  height: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  dataUrl: string; // base64
  width: number;
  height: number;
}

export type CanvasElement =
  | RectangleElement
  | EllipseElement
  | ArrowElement
  | FreedrawElement
  | TextElement
  | ImageElement;

// Canvas State
export interface CanvasState {
  elements: Map<string, CanvasElement>;
  selectedElementIds: Set<string>;
  viewportOffset: Point;
  zoom: number;
}

// Nostr Types
export interface NostrUser {
  pubkey: string;
  npub: string;
  name?: string;
  picture?: string;
}

export interface CursorPosition {
  pubkey: string;
  x: number;
  y: number;
  color: string;
  name?: string;
  timestamp: number;
}

export interface CanvasMetadata {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  isPublic: boolean;
  collaborators: string[]; // pubkeys
}

// Nostr Event Types for Canvas
export const NOSTR_KIND_CANVAS_ACTION = 33333;
export const NOSTR_KIND_CANVAS_METADATA = 30023;
export const NOSTR_KIND_CURSOR_POSITION = 25050; // Ephemeral
export const NOSTR_KIND_CANVAS_STATE = 30078; // Parameterized Replaceable Event

export interface CanvasAction {
  type: 'add' | 'update' | 'delete';
  element: CanvasElement;
  canvasId: string;
  timestamp: number;
}

// Drawing Colors
export const STROKE_COLORS = [
  '#ffffff',
  '#1e1e1e',
  '#e03131',
  '#2f9e44',
  '#1971c2',
  '#f08c00',
  '#9c36b5',
  '#099268',
];

export const FILL_COLORS = [
  'transparent',
  '#ffffff20',
  '#e0313130',
  '#2f9e4430',
  '#1971c230',
  '#f08c0030',
  '#9c36b530',
  '#09926830',
];

export const STROKE_WIDTHS = [1, 2, 4, 8];

// Helper functions
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

export function createDefaultElement(
  type: ElementType,
  x: number,
  y: number,
  pubkey: string
): Partial<CanvasElement> {
  const now = Date.now();
  return {
    id: generateId(),
    type,
    x,
    y,
    strokeColor: '#ffffff',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    zIndex: now,
    createdAt: now,
    updatedAt: now,
    createdBy: pubkey,
  };
}