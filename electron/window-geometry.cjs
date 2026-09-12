const BASE_WIDTH = 390, BASE_HEIGHT = 720, DEFAULT_SCALE = 3;
const MIN_WIDTH = 292, MIN_HEIGHT = 540;
const edges = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validBounds = bounds => bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) && bounds.width > 0 && bounds.height > 0;
function fitBounds(bounds, area) {
  const width = Math.round(clamp(bounds.width, Math.min(MIN_WIDTH, area.width), area.width));
  const height = Math.round(clamp(bounds.height, Math.min(MIN_HEIGHT, area.height), area.height));
  return { x: Math.round(clamp(bounds.x, area.x, area.x + area.width - width)), y: Math.round(clamp(bounds.y, area.y, area.y + area.height - height)), width, height };
}
function scaledBounds(scale, area, origin) {
  scale = clamp(scale, 0.75, 3);
  scale = Math.min(scale, (area.width - 16) / BASE_WIDTH, (area.height - 16) / BASE_HEIGHT);
  const width = Math.round(BASE_WIDTH * scale), height = Math.round(BASE_HEIGHT * scale);
  return fitBounds({ x: origin?.x ?? area.x + area.width - width - 8, y: origin?.y ?? area.y + area.height - height - 8, width, height }, area);
}
function reachableBounds(bounds, area) {
  // Leave a usable part of the move bar on screen; the tall transparent frame
  // must not pin the character to the top of the desktop.
  return { ...bounds,
    x: Math.round(clamp(bounds.x, area.x - bounds.width + Math.min(128, bounds.width), area.x + area.width - Math.min(128, bounds.width))),
    y: Math.round(clamp(bounds.y, area.y, area.y + area.height - Math.min(80, bounds.height))),
  };
}
function resizeBounds(bounds, dx, dy, edge, area) {
  if (!edges.includes(edge)) throw new Error('Invalid resize edge');
  let { x, y, width, height } = bounds;
  if (edge.includes('e') || edge.includes('w')) {
    width = Math.round(clamp(width + (edge.includes('w') ? -dx : dx), Math.min(MIN_WIDTH, area.width), area.width));
    if (edge.includes('w')) x += bounds.width - width;
  }
  if (edge.includes('s') || edge.includes('n')) {
    height = Math.round(clamp(height + (edge.includes('n') ? -dy : dy), Math.min(MIN_HEIGHT, area.height), area.height));
    if (edge.includes('n')) y += bounds.height - height;
  }
  return reachableBounds({ x, y, width, height }, area);
}
function contentScale(bounds) { return Math.min(3, bounds.width / BASE_WIDTH, bounds.height / BASE_HEIGHT); }
module.exports = { DEFAULT_SCALE, edges, validBounds, fitBounds, scaledBounds, reachableBounds, resizeBounds, contentScale };
