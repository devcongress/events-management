export type FloatingPlacement = 'bottom' | 'top';

export interface FloatingRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface FloatingViewport {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface FloatingPosition {
  placement: FloatingPlacement;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface FloatingPositionOptions {
  anchor: FloatingRect;
  viewport: FloatingViewport;
  panelHeight: number;
  preferredWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'right';
  gap?: number;
  margin?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function calculateFloatingPosition({
  anchor,
  viewport,
  panelHeight,
  preferredWidth = 304,
  maxWidth = Number.POSITIVE_INFINITY,
  align = 'left',
  gap = 8,
  margin = 8,
}: FloatingPositionOptions): FloatingPosition {
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const availableWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(Math.max(anchor.width, preferredWidth), availableWidth, maxWidth);
  const alignedLeft = align === 'right' ? anchor.right - width : anchor.left;
  const left = clamp(
    alignedLeft,
    viewport.left + margin,
    Math.max(viewport.left + margin, viewportRight - margin - width),
  );
  const spaceBelow = Math.max(0, viewportBottom - margin - anchor.bottom - gap);
  const spaceAbove = Math.max(0, anchor.top - viewport.top - margin - gap);
  const requestedHeight = Math.min(panelHeight, Math.max(0, viewport.height - margin * 2));

  const placement: FloatingPlacement = spaceBelow >= requestedHeight || spaceBelow >= spaceAbove
    ? 'bottom'
    : 'top';
  const maxHeight = Math.floor(placement === 'bottom' ? spaceBelow : spaceAbove);
  const top = placement === 'bottom'
    ? anchor.bottom + gap
    : anchor.top - gap - Math.min(requestedHeight, spaceAbove);

  return {
    placement,
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(width),
    maxHeight,
  };
}
