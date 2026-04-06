/**
 * SlingshotGame – "Gemini Slingshot"
 *
 * The player uses the **pinch gesture** (thumb tip ↔ index-finger tip) to:
 *   1. Grab the slingshot pouch (pinch distance < GRAB_THRESHOLD).
 *   2. Pull back – the pouch follows the midpoint of the two fingertips.
 *   3. Release – the pouch is launched toward the target.
 *
 * This game is rendered on a plain Canvas 2D context (no Phaser dependency at
 * runtime) so it works in the static Netlify build without extra WASM files.
 * Phaser is listed as an optional dependency for future richer games.
 *
 * Landmark indices used (MediaPipe Hands):
 *   4  = thumb tip
 *   8  = index-finger tip
 */

import type { NormalizedLandmarkList } from "@mediapipe/hands";
import type { IGestuGame } from "../core/IGestuGame";

const THUMB_TIP = 4;
const INDEX_TIP = 8;

interface Vec2 {
  x: number;
  y: number;
}

interface Ball {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  active: boolean;
}

interface Target {
  pos: Vec2;
  radius: number;
  hit: boolean;
  hitTimer: number;
}

const GRAVITY = 0.25;
const PINCH_CLOSE_THRESHOLD = 0.07; // closes the gesture
const PINCH_OPEN_THRESHOLD = 0.095; // opens the gesture (hysteresis)
const PINCH_STABLE_FRAMES = 3; // debounce frames

export class SlingshotGame implements IGestuGame {
  private canvas!: HTMLCanvasElement;

  // Slingshot anchor (centre, canvas coordinates)
  private anchor: Vec2 = { x: 0, y: 0 };
  private restPos: Vec2 = { x: 0, y: 0 };

  // Elastic band / pouch
  private pouch: Vec2 = { x: 0, y: 0 };
  private grabbed = false;
  private maxPull = 0;

  // Projectile
  private ball: Ball = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, radius: 12, active: false };

  // Targets
  private targets: Target[] = [];
  private score = 0;

  // Hand positions (canvas coords)
  private thumbPos: Vec2 | null = null;
  private indexPos: Vec2 | null = null;
  private pinchFiltered = PINCH_OPEN_THRESHOLD;
  private pinchClosed = false;
  private pinchCloseCounter = 0;
  private pinchOpenCounter = 0;

  // ── IGestuGame ──────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.resetLayout();
    this.spawnTargets();
  }

  update(landmarks: NormalizedLandmarkList | null): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (!landmarks) {
      this.thumbPos = null;
      this.indexPos = null;
      this.grabbed = false;
      this.pinchClosed = false;
      this.pinchCloseCounter = 0;
      this.pinchOpenCounter = 0;
      this.pinchFiltered = PINCH_OPEN_THRESHOLD;
    } else {
      // Map normalised [0,1] → canvas pixels (mirror X for natural feel)
      const map = (nx: number, ny: number): Vec2 => ({
        x: (1 - nx) * w,
        y: ny * h,
      });

      this.thumbPos = map(landmarks[THUMB_TIP].x, landmarks[THUMB_TIP].y);
      this.indexPos = map(landmarks[INDEX_TIP].x, landmarks[INDEX_TIP].y);

      const pinchDistRaw =
        Math.hypot(
          landmarks[THUMB_TIP].x - landmarks[INDEX_TIP].x,
          landmarks[THUMB_TIP].y - landmarks[INDEX_TIP].y
        );
      this.pinchFiltered = this.pinchFiltered * 0.7 + pinchDistRaw * 0.3;

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

      const midpoint: Vec2 = {
        x: (this.thumbPos.x + this.indexPos.x) / 2,
        y: (this.thumbPos.y + this.indexPos.y) / 2,
      };

      if (this.pinchClosed) {
        if (!this.grabbed && !this.ball.active) {
          // Start grabbing – snap to current midpoint
          this.grabbed = true;
        }
        if (this.grabbed) {
          // Clamp pull to maxPull radius
          const dx = midpoint.x - this.anchor.x;
          const dy = midpoint.y - this.anchor.y;
          const dist = Math.hypot(dx, dy);
          const clamped = Math.min(dist, this.maxPull);
          this.pouch = {
            x: this.anchor.x + (dx / (dist || 1)) * clamped,
            y: this.anchor.y + (dy / (dist || 1)) * clamped,
          };
        }
      } else {
        if (this.grabbed) {
          // Release → launch ball
          this.launchBall();
        }
        this.grabbed = false;
        this.pouch = { ...this.restPos };
      }
    }

    // Update ball physics
    if (this.ball.active) {
      this.ball.vel.y += GRAVITY;
      this.ball.pos.x += this.ball.vel.x;
      this.ball.pos.y += this.ball.vel.y;

      // Out of bounds
      if (
        this.ball.pos.x < -50 ||
        this.ball.pos.x > w + 50 ||
        this.ball.pos.y > h + 50
      ) {
        this.ball.active = false;
        this.pouch = { ...this.restPos };
      }

      // Hit targets
      for (const t of this.targets) {
        if (!t.hit) {
          const d = Math.hypot(
            this.ball.pos.x - t.pos.x,
            this.ball.pos.y - t.pos.y
          );
          if (d < this.ball.radius + t.radius) {
            t.hit = true;
            t.hitTimer = 60;
            this.score++;
          }
        }
        if (t.hitTimer > 0) t.hitTimer--;
      }

      // All targets cleared → respawn
      if (this.targets.every((t) => t.hit)) {
        this.spawnTargets();
        this.score += 3; // bonus
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    this.drawTargets(ctx);
    this.drawSlingshot(ctx);
    this.drawBall(ctx);
    this.drawHUD(ctx);
    this.drawHandDebug(ctx);
  }

  destroy(): void {
    // Nothing to clean up for this canvas-based game
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private resetLayout(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.anchor = { x: w * 0.25, y: h * 0.65 };
    this.restPos = { x: w * 0.25, y: h * 0.65 };
    this.pouch = { ...this.restPos };
    this.maxPull = Math.min(w, h) * 0.18;
  }

  private spawnTargets(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.targets = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      this.targets.push({
        pos: {
          x: w * 0.55 + (i % 3) * 80,
          y: h * 0.3 + Math.floor(i / 3) * 80,
        },
        radius: 28,
        hit: false,
        hitTimer: 0,
      });
    }
  }

  private launchBall(): void {
    const dx = this.anchor.x - this.pouch.x;
    const dy = this.anchor.y - this.pouch.y;
    const power = 0.18;
    this.ball = {
      pos: { ...this.pouch },
      vel: { x: dx * power, y: dy * power },
      radius: 12,
      active: true,
    };
    this.pouch = { ...this.restPos };
  }

  private drawSlingshot(ctx: CanvasRenderingContext2D): void {
    const { anchor, pouch } = this;
    const forkOffset = 25;

    const leftFork: Vec2 = { x: anchor.x - forkOffset, y: anchor.y - 60 };
    const rightFork: Vec2 = { x: anchor.x + forkOffset, y: anchor.y - 60 };

    // Stick
    ctx.strokeStyle = "#8B5E3C";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y + 40);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.lineTo(leftFork.x, leftFork.y);
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(rightFork.x, rightFork.y);
    ctx.stroke();

    // Elastic bands
    const bandColor = this.grabbed ? "#ff6b6b" : "#c8a060";
    ctx.strokeStyle = bandColor;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(leftFork.x, leftFork.y);
    ctx.lineTo(pouch.x, pouch.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rightFork.x, rightFork.y);
    ctx.lineTo(pouch.x, pouch.y);
    ctx.stroke();

    // Pouch
    ctx.fillStyle = bandColor;
    ctx.beginPath();
    ctx.arc(pouch.x, pouch.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBall(ctx: CanvasRenderingContext2D): void {
    if (!this.ball.active) return;
    const { pos, radius } = this.ball;

    const grad = ctx.createRadialGradient(
      pos.x - radius * 0.3,
      pos.y - radius * 0.3,
      radius * 0.1,
      pos.x,
      pos.y,
      radius
    );
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.4, "#a0d4ff");
    grad.addColorStop(1, "#3388ff");

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  private drawTargets(ctx: CanvasRenderingContext2D): void {
    for (const t of this.targets) {
      if (t.hit && t.hitTimer <= 0) continue;

      const alpha = t.hit ? t.hitTimer / 60 : 1;
      ctx.globalAlpha = alpha;

      // Star shape
      ctx.save();
      ctx.translate(t.pos.x, t.pos.y);
      if (t.hit) {
        ctx.rotate((60 - t.hitTimer) * 0.15);
        ctx.scale(1 + (60 - t.hitTimer) * 0.02, 1 + (60 - t.hitTimer) * 0.02);
      }

      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * (2 * Math.PI)) / 5 - Math.PI / 2;
        const innerAngle = angle + Math.PI / 5;
        const outerR = t.radius;
        const innerR = t.radius * 0.45;
        if (i === 0) ctx.moveTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
        else ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
        ctx.lineTo(Math.cos(innerAngle) * innerR, Math.sin(innerAngle) * innerR);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  private drawHUD(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`⭐ ${this.score}`, 20, 36);

    // Instructions
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = "center";
    ctx.fillText(
      "Pinch to grab · release to shoot",
      this.canvas.width / 2,
      this.canvas.height - 16
    );
  }

  private drawHandDebug(ctx: CanvasRenderingContext2D): void {
    if (!this.thumbPos || !this.indexPos) return;

    const drawDot = (p: Vec2, color: string) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    drawDot(this.thumbPos, "#ff6b6b");
    drawDot(this.indexPos, "#6bffb8");
  }
}
