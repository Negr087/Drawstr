import type {
  CanvasElement,
  RectangleElement,
  EllipseElement,
  ArrowElement,
  FreedrawElement,
  TextElement,
} from "./types";

// Calculate bounds of all elements
function getCanvasBounds(elements: Map<string, CanvasElement>) {
  const activeElements = Array.from(elements.values()).filter(
    (el) => !el.isDeleted
  );

  if (activeElements.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  activeElements.forEach((element) => {
    const bounds = getElementBounds(element);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  });

  // Add padding
  const padding = 40;
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

function getElementBounds(element: CanvasElement) {
  switch (element.type) {
    case "rectangle":
    case "ellipse":
    case "text": {
      const e = element as RectangleElement | EllipseElement | TextElement;
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
      return { x: element.x, y: element.y, width: 0, height: 0 };
  }
}

// Export as SVG
export function downloadSVG(elements: Map<string, CanvasElement>, filename: string) {
  const bounds = getCanvasBounds(elements);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#1a1a2e"/>
`;

  const activeElements = Array.from(elements.values())
    .filter((el) => !el.isDeleted)
    .sort((a, b) => a.createdAt - b.createdAt);

  activeElements.forEach((element) => {
    svg += elementToSVG(element, bounds.minX, bounds.minY);
  });

  svg += "</svg>";

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

function elementToSVG(element: CanvasElement, offsetX: number, offsetY: number): string {
  const x = element.x - offsetX;
  const y = element.y - offsetY;

  switch (element.type) {
    case "rectangle": {
      const rect = element as RectangleElement;
      return `  <rect x="${x}" y="${y}" width="${rect.width}" height="${rect.height}" 
        stroke="${rect.strokeColor}" fill="${rect.fillColor}" 
        stroke-width="${rect.strokeWidth}" opacity="${rect.opacity}"/>\n`;
    }

    case "ellipse": {
      const ellipse = element as EllipseElement;
      const cx = x + ellipse.width / 2;
      const cy = y + ellipse.height / 2;
      const rx = Math.abs(ellipse.width / 2);
      const ry = Math.abs(ellipse.height / 2);
      return `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" 
        stroke="${ellipse.strokeColor}" fill="${ellipse.fillColor}" 
        stroke-width="${ellipse.strokeWidth}" opacity="${ellipse.opacity}"/>\n`;
    }

    case "arrow": {
      const arrow = element as ArrowElement;
      if (arrow.points.length < 2) return "";

      let path = `M ${x + arrow.points[0].x} ${y + arrow.points[0].y}`;
      for (let i = 1; i < arrow.points.length; i++) {
        path += ` L ${x + arrow.points[i].x} ${y + arrow.points[i].y}`;
      }

      const lastPoint = arrow.points[arrow.points.length - 1];
      const secondLastPoint = arrow.points[arrow.points.length - 2];
      const angle = Math.atan2(
        lastPoint.y - secondLastPoint.y,
        lastPoint.x - secondLastPoint.x
      );

      const arrowLength = 15;
      const arrowAngle = Math.PI / 6;
      const tipX = x + lastPoint.x;
      const tipY = y + lastPoint.y;

      path += ` M ${tipX} ${tipY} L ${
        tipX - arrowLength * Math.cos(angle - arrowAngle)
      } ${tipY - arrowLength * Math.sin(angle - arrowAngle)}`;
      path += ` M ${tipX} ${tipY} L ${
        tipX - arrowLength * Math.cos(angle + arrowAngle)
      } ${tipY - arrowLength * Math.sin(angle + arrowAngle)}`;

      return `  <path d="${path}" stroke="${arrow.strokeColor}" 
        fill="none" stroke-width="${arrow.strokeWidth}" 
        stroke-linecap="round" stroke-linejoin="round" 
        opacity="${arrow.opacity}"/>\n`;
    }

    case "freedraw": {
      const freedraw = element as FreedrawElement;
      if (freedraw.points.length < 2) return "";

      let path = `M ${x + freedraw.points[0].x} ${y + freedraw.points[0].y}`;
      for (let i = 1; i < freedraw.points.length; i++) {
        path += ` L ${x + freedraw.points[i].x} ${y + freedraw.points[i].y}`;
      }

      return `  <path d="${path}" stroke="${freedraw.strokeColor}" 
        fill="none" stroke-width="${freedraw.strokeWidth}" 
        stroke-linecap="round" stroke-linejoin="round" 
        opacity="${freedraw.opacity}"/>\n`;
    }

    case "text": {
      const text = element as TextElement;
      return `  <text x="${x}" y="${y + text.fontSize}" 
        font-family="${text.fontFamily}" font-size="${text.fontSize}" 
        fill="${text.strokeColor}" opacity="${text.opacity}">${text.text}</text>\n`;
    }

    default:
      return "";
  }
}

// Export as PNG
export function downloadPNG(
  elements: Map<string, CanvasElement>,
  filename: string,
  scale: number = 2
) {
  const bounds = getCanvasBounds(elements);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, height);

  // Draw elements
  const activeElements = Array.from(elements.values())
    .filter((el) => !el.isDeleted)
    .sort((a, b) => a.createdAt - b.createdAt);

  activeElements.forEach((element) => {
    drawElementOnCanvas(ctx, element, bounds.minX, bounds.minY);
  });

  // Download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.png`;
    link.click();
    URL.revokeObjectURL(url);
  });
}

function drawElementOnCanvas(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  offsetX: number,
  offsetY: number
) {
  const x = element.x - offsetX;
  const y = element.y - offsetY;

  ctx.save();
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
        ctx.fillRect(x, y, rect.width, rect.height);
      }
      ctx.strokeRect(x, y, rect.width, rect.height);
      break;
    }

    case "ellipse": {
      const ellipse = element as EllipseElement;
      ctx.beginPath();
      ctx.ellipse(
        x + ellipse.width / 2,
        y + ellipse.height / 2,
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
      ctx.moveTo(x + arrow.points[0].x, y + arrow.points[0].y);
      for (let i = 1; i < arrow.points.length; i++) {
        ctx.lineTo(x + arrow.points[i].x, y + arrow.points[i].y);
      }
      ctx.stroke();

      const lastPoint = arrow.points[arrow.points.length - 1];
      const secondLastPoint = arrow.points[arrow.points.length - 2];
      const angle = Math.atan2(
        lastPoint.y - secondLastPoint.y,
        lastPoint.x - secondLastPoint.x
      );

      const arrowLength = 15;
      const arrowAngle = Math.PI / 6;

      ctx.beginPath();
      ctx.moveTo(x + lastPoint.x, y + lastPoint.y);
      ctx.lineTo(
        x + lastPoint.x - arrowLength * Math.cos(angle - arrowAngle),
        y + lastPoint.y - arrowLength * Math.sin(angle - arrowAngle)
      );
      ctx.moveTo(x + lastPoint.x, y + lastPoint.y);
      ctx.lineTo(
        x + lastPoint.x - arrowLength * Math.cos(angle + arrowAngle),
        y + lastPoint.y - arrowLength * Math.sin(angle + arrowAngle)
      );
      ctx.stroke();
      break;
    }

    case "freedraw": {
      const freedraw = element as FreedrawElement;
      if (freedraw.points.length < 2) break;

      ctx.beginPath();
      ctx.moveTo(x + freedraw.points[0].x, y + freedraw.points[0].y);
      for (let i = 1; i < freedraw.points.length; i++) {
        ctx.lineTo(x + freedraw.points[i].x, y + freedraw.points[i].y);
      }
      ctx.stroke();
      break;
    }

    case "text": {
      const text = element as TextElement;
      ctx.font = `${text.fontSize}px ${text.fontFamily}`;
      ctx.fillStyle = text.strokeColor;
      ctx.fillText(text.text, x, y + text.fontSize);
      break;
    }
  }

  ctx.restore();
}

// Export as JSON
export function downloadJSON(
  elements: Map<string, CanvasElement>,
  canvasId: string,
  canvasName: string
) {
  const activeElements = Array.from(elements.values()).filter(
    (el) => !el.isDeleted
  );

  const data = {
    version: "1.0",
    canvasId,
    canvasName,
    exportedAt: Date.now(),
    elements: activeElements,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nostrdraw-${canvasName.replace(/\s+/g, "-").toLowerCase()}-${canvasId.slice(0, 8)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// Copy canvas as image to clipboard
export async function copyCanvasToClipboard(elements: Map<string, CanvasElement>) {
  const bounds = getCanvasBounds(elements);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.scale(2, 2);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, height);

  const activeElements = Array.from(elements.values())
    .filter((el) => !el.isDeleted)
    .sort((a, b) => a.createdAt - b.createdAt);

  activeElements.forEach((element) => {
    drawElementOnCanvas(ctx, element, bounds.minX, bounds.minY);
  });

  return new Promise<boolean>((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }

      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        resolve(true);
      } catch {
        resolve(false);
      }
    });
  });
}