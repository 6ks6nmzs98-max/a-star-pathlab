import { isInside, keyToPoint, pointKey, samePoint } from "./grid.js";

class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  push(value) {
    this.items.push(value);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.items[parent], value) <= 0) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = value;
  }

  pop() {
    if (this.items.length === 0) return null;
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length === 0) return root;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      let child = left;
      if (right < this.items.length && this.compare(this.items[right], this.items[left]) < 0) {
        child = right;
      }
      if (this.compare(last, this.items[child]) <= 0) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return root;
  }
}

const DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstructPath(cameFrom, start, goal) {
  const goalKey = pointKey(goal);
  const startKey = pointKey(start);
  if (!cameFrom.has(goalKey) && startKey !== goalKey) return [];

  const path = [goalKey];
  let current = goalKey;
  while (current !== startKey) {
    current = cameFrom.get(current);
    if (!current) return [];
    path.push(current);
  }
  return path.reverse();
}

function snapshot({ open, closed, current = null, path = [], type, point = null, g = 0, h = 0, f = 0 }) {
  return {
    type,
    point,
    g,
    h,
    f,
    open: [...open],
    closed: [...closed],
    current: current ? pointKey(current) : null,
    path: [...path],
  };
}

/**
 * Runs one of three grid searches and returns replayable UI events.
 * Grid cells are blocked when truthy. Movement is four-directional with unit cost.
 */
export function search(grid, start, goal, options = {}) {
  const algorithm = options.algorithm ?? "astar";
  const heuristicScale = Number.isFinite(options.heuristicScale) ? options.heuristicScale : 1;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  if (!start || !goal || !isInside(start, rows, cols) || !isInside(goal, rows, cols)) {
    return { algorithm, events: [], path: [], cost: Infinity, expanded: 0, reason: "invalid" };
  }
  if (grid[start.y][start.x] || grid[goal.y][goal.x]) {
    return { algorithm, events: [], path: [], cost: Infinity, expanded: 0, reason: "blocked" };
  }

  const startKey = pointKey(start);
  const goalKey = pointKey(goal);
  const events = [];
  const gScore = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const openKeys = new Map([[startKey, start]]);
  const discovered = new Set([startKey]);
  const heap = new MinHeap((a, b) => {
    const primary = a.priority - b.priority;
    if (primary !== 0) return primary;
    return a.order - b.order;
  });
  const queue = [{ point: start, g: 0, order: 0 }];
  let queueHead = 0;
  let order = 0;
  let expanded = 0;
  let path = [];

  const heuristic = (point) => {
    if (algorithm === "dijkstra" || algorithm === "bfs") return 0;
    return heuristicScale * manhattan(point, goal);
  };

  if (algorithm !== "bfs") {
    heap.push({
      point: start,
      g: 0,
      h: heuristic(start),
      priority: heuristic(start),
      order: order++,
    });
  }

  events.push(snapshot({ type: "init", open: openKeys.keys(), closed }));

  while (algorithm === "bfs" ? queueHead < queue.length : heap.size > 0) {
    let entry;
    if (algorithm === "bfs") {
      entry = queue[queueHead++];
    } else {
      entry = heap.pop();
      if (entry.g !== gScore.get(pointKey(entry.point))) continue;
    }

    const point = entry.point;
    const currentKey = pointKey(point);
    if (closed.has(currentKey)) continue;

    closed.add(currentKey);
    openKeys.delete(currentKey);
    expanded += 1;
    const currentG = gScore.get(currentKey) ?? 0;
    const currentH = heuristic(point);
    events.push(
      snapshot({
        type: "visit",
        open: openKeys.keys(),
        closed,
        current: point,
        point,
        g: currentG,
        h: currentH,
        f: currentG + currentH,
      }),
    );

    if (currentKey === goalKey) {
      path = reconstructPath(cameFrom, start, goal);
      events.push(
        snapshot({
          type: "path",
          open: openKeys.keys(),
          closed,
          current: point,
          path,
          point,
          g: currentG,
          h: currentH,
          f: currentG + currentH,
        }),
      );
      return {
        algorithm,
        events,
        path,
        cost: currentG,
        expanded,
        reason: "found",
      };
    }

    for (const direction of DIRECTIONS) {
      const neighbor = { x: point.x + direction.x, y: point.y + direction.y };
      if (!isInside(neighbor, rows, cols) || grid[neighbor.y][neighbor.x]) continue;
      const neighborKey = pointKey(neighbor);
      if (closed.has(neighborKey)) continue;

      const tentativeG = currentG + 1;
      if (algorithm === "bfs") {
        if (discovered.has(neighborKey)) continue;
        discovered.add(neighborKey);
        gScore.set(neighborKey, tentativeG);
        cameFrom.set(neighborKey, currentKey);
        openKeys.set(neighborKey, neighbor);
        queue.push({ point: neighbor, g: tentativeG });
      } else {
        const knownG = gScore.get(neighborKey);
        if (knownG !== undefined && tentativeG >= knownG) continue;
        gScore.set(neighborKey, tentativeG);
        cameFrom.set(neighborKey, currentKey);
        openKeys.set(neighborKey, neighbor);
        const h = heuristic(neighbor);
        heap.push({
          point: neighbor,
          g: tentativeG,
          h,
          priority: algorithm === "dijkstra" ? tentativeG : tentativeG + h,
          order: order++,
        });
      }
    }
  }

  events.push(snapshot({ type: "no-path", open: [], closed }));
  return { algorithm, events, path: [], cost: Infinity, expanded, reason: "no-path" };
}

export function compareAlgorithms(grid, start, goal, heuristicScale = 1) {
  return ["astar", "dijkstra", "bfs"].map((algorithm) => {
    const result = search(grid, start, goal, { algorithm, heuristicScale });
    return {
      algorithm,
      pathLength: result.cost,
      expanded: result.expanded,
      events: result.events.length,
      reason: result.reason,
    };
  });
}

export function summarizeEvent(events, index, algorithm) {
  const safeIndex = Math.max(0, Math.min(index, events.length - 1));
  const event = events[safeIndex] ?? null;
  let maxFrontier = 0;
  let pathLength = Infinity;
  for (let i = 0; i <= safeIndex; i += 1) {
    maxFrontier = Math.max(maxFrontier, events[i]?.open?.length ?? 0);
    if (events[i]?.path?.length > 1) pathLength = events[i].path.length - 1;
  }
  return {
    algorithm,
    step: event,
    open: event?.open?.length ?? 0,
    visited: event?.closed?.length ?? 0,
    frontierMax: maxFrontier,
    pathLength,
    current: event?.current ? keyToPoint(event.current) : null,
  };
}

export { manhattan, reconstructPath, samePoint };
