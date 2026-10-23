import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  createGrid,
  createPreset,
  createRandomMap,
  keyToPoint,
  pointKey,
} from "./grid.js";
import { compareAlgorithms, search, summarizeEvent } from "./pathfinding.js";

const ALGORITHM_META = {
  astar: {
    label: "A* 曼哈顿启发式搜索",
    short: "A*",
    note: "Manhattan 距离衡量当前节点到终点的横向与纵向距离之和。",
  },
  dijkstra: {
    label: "Dijkstra 最短路径搜索",
    short: "Dijkstra",
    note: "Dijkstra 只看已付出的代价 g(n)，等价于启发式恒为 0 的 A*。",
  },
  bfs: {
    label: "BFS 广度优先搜索",
    short: "BFS",
    note: "BFS 按层级扩展节点，在单位代价网格上同样能得到最短步数。",
  },
};

const SPEED_DELAYS = [420, 330, 250, 190, 140, 100, 72, 48, 30, 16];
const TOOL_HINTS = {
  wall: "拖动绘制障碍；按住 Shift 拖动可擦除。",
  erase: "拖动擦除障碍。",
  start: "点击网格移动起点。",
  goal: "点击网格移动终点。",
};

const state = {
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  grid: createGrid(DEFAULT_ROWS, DEFAULT_COLS),
  start: { x: 3, y: 10 },
  goal: { x: 32, y: 10 },
  preset: "corridor",
  algorithm: "astar",
  heuristicScale: 1,
  speed: 6,
  tool: "wall",
  events: [],
  result: null,
  eventIndex: 0,
  playing: false,
  painting: false,
  searchMs: 0,
  prefixFrontier: [],
  lastFrame: 0,
  accumulator: 0,
  rafId: 0,
};

const dom = {
  grid: document.querySelector("#pathGrid"),
  runTitle: document.querySelector("#runTitle"),
  runState: document.querySelector("#runState"),
  runStateText: document.querySelector("#runStateText"),
  play: document.querySelector("#playButton"),
  step: document.querySelector("#stepButton"),
  back: document.querySelector("#backButton"),
  reset: document.querySelector("#resetButton"),
  timeline: document.querySelector("#timelineRange"),
  eventCounter: document.querySelector("#eventCounter"),
  speed: document.querySelector("#speedRange"),
  speedValue: document.querySelector("#speedValue"),
  heuristic: document.querySelector("#heuristicRange"),
  heuristicValue: document.querySelector("#heuristicValue"),
  heuristicNote: document.querySelector("#heuristicNote"),
  visited: document.querySelector("#visitedMetric"),
  open: document.querySelector("#openMetric"),
  frontier: document.querySelector("#frontierMetric"),
  path: document.querySelector("#pathMetric"),
  time: document.querySelector("#timeMetric"),
  nodeCoordinate: document.querySelector("#nodeCoordinate"),
  gValue: document.querySelector("#gValue"),
  hValue: document.querySelector("#hValue"),
  fValue: document.querySelector("#fValue"),
  eventType: document.querySelector("#eventType"),
  eventList: document.querySelector("#eventList"),
  compareButton: document.querySelector("#compareButton"),
  compareDialog: document.querySelector("#compareDialog"),
  compareRows: document.querySelector("#compareRows"),
  compareInsight: document.querySelector("#compareInsight"),
  closeCompare: document.querySelector("#closeCompareButton"),
  closeCompareBottom: document.querySelector("#closeCompareButtonBottom"),
  applyBest: document.querySelector("#applyBestButton"),
  presetList: document.querySelector("#presetList"),
  algorithmTabs: document.querySelector(".algorithm-tabs"),
  toolButtons: document.querySelector(".tool-grid"),
};

function createGridCells() {
  const fragment = document.createDocumentFragment();
  dom.grid.style.setProperty("--cols", state.cols);
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-rowindex", String(y + 1));
      cell.setAttribute("aria-colindex", String(x + 1));
      fragment.append(cell);
    }
  }
  dom.grid.replaceChildren(fragment);
}

function getCell(x, y) {
  return dom.grid.children[y * state.cols + x];
}

function setState(text, tone = "idle") {
  dom.runState.dataset.tone = tone;
  dom.runStateText.textContent = text;
}

function pausePlayback() {
  state.playing = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  updatePlayButton();
}

function updatePlayButton() {
  const icon = state.playing ? "pause" : "play";
  dom.play.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
  dom.play.setAttribute("aria-label", state.playing ? "暂停搜索" : "开始搜索");
  dom.play.title = state.playing ? "暂停搜索" : "开始搜索";
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.9 } });
}

function clearDynamicClasses() {
  for (const cell of dom.grid.children) {
    cell.classList.remove(
      "is-open",
      "is-closed",
      "is-current",
      "is-path",
      "is-wall",
      "is-start",
      "is-goal",
    );
    cell.removeAttribute("data-mark");
  }
}

function renderBaseMap() {
  clearDynamicClasses();
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      const cell = getCell(x, y);
      if (state.grid[y][x]) cell.classList.add("is-wall");
    }
  }
  getCell(state.start.x, state.start.y).classList.add("is-start");
  getCell(state.goal.x, state.goal.y).classList.add("is-goal");
}

function resetRun({ keepStatus = false } = {}) {
  pausePlayback();
  state.events = [];
  state.result = null;
  state.eventIndex = 0;
  state.searchMs = 0;
  state.prefixFrontier = [];
  dom.timeline.max = "0";
  dom.timeline.value = "0";
  dom.timeline.disabled = true;
  dom.eventCounter.textContent = "0 / 0";
  dom.eventType.textContent = "INIT";
  dom.eventList.innerHTML = '<li class="is-empty">等待运行</li>';
  dom.nodeCoordinate.textContent = "—";
  dom.gValue.textContent = "0";
  dom.hValue.textContent = "0";
  dom.fValue.textContent = "0";
  dom.visited.textContent = "0";
  dom.open.textContent = "0";
  dom.frontier.textContent = "0";
  dom.path.textContent = "—";
  dom.time.textContent = "0.0 ms";
  renderBaseMap();
  if (!keepStatus) setState("准备就绪", "idle");
  updateTransportState();
}

function updateTransportState() {
  const hasEvents = state.events.length > 0;
  const atEnd = hasEvents && state.eventIndex >= state.events.length - 1;
  dom.step.disabled = atEnd;
  dom.back.disabled = !hasEvents || state.eventIndex <= 0;
  dom.play.disabled = false;
}

function ensureSearch() {
  if (state.events.length > 0) return;
  const started = performance.now();
  state.result = search(state.grid, state.start, state.goal, {
    algorithm: state.algorithm,
    heuristicScale: state.heuristicScale,
  });
  state.searchMs = performance.now() - started;
  state.events = state.result.events;
  state.eventIndex = 0;

  let maxFrontier = 0;
  state.prefixFrontier = state.events.map((event) => {
    maxFrontier = Math.max(maxFrontier, event.open.length);
    return maxFrontier;
  });

  dom.timeline.max = String(Math.max(0, state.events.length - 1));
  dom.timeline.value = "0";
  dom.timeline.disabled = state.events.length === 0;
  renderEvent();
}

function togglePlayback() {
  if (state.playing) {
    pausePlayback();
    setState("已暂停", "idle");
    return;
  }
  ensureSearch();
  if (state.events.length <= 1 || (state.eventIndex >= state.events.length - 1 && state.result?.reason !== "found")) {
    renderEvent();
    return;
  }
  if (state.eventIndex >= state.events.length - 1) {
    state.eventIndex = 0;
  }
  state.playing = true;
  state.lastFrame = performance.now();
  state.accumulator = 0;
  setState("搜索中", "running");
  updatePlayButton();
  updateTransportState();
  state.rafId = requestAnimationFrame(playFrame);
}

function playFrame(now) {
  if (!state.playing) return;
  const elapsed = now - state.lastFrame;
  state.lastFrame = now;
  state.accumulator += elapsed;
  const delay = SPEED_DELAYS[state.speed - 1] ?? 100;

  let changed = false;
  while (state.accumulator >= delay && state.eventIndex < state.events.length - 1) {
    state.accumulator -= delay;
    state.eventIndex += 1;
    changed = true;
  }
  if (changed) renderEvent();

  if (state.eventIndex >= state.events.length - 1) {
    state.playing = false;
    updatePlayButton();
    updateTransportState();
    renderEvent();
    return;
  }
  state.rafId = requestAnimationFrame(playFrame);
}

function stepForward() {
  pausePlayback();
  ensureSearch();
  if (state.eventIndex < state.events.length - 1) {
    state.eventIndex += 1;
    renderEvent();
  }
}

function stepBack() {
  pausePlayback();
  if (state.eventIndex > 0) {
    state.eventIndex -= 1;
    renderEvent();
  }
}

function getRecentEvents(index, count = 4) {
  const start = Math.max(0, index - count + 1);
  return state.events.slice(start, index + 1);
}

function renderEvent() {
  if (state.events.length === 0) return;
  const event = state.events[state.eventIndex];
  if (!event) return;

  clearDynamicClasses();
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      if (state.grid[y][x]) getCell(x, y).classList.add("is-wall");
    }
  }

  for (const key of event.open) {
    const point = keyToPoint(key);
    getCell(point.x, point.y)?.classList.add("is-open");
  }
  for (const key of event.closed) {
    const point = keyToPoint(key);
    getCell(point.x, point.y)?.classList.add("is-closed");
  }
  for (const key of event.path) {
    const point = keyToPoint(key);
    getCell(point.x, point.y)?.classList.add("is-path");
  }
  if (event.current) {
    const point = keyToPoint(event.current);
    getCell(point.x, point.y)?.classList.add("is-current");
  }

  getCell(state.start.x, state.start.y).classList.add("is-start");
  getCell(state.goal.x, state.goal.y).classList.add("is-goal");

  const summary = summarizeEvent(state.events, state.eventIndex, state.algorithm);
  dom.visited.textContent = String(summary.visited);
  dom.open.textContent = String(summary.open);
  dom.frontier.textContent = String(state.prefixFrontier[state.eventIndex] ?? summary.frontierMax);
  dom.path.textContent = Number.isFinite(summary.pathLength) ? String(summary.pathLength) : "—";
  dom.time.textContent = `${state.searchMs.toFixed(1)} ms`;
  dom.timeline.value = String(state.eventIndex);
  dom.eventCounter.textContent = `${state.eventIndex + 1} / ${state.events.length}`;
  dom.eventType.textContent = event.type.toUpperCase();

  if (state.algorithm !== "bfs" && event.current) {
    dom.nodeCoordinate.textContent = `(${event.point.x}, ${event.point.y})`;
    dom.gValue.textContent = String(event.g);
    dom.hValue.textContent = Number(event.h.toFixed(1)).toString();
    dom.fValue.textContent = Number(event.f.toFixed(1)).toString();
  } else {
    dom.nodeCoordinate.textContent = event.current ? `(${event.point.x}, ${event.point.y})` : "—";
    dom.gValue.textContent = String(event.g);
    dom.hValue.textContent = "0";
    dom.fValue.textContent = String(event.g);
  }

  const recent = getRecentEvents(state.eventIndex);
  dom.eventList.innerHTML = recent
    .map((item) => {
      const point = item.point ? `(${item.point.x},${item.point.y})` : "—";
      return `<li><span class="event-code">${item.type.toUpperCase()}</span><span>节点 ${point}</span><span class="event-value">f ${Number(item.f.toFixed(1))}</span></li>`;
    })
    .join("");

  if (event.type === "path") {
    setState("已找到最短路径", "found");
  } else if (event.type === "no-path") {
    setState("未找到可行路径", "error");
  } else if (!state.playing) {
    setState(`回放 ${state.eventIndex + 1} / ${state.events.length}`, "idle");
  }
  updateTransportState();
}

function updateAlgorithmUI() {
  const meta = ALGORITHM_META[state.algorithm];
  dom.runTitle.textContent = meta.label;
  dom.heuristicNote.textContent = meta.note;
  dom.heuristic.disabled = state.algorithm !== "astar";
  for (const tab of dom.algorithmTabs.querySelectorAll("[data-algorithm]")) {
    const active = tab.dataset.algorithm === state.algorithm;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
}

function applyPreset(name) {
  const preset = createPreset(name, state.rows, state.cols);
  state.preset = name;
  state.grid = preset.grid;
  state.start = preset.start;
  state.goal = preset.goal;
  for (const button of dom.presetList.querySelectorAll("[data-preset]")) {
    button.classList.toggle("is-active", button.dataset.preset === name);
  }
  resetRun();
}

function randomizeMap() {
  const random = createRandomMap(state.rows, state.cols, 0.23);
  state.grid = random.grid;
  state.start = random.start;
  state.goal = random.goal;
  for (const button of dom.presetList.querySelectorAll("[data-preset]")) {
    button.classList.remove("is-active");
  }
  resetRun();
}

function canPlace(point) {
  return (
    point.x >= 0 &&
    point.x < state.cols &&
    point.y >= 0 &&
    point.y < state.rows &&
    !state.grid[point.y][point.x]
  );
}

function paintCell(x, y, eraseOverride = false) {
  const point = { x, y };
  const activeTool = eraseOverride ? "erase" : state.tool;
  if (activeTool === "start") {
    if (canPlace(point) && pointKey(point) !== pointKey(state.goal)) {
      state.start = point;
      resetRun({ keepStatus: true });
    }
    return;
  }
  if (activeTool === "goal") {
    if (canPlace(point) && pointKey(point) !== pointKey(state.start)) {
      state.goal = point;
      resetRun({ keepStatus: true });
    }
    return;
  }
  if (pointKey(point) === pointKey(state.start) || pointKey(point) === pointKey(state.goal)) return;
  const blocked = activeTool === "wall";
  if (state.grid[y][x] === (blocked ? 1 : 0)) return;
  state.grid[y][x] = blocked ? 1 : 0;
  resetRun({ keepStatus: true });
}

function pointFromEvent(event) {
  const target = event.target.closest?.(".cell");
  if (!target) return null;
  return { x: Number(target.dataset.x), y: Number(target.dataset.y) };
}

function handlePointerDown(event) {
  if (event.button !== 0 && event.button !== 2) return;
  const point = pointFromEvent(event);
  if (!point) return;
  state.painting = true;
  dom.grid.setPointerCapture?.(event.pointerId);
  paintCell(point.x, point.y, event.button === 2 || event.shiftKey);
}

function handlePointerMove(event) {
  if (!state.painting) return;
  const point = pointFromEvent(event);
  if (point) paintCell(point.x, point.y, event.shiftKey || event.buttons === 2);
}

function handlePointerUp(event) {
  state.painting = false;
  if (dom.grid.hasPointerCapture?.(event.pointerId)) dom.grid.releasePointerCapture(event.pointerId);
}

function showComparison() {
  const results = compareAlgorithms(state.grid, state.start, state.goal, state.heuristicScale);
  const bestExpanded = Math.min(
    ...results.filter((item) => item.reason === "found").map((item) => item.expanded),
  );

  dom.compareRows.innerHTML = results
    .map((item) => {
      const best = item.reason === "found" && item.expanded === bestExpanded;
      const cost = Number.isFinite(item.pathLength) ? item.pathLength : "—";
      return `
        <tr class="compare-row${best ? " is-best" : ""}">
          <td>${ALGORITHM_META[item.algorithm].short}</td>
          <td class="${item.reason === "found" ? "status-ok" : "status-fail"}">${item.reason === "found" ? "路径已找到" : "无解"}</td>
          <td>${cost}</td>
          <td>${item.expanded}</td>
          <td>${item.events}</td>
        </tr>
      `;
    })
    .join("");

  const astar = results.find((item) => item.algorithm === "astar");
  const dijkstra = results.find((item) => item.algorithm === "dijkstra");
  if (astar?.reason === "found" && dijkstra?.reason === "found") {
    const saved = dijkstra.expanded - astar.expanded;
    const ratio = dijkstra.expanded ? Math.round((saved / dijkstra.expanded) * 100) : 0;
    dom.compareInsight.textContent =
      saved > 0
        ? `本次地图上，A* 比 Dijkstra 少访问 ${saved} 个节点（减少 ${ratio}%），两者路径代价均为 ${astar.pathLength}。`
        : `本次地图上 A* 与 Dijkstra 的访问规模接近；启发式的收益取决于障碍布局与终点方向。`;
  } else {
    dom.compareInsight.textContent = "当前地图没有可行路径，三种算法都无法到达终点。";
  }

  dom.compareDialog.showModal();
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.9 } });
}

function bindEvents() {
  dom.play.addEventListener("click", togglePlayback);
  dom.step.addEventListener("click", stepForward);
  dom.back.addEventListener("click", stepBack);
  dom.reset.addEventListener("click", () => resetRun());
  dom.timeline.addEventListener("input", () => {
    pausePlayback();
    ensureSearch();
    state.eventIndex = Number(dom.timeline.value);
    renderEvent();
  });
  dom.speed.addEventListener("input", () => {
    state.speed = Number(dom.speed.value);
    dom.speedValue.textContent = String(state.speed).padStart(2, "0");
  });
  dom.heuristic.addEventListener("input", () => {
    state.heuristicScale = Number(dom.heuristic.value);
    dom.heuristicValue.textContent = `${state.heuristicScale.toFixed(1)}×`;
    resetRun({ keepStatus: true });
  });
  dom.algorithmTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-algorithm]");
    if (!button) return;
    state.algorithm = button.dataset.algorithm;
    updateAlgorithmUI();
    resetRun();
  });
  dom.presetList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) applyPreset(button.dataset.preset);
  });
  dom.toolButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tool]");
    if (!button) return;
    state.tool = button.dataset.tool;
    for (const tool of dom.toolButtons.querySelectorAll("[data-tool]")) {
      const active = tool.dataset.tool === state.tool;
      tool.classList.toggle("is-active", active);
      tool.setAttribute("aria-pressed", String(active));
    }
    dom.heuristicNote.textContent = TOOL_HINTS[state.tool];
  });
  dom.grid.addEventListener("pointerdown", handlePointerDown);
  dom.grid.addEventListener("pointermove", handlePointerMove);
  dom.grid.addEventListener("pointerup", handlePointerUp);
  dom.grid.addEventListener("pointercancel", handlePointerUp);
  dom.grid.addEventListener("contextmenu", (event) => event.preventDefault());
  dom.compareButton.addEventListener("click", showComparison);
  dom.closeCompare.addEventListener("click", () => dom.compareDialog.close());
  dom.closeCompareBottom.addEventListener("click", () => dom.compareDialog.close());
  dom.applyBest.addEventListener("click", () => {
    dom.compareDialog.close();
    state.algorithm = "astar";
    updateAlgorithmUI();
    resetRun();
    togglePlayback();
  });
  dom.compareDialog.addEventListener("click", (event) => {
    if (event.target === dom.compareDialog) dom.compareDialog.close();
  });
}

function initialize() {
  createGridCells();
  bindEvents();
  applyPreset(state.preset);
  updateAlgorithmUI();
  updatePlayButton();
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });

  const params = new URLSearchParams(window.location.search);
  if (params.has("random")) randomizeMap();
  if (params.has("rooms")) applyPreset("rooms");
  if (params.has("demo")) {
    setTimeout(() => togglePlayback(), 250);
  }
}

window.__pathlab = {
  state,
  start: togglePlayback,
  step: stepForward,
  back: stepBack,
  reset: resetRun,
  compare: showComparison,
  applyPreset,
  randomizeMap,
};

initialize();
