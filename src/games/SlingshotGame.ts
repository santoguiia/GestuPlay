import type { NormalizedLandmarkList } from "@mediapipe/hands";
import type { IGestuGame } from "../core/IGestuGame";

const THUMB_TIP = 4;
const INDEX_TIP = 8;

const PINCH_CLOSE_THRESHOLD = 0.06;
const PINCH_OPEN_THRESHOLD = 0.095;
const PINCH_STABLE_FRAMES = 3;

const BUBBLE_RADIUS = 22;
const GRID_COLS = 12;
const GRID_ROWS = 9;
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);
const SHOT_SPEED = 11.5;

type BubbleColor = "red" | "blue" | "green" | "yellow" | "purple" | "orange";

const COLORS: Record<BubbleColor, string> = {
  red: "#ef5350",
  blue: "#42a5f5",
  green: "#66bb6a",
  yellow: "#ffee58",
  purple: "#ab47bc",
  orange: "#ffa726",
};

const COLOR_LIST: BubbleColor[] = ["red", "blue", "green", "yellow", "purple", "orange"];

interface Vec2 {
  x: number;
  y: number;
}

interface Bubble {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  color: BubbleColor;
  active: boolean;
}

interface Shot {
  pos: Vec2;
  vel: Vec2;
  color: BubbleColor;
  active: boolean;
}

export class SlingshotGame implements IGestuGame {
  private canvas!: HTMLCanvasElement;
  private bubbles: Bubble[] = [];
  private score = 0;

  private anchor: Vec2 = { x: 0, y: 0 };
  private aimPoint: Vec2 | null = null;

  private pinchFiltered = PINCH_OPEN_THRESHOLD;
  private pinchClosed = false;
  private pinchCloseCounter = 0;
  private pinchOpenCounter = 0;
  private wasPinchingToAim = false;

  private currentColor: BubbleColor = "blue";
  private nextColor: BubbleColor = "red";

  private shot: Shot = {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    color: "blue",
    active: false,
  };

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.anchor = { x: canvas.width / 2, y: canvas.height - 90 };
    this.shot.pos = { ...this.anchor };
    this.spawnGrid();
  }

  update(landmarks: NormalizedLandmarkList | null): void {
    this.anchor = { x: this.canvas.width / 2, y: this.canvas.height - 90 };
    if (!this.shot.active) this.shot.pos = { ...this.anchor };
    this.updatePinch(landmarks);
    this.updateAiming(landmarks);
    this.updateShot();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawBackdrop(ctx);
    this.drawGrid(ctx);
    this.drawAimGuide(ctx);
    this.drawLauncher(ctx);
    this.drawShot(ctx);
    this.drawHud(ctx);
  }

  destroy(): void {}

  private updatePinch(landmarks: NormalizedLandmarkList | null): void {
    if (!landmarks) {
      this.pinchClosed = false;
      this.pinchCloseCounter = 0;
      this.pinchOpenCounter = 0;
      this.pinchFiltered = PINCH_OPEN_THRESHOLD;
      return;
    }
    const raw = Math.hypot(
      landmarks[THUMB_TIP].x - landmarks[INDEX_TIP].x,
      landmarks[THUMB_TIP].y - landmarks[INDEX_TIP].y
    );
    this.pinchFiltered = this.pinchFiltered * 0.68 + raw * 0.32;

    if (!this.pinchClosed) {
      if (this.pinchFiltered < PINCH_CLOSE_THRESHOLD) {
        this.pinchCloseCounter++;
        this.pinchOpenCounter = 0;
        if (this.pinchCloseCounter >= PINCH_STABLE_FRAMES) {
          this.pinchClosed = true;
          this.pinchCloseCounter = 0;
        }
      } else {
        this.pinchCloseCounter = 0;
      }
    } else {
      if (this.pinchFiltered > PINCH_OPEN_THRESHOLD) {
        this.pinchOpenCounter++;
        this.pinchCloseCounter = 0;
        if (this.pinchOpenCounter >= PINCH_STABLE_FRAMES) {
          this.pinchClosed = false;
          this.pinchOpenCounter = 0;
        }
      } else {
        this.pinchOpenCounter = 0;
      }
    }
  }

  private updateAiming(landmarks: NormalizedLandmarkList | null): void {
    if (this.shot.active) return;
    if (!landmarks) {
      this.aimPoint = null;
      this.wasPinchingToAim = false;
      return;
    }
    const thumb = this.mapLandmark(landmarks[THUMB_TIP]);
    const index = this.mapLandmark(landmarks[INDEX_TIP]);
    const midpoint = { x: (thumb.x + index.x) * 0.5, y: (thumb.y + index.y) * 0.5 };

    if (this.pinchClosed) {
      this.aimPoint = midpoint;
      this.wasPinchingToAim = true;
    } else if (this.wasPinchingToAim) {
      this.launchShot(this.aimPoint ?? midpoint);
      this.wasPinchingToAim = false;
      this.aimPoint = null;
    } else {
      this.aimPoint = midpoint;
    }
  }

  private launchShot(target: Vec2): void {
    let dx = target.x - this.anchor.x;
    let dy = target.y - this.anchor.y;
    if (dy > -10) dy = -10;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    this.shot = {
      pos: { ...this.anchor },
      vel: { x: dx * SHOT_SPEED, y: dy * SHOT_SPEED },
      color: this.currentColor,
      active: true,
    };
    this.currentColor = this.nextColor;
    this.nextColor = this.randomColor();
  }

  private updateShot(): void {
    if (!this.shot.active) return;
    this.shot.pos.x += this.shot.vel.x;
    this.shot.pos.y += this.shot.vel.y;

    if (this.shot.pos.x <= BUBBLE_RADIUS) {
      this.shot.pos.x = BUBBLE_RADIUS;
      this.shot.vel.x *= -1;
    } else if (this.shot.pos.x >= this.canvas.width - BUBBLE_RADIUS) {
      this.shot.pos.x = this.canvas.width - BUBBLE_RADIUS;
      this.shot.vel.x *= -1;
    }

    const ceilingY = BUBBLE_RADIUS + 6;
    if (this.shot.pos.y <= ceilingY || this.collidesWithAnyBubble(this.shot.pos)) {
      this.attachShot();
    }
  }

  private attachShot(): void {
    const cell = this.closestFreeCell(this.shot.pos);
    if (!cell) {
      this.shot.active = false;
      this.shot.pos = { ...this.anchor };
      return;
    }

    const { x, y } = this.gridToCanvas(cell.row, cell.col);
    const newBubble: Bubble = {
      id: `${Date.now()}-${Math.random()}`,
      row: cell.row,
      col: cell.col,
      x,
      y,
      color: this.shot.color,
      active: true,
    };
    this.bubbles.push(newBubble);

    this.resolveMatches(newBubble);

    this.shot.active = false;
    this.shot.pos = { ...this.anchor };
  }

  private resolveMatches(start: Bubble): void {
    const cluster = this.collectCluster(start, start.color);
    if (cluster.length >= 3) {
      for (const bubble of cluster) bubble.active = false;
      this.score += cluster.length * 100;
      this.removeFloatingClusters();
    }
    if (this.bubbles.filter((b) => b.active).length < 8) {
      this.spawnGrid();
    }
  }

  private removeFloatingClusters(): void {
    const connected = new Set<string>();
    const queue: Bubble[] = this.bubbles.filter((b) => b.active && b.row === 0);
    queue.forEach((b) => connected.add(b.id));

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = this.activeNeighbors(curr);
      for (const n of neighbors) {
        if (!connected.has(n.id)) {
          connected.add(n.id);
          queue.push(n);
        }
      }
    }

    let dropped = 0;
    for (const bubble of this.bubbles) {
      if (bubble.active && !connected.has(bubble.id)) {
        bubble.active = false;
        dropped++;
      }
    }
    if (dropped > 0) this.score += dropped * 50;
  }

  private collectCluster(start: Bubble, color: BubbleColor): Bubble[] {
    const visited = new Set<string>();
    const queue = [start];
    const result: Bubble[] = [];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr.id) || !curr.active || curr.color !== color) continue;
      visited.add(curr.id);
      result.push(curr);
      queue.push(...this.activeNeighbors(curr));
    }
    return result;
  }

  private activeNeighbors(bubble: Bubble): Bubble[] {
    const odd = bubble.row % 2 !== 0;
    const offsets = odd
      ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
      : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    const result: Bubble[] = [];

    for (const [dr, dc] of offsets) {
      const r = bubble.row + dr;
      const c = bubble.col + dc;
      const neighbor = this.bubbles.find((b) => b.active && b.row === r && b.col === c);
      if (neighbor) result.push(neighbor);
    }
    return result;
  }

  private closestFreeCell(pos: Vec2): { row: number; col: number } | null {
    const roughRow = Math.max(0, Math.min(GRID_ROWS - 1, Math.round((pos.y - BUBBLE_RADIUS) / ROW_HEIGHT)));
    const roughCol = this.colFromX(pos.x, roughRow);

    let best: { row: number; col: number } | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (let r = Math.max(0, roughRow - 2); r <= Math.min(GRID_ROWS - 1, roughRow + 2); r++) {
      const maxCols = r % 2 === 0 ? GRID_COLS : GRID_COLS - 1;
      for (let c = Math.max(0, roughCol - 2); c <= Math.min(maxCols - 1, roughCol + 2); c++) {
        if (this.isCellOccupied(r, c)) continue;
        const p = this.gridToCanvas(r, c);
        const d = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = { row: r, col: c };
        }
      }
    }
    return best;
  }

  private collidesWithAnyBubble(pos: Vec2): boolean {
    return this.bubbles.some(
      (b) => b.active && Math.hypot(pos.x - b.x, pos.y - b.y) <= BUBBLE_RADIUS * 2 - 2
    );
  }

  private spawnGrid(): void {
    this.bubbles = [];
    const rowsToFill = 6;
    for (let row = 0; row < rowsToFill; row++) {
      const cols = row % 2 === 0 ? GRID_COLS : GRID_COLS - 1;
      for (let col = 0; col < cols; col++) {
        if (Math.random() < 0.06) continue;
        const { x, y } = this.gridToCanvas(row, col);
        this.bubbles.push({
          id: `${row}-${col}-${Math.random()}`,
          row,
          col,
          x,
          y,
          color: this.randomColor(),
          active: true,
        });
      }
    }
  }

  private randomColor(): BubbleColor {
    return COLOR_LIST[Math.floor(Math.random() * COLOR_LIST.length)];
  }

  private gridToCanvas(row: number, col: number): Vec2 {
    const rowWidth = GRID_COLS * BUBBLE_RADIUS * 2;
    const startX = (this.canvas.width - rowWidth) / 2 + BUBBLE_RADIUS;
    const x = startX + col * (BUBBLE_RADIUS * 2) + (row % 2 !== 0 ? BUBBLE_RADIUS : 0);
    const y = BUBBLE_RADIUS + 8 + row * ROW_HEIGHT;
    return { x, y };
  }

  private colFromX(x: number, row: number): number {
    const rowWidth = GRID_COLS * BUBBLE_RADIUS * 2;
    const startX = (this.canvas.width - rowWidth) / 2 + BUBBLE_RADIUS;
    const shifted = x - startX - (row % 2 !== 0 ? BUBBLE_RADIUS : 0);
    const cols = row % 2 === 0 ? GRID_COLS : GRID_COLS - 1;
    return Math.max(0, Math.min(cols - 1, Math.round(shifted / (BUBBLE_RADIUS * 2))));
  }

  private isCellOccupied(row: number, col: number): boolean {
    return this.bubbles.some((b) => b.active && b.row === row && b.col === col);
  }

  private mapLandmark(point: { x: number; y: number }): Vec2 {
    return {
      x: (1 - point.x) * this.canvas.width,
      y: point.y * this.canvas.height,
    };
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "rgba(8, 14, 28, 0.32)";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    const step = 44;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    for (const bubble of this.bubbles) {
      if (!bubble.active) continue;
      this.drawBubble(ctx, bubble.x, bubble.y, bubble.color, BUBBLE_RADIUS - 1);
    }
  }

  private drawBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    colorKey: BubbleColor,
    radius: number
  ): void {
    const color = COLORS[colorKey];
    const grad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.1, x, y, radius);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.3, color);
    grad.addColorStop(1, this.darken(color, 40));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private darken(hex: string, amount: number): string {
    const n = hex.replace("#", "");
    const r = Math.max(0, parseInt(n.slice(0, 2), 16) - amount);
    const g = Math.max(0, parseInt(n.slice(2, 4), 16) - amount);
    const b = Math.max(0, parseInt(n.slice(4, 6), 16) - amount);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private drawAimGuide(ctx: CanvasRenderingContext2D): void {
    if (!this.aimPoint || this.shot.active) return;
    const dx = this.aimPoint.x - this.anchor.x;
    const dy = this.aimPoint.y - this.anchor.y;
    if (dy > -4) return;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(this.anchor.x, this.anchor.y);
    ctx.lineTo(this.anchor.x + ux * 280, this.anchor.y + uy * 280);
    ctx.stroke();
    ctx.restore();
  }

  private drawLauncher(ctx: CanvasRenderingContext2D): void {
    const left = { x: this.anchor.x - 48, y: this.anchor.y + 56 };
    const right = { x: this.anchor.x + 48, y: this.anchor.y + 56 };
    const pinchAim = this.aimPoint ?? { x: this.anchor.x, y: this.anchor.y - 8 };
    const pouch = {
      x: this.shot.active ? this.anchor.x : (this.pinchClosed ? pinchAim.x : this.anchor.x),
      y: this.shot.active ? this.anchor.y : (this.pinchClosed ? Math.min(this.anchor.y + 20, pinchAim.y) : this.anchor.y),
    };

    ctx.strokeStyle = "rgba(205, 180, 130, 0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(pouch.x, pouch.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();

    this.drawBubble(ctx, this.anchor.x, this.anchor.y, this.currentColor, BUBBLE_RADIUS);
    this.drawBubble(ctx, this.anchor.x + 66, this.anchor.y + 12, this.nextColor, BUBBLE_RADIUS * 0.62);
  }

  private drawShot(ctx: CanvasRenderingContext2D): void {
    if (!this.shot.active) return;
    this.drawBubble(ctx, this.shot.pos.x, this.shot.pos.y, this.shot.color, BUBBLE_RADIUS);
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 24px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`⭐ ${this.score}`, 18, 38);

    ctx.font = "600 14px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    ctx.fillText("Pinch to aim · open fingers to shoot", this.canvas.width / 2, this.canvas.height - 18);
  }
}
