export const DEFAULT_COLS = 36;
export const DEFAULT_ROWS = 22;

export function createGrid(rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

export function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

export function pointKey(point) {
  return `${point.x},${point.y}`;
}

export function keyToPoint(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

export function samePoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

export function isInside(point, rows, cols) {
  return point.y >= 0 && point.y < rows && point.x >= 0 && point.x < cols;
}

export function setWall(grid, x, y, blocked = true) {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return grid;
  grid[y][x] = blocked ? 1 : 0;
  return grid;
}

function addRect(grid, x1, y1, x2, y2) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) {
      setWall(grid, x, y);
    }
  }
}

export const PRESETS = {
  corridor: {
    label: "分段走廊",
    start: { x: 4, y: 11 },
    goal: { x: 31, y: 11 },
  },
  fork: {
    label: "双路径",
    start: { x: 4, y: 11 },
    goal: { x: 31, y: 11 },
  },
  rooms: {
    label: "房间迷宫",
    start: { x: 3, y: 3 },
    goal: { x: 32, y: 18 },
  },
};

export function createPreset(name = "corridor", rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
  const grid = createGrid(rows, cols);
  const preset = PRESETS[name] ?? PRESETS.corridor;

  if (name === "corridor") {
    addRect(grid, 10, 2, 10, 15);
    addRect(grid, 10, 17, 10, rows - 3);
    addRect(grid, 19, 4, 19, rows - 3);
    addRect(grid, 27, 2, 27, 16);
    addRect(grid, 14, 8, 23, 8);
  }

  if (name === "fork") {
    addRect(grid, 11, 3, 11, rows - 4);
    addRect(grid, 21, 3, 21, rows - 4);
    addRect(grid, 11, 3, 21, 3);
    addRect(grid, 11, 18, 21, 18);
    addRect(grid, 16, 8, 16, 13);
    addRect(grid, 16, 8, 20, 8);
    addRect(grid, 16, 13, 20, 13);
  }

  if (name === "rooms") {
    addRect(grid, 7, 1, 7, 13);
    addRect(grid, 7, 17, 7, rows - 2);
    addRect(grid, 14, 4, 14, rows - 2);
    addRect(grid, 21, 1, 21, 17);
    addRect(grid, 28, 4, 28, rows - 2);
    addRect(grid, 7, 7, 14, 7);
    addRect(grid, 21, 12, 28, 12);
    addRect(grid, 14, 17, 21, 17);
  }

  const start = { ...preset.start };
  const goal = { ...preset.goal };
  grid[start.y][start.x] = 0;
  grid[goal.y][goal.x] = 0;

  return { grid, start, goal, label: preset.label };
}

export function createRandomMap(
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS,
  density = 0.25,
  random = Math.random,
) {
  const grid = createGrid(rows, cols);
  const start = { x: 2, y: Math.floor(rows / 2) };
  const goal = { x: cols - 3, y: Math.floor(rows / 2) };
  const protectedCells = new Set([
    pointKey(start),
    pointKey(goal),
    pointKey({ x: start.x + 1, y: start.y }),
    pointKey({ x: goal.x - 1, y: goal.y }),
  ]);

  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      if (!protectedCells.has(pointKey({ x, y })) && random() < density) {
        grid[y][x] = 1;
      }
    }
  }

  return { grid, start, goal, label: "随机障碍" };
}
