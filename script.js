const viewport = document.getElementById('mapViewport');
const topbar = document.querySelector('.topbar');
const layer = document.getElementById('mapLayer');
const image = document.getElementById('mapImage');
const markersContainer = document.getElementById('poiMarkers');
const annotationLayer = document.getElementById('annotationLayer');
const hoverLabel = document.getElementById('hoverLabel');
const poiList = document.getElementById('poiList');
const poiPanel = document.getElementById('poiPanel');
const togglePoiPanelButton = document.getElementById('togglePoiPanel');
const toggleAllPois = document.getElementById('toggleAllPois');
const zoomInButton = document.getElementById('zoomIn');
const zoomOutButton = document.getElementById('zoomOut');
const resetButton = document.getElementById('resetView');
const undoButton = document.getElementById('undoShape');
const redoButton = document.getElementById('redoShape');
const colorPicker = document.getElementById('shapeColorPicker');
const toolButtons = Array.from(document.querySelectorAll('.tool-button'));
const toolbar = document.querySelector('.map-toolbar');
const toggleToolbarButton = document.getElementById('toggleToolbar');

const storageKey = 'exclusion-zone-custom-pois';
const defaultPois = [];

function loadCustomPois() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveCustomPois() {
  const customPois = pois.filter((poi) => poi.custom);
  localStorage.setItem(storageKey, JSON.stringify(customPois));
}

let pois = [...defaultPois, ...loadCustomPois()];
let visiblePois = new Set(pois.map((poi) => poi.name));
let poiPanelCollapsed = false;

let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let activeTool = 'pan';
let activeColor = '#00d9ff';
let isDrawing = false;
let currentShape = null;
let shapes = [];
let redoStack = [];
let hoveredCell = null;
const svgNamespace = 'http://www.w3.org/2000/svg';
const gridColumns = 21;
const gridRows = 24;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const fullHex = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const value = parseInt(fullHex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateTransform() {
  layer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

function fitMap() {
  const rect = viewport.getBoundingClientRect();
  const naturalWidth = image.naturalWidth || 842;
  const naturalHeight = image.naturalHeight || 960;

  layer.style.width = `${naturalWidth}px`;
  layer.style.height = `${naturalHeight}px`;
  image.style.width = '100%';
  image.style.height = '100%';
  annotationLayer.setAttribute('viewBox', `0 0 ${naturalWidth} ${naturalHeight}`);
  annotationLayer.setAttribute('width', naturalWidth);
  annotationLayer.setAttribute('height', naturalHeight);

  scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight) * 0.98;
  offsetX = (rect.width - naturalWidth * scale) / 2;
  offsetY = (rect.height - naturalHeight * scale) / 2;
  updateTransform();
  renderAnnotations();
}

function renderPoiList() {
  if (!poiList) {
    return;
  }

  poiList.innerHTML = '';
  poiList.style.display = poiPanelCollapsed ? 'none' : 'flex';

  pois.forEach((poi) => {
    const item = document.createElement('div');
    item.className = 'poi-list-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = visiblePois.has(poi.name);
    checkbox.addEventListener('change', () => {
      togglePoi(poi.name);
    });

    const label = document.createElement('label');
    label.className = 'poi-list-label';
    label.textContent = poi.name;
    label.prepend(checkbox);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'poi-delete-button';
    deleteButton.type = 'button';
    deleteButton.textContent = '×';
    deleteButton.title = 'Delete POI';
    deleteButton.addEventListener('click', () => {
      deletePoi(poi.name);
    });

    item.appendChild(label);
    item.appendChild(deleteButton);
    poiList.appendChild(item);
  });
}

function togglePoiPanel() {
  poiPanelCollapsed = !poiPanelCollapsed;
  poiPanel.classList.toggle('collapsed', poiPanelCollapsed);
  if (togglePoiPanelButton) {
    togglePoiPanelButton.setAttribute('aria-expanded', String(!poiPanelCollapsed));
    togglePoiPanelButton.textContent = poiPanelCollapsed ? '▸ POIs' : '▾ POIs';
  }
  renderPois();
}

function renderPois() {
  markersContainer.innerHTML = '';

  pois.forEach((poi) => {
    const isVisible = visiblePois.has(poi.name);
    const marker = document.createElement('div');
    marker.className = 'marker';
    marker.dataset.poi = poi.name;
    marker.style.display = isVisible ? 'flex' : 'none';
    marker.style.left = `${poi.x}%`;
    marker.style.top = `${poi.y}%`;

    const bubble = document.createElement('span');
    bubble.className = 'marker-bubble';
    bubble.textContent = poi.name;
    const color = poi.color || activeColor;
    bubble.style.borderColor = color;
    bubble.style.color = '#f5f7fa';

    const dot = document.createElement('span');
    dot.className = 'poi-dot';
    dot.style.background = color;
    dot.style.boxShadow = `0 0 0 3px ${hexToRgba(color, 0.24)}`;

    marker.appendChild(bubble);
    marker.appendChild(dot);
    markersContainer.appendChild(marker);
  });

  renderPoiList();
}

function deletePoi(name) {
  const poiToDelete = pois.find((poi) => poi.name === name);
  if (!poiToDelete) {
    return;
  }

  if (!window.confirm(`Delete ${name}?`)) {
    return;
  }

  pois = pois.filter((poi) => poi.name !== name);
  visiblePois.delete(name);
  toggleAllPois.checked = visiblePois.size === pois.length;
  saveCustomPois();
  renderPois();
}

function togglePoi(name) {
  if (visiblePois.has(name)) {
    visiblePois.delete(name);
  } else {
    visiblePois.add(name);
  }
  toggleAllPois.checked = visiblePois.size === pois.length;
  renderPois();
}

function toggleAll(value) {
  visiblePois = value ? new Set(pois.map((poi) => poi.name)) : new Set();
  toggleAllPois.checked = value;
  renderPois();
}

function setActiveTool(tool) {
  activeTool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === tool);
  });
}

function toggleToolbar() {
  if (!toolbar || !toggleToolbarButton) {
    return;
  }

  const isCollapsed = toolbar.classList.toggle('collapsed');
  toggleToolbarButton.setAttribute('aria-expanded', String(!isCollapsed));
  toggleToolbarButton.textContent = isCollapsed ? 'Expand' : 'Collapse';
}

function getMapPoint(event) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - offsetX) / scale,
    y: (event.clientY - rect.top - offsetY) / scale
  };
}

function createSvgElement(tag, attrs = {}) {
  const element = document.createElementNS(svgNamespace, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function buildShapeElement(shape, preview = false) {
  const shapeColor = shape.color || activeColor;
  const baseAttrs = {
    stroke: shapeColor,
    'stroke-width': preview ? '2.5' : '3',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    fill: 'none',
    opacity: preview ? '0.8' : '1'
  };

  switch (shape.type) {
    case 'text': {
      const left = Math.min(shape.start.x, shape.end.x);
      const top = Math.min(shape.start.y, shape.end.y);
      const width = Math.max(80, Math.abs(shape.end.x - shape.start.x));
      const height = Math.max(44, Math.abs(shape.end.y - shape.start.y));
      const group = createSvgElement('g');
      const box = createSvgElement('rect', {
        x: left,
        y: top,
        width,
        height,
        rx: 8,
        ry: 8,
        fill: hexToRgba(shapeColor, 0.16),
        stroke: shapeColor,
        'stroke-width': preview ? '1.5' : '2',
        opacity: preview ? '0.8' : '1'
      });
      group.appendChild(box);

      const textElement = createSvgElement('text', {
        x: left + 10,
        y: top + 22,
        fill: shapeColor,
        'font-size': '16',
        'font-family': 'Cairo, Segoe UI, sans-serif',
        'font-weight': '700'
      });

      const lines = (shape.text || 'Text').split('\n');
      lines.forEach((line, index) => {
        const tspan = createSvgElement('tspan', {
          x: left + 10,
          dy: index === 0 ? 0 : 18
        });
        tspan.textContent = line;
        textElement.appendChild(tspan);
      });

      group.appendChild(textElement);
      return group;
    }
    case 'line': {
      const line = createSvgElement('line', {
        ...baseAttrs,
        x1: shape.start.x,
        y1: shape.start.y,
        x2: shape.end.x,
        y2: shape.end.y
      });
      return line;
    }
    case 'rect': {
      const left = Math.min(shape.start.x, shape.end.x);
      const top = Math.min(shape.start.y, shape.end.y);
      const width = Math.abs(shape.end.x - shape.start.x);
      const height = Math.abs(shape.end.y - shape.start.y);
      return createSvgElement('rect', {
        ...baseAttrs,
        fill: preview ? hexToRgba(shapeColor, 0.14) : hexToRgba(shapeColor, 0.12),
        x: left,
        y: top,
        width,
        height
      });
    }
    case 'circle': {
      const centerX = (shape.start.x + shape.end.x) / 2;
      const centerY = (shape.start.y + shape.end.y) / 2;
      const radiusX = Math.abs(shape.end.x - shape.start.x) / 2;
      const radiusY = Math.abs(shape.end.y - shape.start.y) / 2;
      return createSvgElement('ellipse', {
        ...baseAttrs,
        fill: preview ? hexToRgba(shapeColor, 0.14) : hexToRgba(shapeColor, 0.12),
        cx: centerX,
        cy: centerY,
        rx: radiusX,
        ry: radiusY
      });
    }
    case 'arrow': {
      const line = createSvgElement('line', {
        ...baseAttrs,
        x1: shape.start.x,
        y1: shape.start.y,
        x2: shape.end.x,
        y2: shape.end.y
      });

      const angle = Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x);
      const headLength = 12;
      const headWidth = 8;
      const arrowX = shape.end.x;
      const arrowY = shape.end.y;
      const leftX = arrowX - headLength * Math.cos(angle - Math.PI / 6);
      const leftY = arrowY - headLength * Math.sin(angle - Math.PI / 6);
      const rightX = arrowX - headLength * Math.cos(angle + Math.PI / 6);
      const rightY = arrowY - headLength * Math.sin(angle + Math.PI / 6);
      const arrowHead = createSvgElement('polygon', {
        points: `${arrowX},${arrowY} ${leftX},${leftY} ${rightX},${rightY}`,
        fill: shapeColor,
        opacity: preview ? '0.8' : '1'
      });

      const group = createSvgElement('g');
      group.appendChild(line);
      group.appendChild(arrowHead);
      return group;
    }
    case 'pen': {
      const polyline = createSvgElement('polyline', {
        ...baseAttrs,
        fill: 'none',
        points: shape.points.map((point) => `${point.x},${point.y}`).join(' ')
      });
      return polyline;
    }
    default:
      return null;
  }
}

function renderAnnotations() {
  annotationLayer.innerHTML = '';
  annotationLayer.appendChild(createSvgElement('defs'));

  shapes.forEach((shape) => {
    const element = buildShapeElement(shape);
    if (element) {
      annotationLayer.appendChild(element);
    }
  });

  if (currentShape) {
    const preview = buildShapeElement(currentShape, true);
    if (preview) {
      annotationLayer.appendChild(preview);
    }
  }

}

function addShape(shape) {
  shapes.push(shape);
  redoStack = [];
  renderAnnotations();
  updateHistoryButtons();
}

function placeCustomPoi(event) {
  if (event.button !== 0) {
    return;
  }

  const point = getMapPoint(event);
  const naturalWidth = image.naturalWidth || 842;
  const naturalHeight = image.naturalHeight || 960;
  const xPercent = clamp((point.x / naturalWidth) * 100, 0, 100);
  const yPercent = clamp((point.y / naturalHeight) * 100, 0, 100);
  const rawName = window.prompt('Enter marker name', 'Custom POI');
  if (rawName === null) {
    return;
  }

  const suggestedName = rawName.trim();
  if (!suggestedName) {
    return;
  }

  let name = suggestedName;
  let suffix = 2;
  while (pois.some((poi) => poi.name === name)) {
    name = `${suggestedName} ${suffix}`;
    suffix += 1;
  }

  pois.push({ name, x: xPercent, y: yPercent, custom: true, color: activeColor });
  visiblePois.add(name);
  toggleAllPois.checked = visiblePois.size === pois.length;
  saveCustomPois();
  renderPois();
}

function updateHistoryButtons() {
  undoButton.disabled = shapes.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function undoShape() {
  if (!shapes.length) {
    return;
  }
  redoStack.push(shapes.pop());
  renderAnnotations();
  updateHistoryButtons();
}

function redoShape() {
  if (!redoStack.length) {
    return;
  }
  shapes.push(redoStack.pop());
  renderAnnotations();
  updateHistoryButtons();
}

function beginShape(event) {
  if (activeTool === 'pan') {
    return;
  }

  event.preventDefault();
  isDrawing = true;
  currentShape = {
    type: activeTool,
    start: getMapPoint(event),
    end: getMapPoint(event),
    points: [],
    color: activeColor
  };

  if (activeTool === 'pen') {
    currentShape.points.push(currentShape.start);
  }
  renderAnnotations();
}

function updateShape(event) {
  if (!isDrawing || !currentShape) {
    return;
  }

  const point = getMapPoint(event);
  if (activeTool === 'pen') {
    currentShape.points.push(point);
  } else {
    currentShape.end = point;
  }
  renderAnnotations();
}

function finishShape() {
  if (!isDrawing || !currentShape) {
    return;
  }

  isDrawing = false;
  const isValid = (() => {
    if (activeTool === 'pen') {
      return currentShape.points.length >= 2;
    }
    if (activeTool === 'text') {
      return Math.abs(currentShape.start.x - currentShape.end.x) >= 8 || Math.abs(currentShape.start.y - currentShape.end.y) >= 8;
    }
    return currentShape.start.x !== currentShape.end.x || currentShape.start.y !== currentShape.end.y;
  })();

  if (isValid) {
    if (activeTool === 'text') {
      const rawText = window.prompt('Enter text for this box', 'Text');
      if (rawText !== null) {
        const trimmedText = rawText.trim();
        if (trimmedText) {
          currentShape.text = trimmedText;
          addShape(currentShape);
        }
      }
    } else {
      addShape(currentShape);
    }
  }
  currentShape = null;
  renderAnnotations();
}

function resetView() {
  fitMap();
}

function getGridBounds() {
  const naturalWidth = image.naturalWidth || 842;
  const naturalHeight = image.naturalHeight || 960;
  const left = naturalWidth * 0.028;
  const top = naturalHeight * 0.024;
  const width = naturalWidth - left;
  const height = naturalHeight - top;

  return { left, top, width, height };
}

function hideHoverLabel() {
  hoveredCell = null;
  if (hoverLabel) {
    hoverLabel.style.display = 'none';
  }
}

function updateHoverCell(event) {
  const rect = viewport.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
    hideHoverLabel();
    return;
  }

  const point = getMapPoint(event);
  const bounds = getGridBounds();
  if (point.x < bounds.left || point.x > bounds.left + bounds.width || point.y < bounds.top || point.y > bounds.top + bounds.height) {
    hideHoverLabel();
    return;
  }

  const localX = point.x - bounds.left;
  const localY = point.y - bounds.top;
  const cellWidth = bounds.width / gridColumns;
  const cellHeight = bounds.height / gridRows;
  const col = Math.min(gridColumns - 1, Math.max(0, Math.floor(localX / cellWidth)));
  const row = Math.min(gridRows - 1, Math.max(0, Math.floor(localY / cellHeight)));
  const sectionWidth = cellWidth / 3;
  const sectionHeight = cellHeight / 3;
  const sectionCol = Math.min(2, Math.max(0, Math.floor((localX - col * cellWidth) / sectionWidth)));
  const sectionRow = Math.min(2, Math.max(0, Math.floor((localY - row * cellHeight) / sectionHeight)));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const sectionIndex = sectionRow * 3 + sectionCol + 1;

  hoveredCell = {
    label: `${letters[col]}${row + 1}-${sectionIndex}`
  };

  // Positioned in screen space (relative to the viewport, not the zoomed map
  // layer) so the label stays a fixed size and never scales with zoom.
  if (hoverLabel) {
    hoverLabel.textContent = hoveredCell.label;
    hoverLabel.style.left = `${event.clientX - rect.left}px`;
    hoverLabel.style.top = `${event.clientY - rect.top}px`;
    hoverLabel.style.display = 'block';
  }
}

function zoomBy(delta, anchor = null) {
  const rect = viewport.getBoundingClientRect();
  const zoomAnchor = anchor || {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };

  const worldX = (zoomAnchor.x - rect.left - offsetX) / scale;
  const worldY = (zoomAnchor.y - rect.top - offsetY) / scale;
  const nextScale = clamp(scale + delta, 0.75, 8);

  offsetX = zoomAnchor.x - rect.left - worldX * nextScale;
  offsetY = zoomAnchor.y - rect.top - worldY * nextScale;
  scale = nextScale;
  updateTransform();
}

function startPan(event) {
  event.preventDefault();
  isDragging = true;
  viewport.classList.add('dragging');
  viewport.style.cursor = 'grabbing';
  startX = event.clientX;
  startY = event.clientY;
  lastX = offsetX;
  lastY = offsetY;
}

viewport.addEventListener('mousedown', (event) => {
  if (event.button === 1) {
    startPan(event);
    return;
  }

  if (activeTool === 'place-marker') {
    event.preventDefault();
    placeCustomPoi(event);
    return;
  }

  if (activeTool === 'pan') {
    startPan(event);
    return;
  }

  beginShape(event);
});

viewport.addEventListener('dragstart', (event) => {
  event.preventDefault();
});

viewport.addEventListener('mouseleave', () => {
  hideHoverLabel();
});

window.addEventListener('selectstart', (event) => {
  event.preventDefault();
});

window.addEventListener('mousemove', (event) => {
  updateHoverCell(event);

  if (isDragging) {
    offsetX = lastX + (event.clientX - startX);
    offsetY = lastY + (event.clientY - startY);
    updateTransform();
    return;
  }

  if (isDrawing) {
    updateShape(event);
  }
});

window.addEventListener('mouseup', () => {
  if (isDrawing) {
    finishShape();
  }

  if (isDragging) {
    isDragging = false;
    viewport.classList.remove('dragging');
    viewport.style.cursor = 'crosshair';
  }
});

viewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  const zoomAmount = event.deltaY > 0 ? -0.15 : 0.15;
  zoomBy(zoomAmount, { x: event.clientX, y: event.clientY });
}, { passive: false });

zoomInButton.addEventListener('click', () => {
  zoomBy(0.2);
});

zoomOutButton.addEventListener('click', () => {
  zoomBy(-0.2);
});

resetButton.addEventListener('click', resetView);

viewport.addEventListener('dblclick', resetView);

toolButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTool(button.dataset.tool));
});

undoButton.addEventListener('click', undoShape);
redoButton.addEventListener('click', redoShape);

toggleAllPois.addEventListener('change', (event) => {
  toggleAll(event.target.checked);
});

if (colorPicker) {
  colorPicker.addEventListener('input', (event) => {
    activeColor = event.target.value;
  });
}

if (togglePoiPanelButton) {
  togglePoiPanelButton.addEventListener('click', togglePoiPanel);
}

if (toggleToolbarButton) {
  toggleToolbarButton.addEventListener('click', toggleToolbar);
}

image.addEventListener('load', fitMap);
window.addEventListener('resize', fitMap);

function updateTopbarHeight() {
  if (!topbar) {
    return;
  }
  const height = topbar.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--topbar-height', `${Math.ceil(height) + 16}px`);
}

updateTopbarHeight();
window.addEventListener('resize', updateTopbarHeight);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(updateTopbarHeight);
}

renderPois();
setActiveTool('pan');
updateHistoryButtons();
fitMap();
