/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Point, Bubble, Particle, BubbleColor } from '../types';
import { Loader2, Trophy, Play, MousePointerClick } from 'lucide-react';

const GRAB_THRESHOLD = 0.065; // Limite para agarrar (dedos próximos)
const RELEASE_THRESHOLD = 0.14; // Limite para soltar (histerese)
const HAND_LOSS_TOLERANCE = 3; // Quantos frames a mão pode sumir antes de soltar a bola

const FRICTION = 0.998; 

const BUBBLE_RADIUS = 22;
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);
const GRID_COLS = 12;
const GRID_ROWS = 8;
const GRID_TOP_OFFSET = 20;
const SLINGSHOT_BOTTOM_OFFSET = 220;

const MAX_DRAG_DIST = 180;
const MIN_FORCE_MULT = 0.15;
const MAX_FORCE_MULT = 0.45;

const COLOR_CONFIG: Record<BubbleColor, { hex: string, points: number, label: string }> = {
  red:    { hex: '#ef5350', points: 100, label: 'Red' },
  blue:   { hex: '#42a5f5', points: 150, label: 'Blue' },
  green:  { hex: '#66bb6a', points: 200, label: 'Green' },
  yellow: { hex: '#ffee58', points: 250, label: 'Yellow' },
  purple: { hex: '#ab47bc', points: 300, label: 'Purple' },
  orange: { hex: '#ffa726', points: 500, label: 'Orange' }
};

const COLOR_KEYS: BubbleColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

const adjustColor = (color: string, amount: number) => {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    const componentToHex = (c: number) => {
        const hex = c.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

const GeminiSlingshot: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  
  const ballPos = useRef<Point>({ x: 0, y: 0 });
  const ballVel = useRef<Point>({ x: 0, y: 0 });
  const anchorPos = useRef<Point>({ x: 0, y: 0 });
  const isPinching = useRef<boolean>(false);
  const handLossCounter = useRef<number>(0);
  const isFlying = useRef<boolean>(false);
  const flightStartTime = useRef<number>(0);
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<Particle[]>([]);
  const scoreRef = useRef<number>(0);
  const frameInFlightRef = useRef(false);

  const selectedColorRef = useRef<BubbleColor>('red');
  
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [selectedColor, setSelectedColor] = useState<BubbleColor>('red');
  const [availableColors, setAvailableColors] = useState<BubbleColor[]>([]);

  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);

  const getBubblePos = (row: number, col: number, width: number) => {
    const xOffset = (width - (GRID_COLS * BUBBLE_RADIUS * 2)) / 2 + BUBBLE_RADIUS;
    const isOdd = row % 2 !== 0;
    const x = xOffset + col * (BUBBLE_RADIUS * 2) + (isOdd ? BUBBLE_RADIUS : 0);
    const y = GRID_TOP_OFFSET + BUBBLE_RADIUS + row * ROW_HEIGHT;
    return { x, y };
  };

  const updateAvailableColors = () => {
    const activeColors = new Set<BubbleColor>();
    bubbles.current.forEach(b => {
        if (b.active) activeColors.add(b.color);
    });
    setAvailableColors(Array.from(activeColors));
    if (!activeColors.has(selectedColorRef.current) && activeColors.size > 0) {
        setSelectedColor(Array.from(activeColors)[0]);
    }
  };

  const initGrid = useCallback((width: number) => {
    const newBubbles: Bubble[] = [];
    for (let r = 0; r < 5; r++) { 
      for (let c = 0; c < (r % 2 !== 0 ? GRID_COLS - 1 : GRID_COLS); c++) {
        if (Math.random() > 0.1) {
            const { x, y } = getBubblePos(r, c, width);
            newBubbles.push({
              id: `${r}-${c}`,
              row: r,
              col: c,
              x,
              y,
              color: COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)],
              active: true
            });
        }
      }
    }
    bubbles.current = newBubbles;
    updateAvailableColors();
  }, []);

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 12; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color
      });
    }
  };

  const checkMatches = (startBubble: Bubble) => {
    const toCheck = [startBubble];
    const visited = new Set<string>();
    const matches: Bubble[] = [];
    const targetColor = startBubble.color;
    while (toCheck.length > 0) {
      const current = toCheck.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      if (current.color === targetColor) {
        matches.push(current);
        const neighbors = bubbles.current.filter(b => b.active && !visited.has(b.id) && isNeighbor(current, b));
        toCheck.push(...neighbors);
      }
    }
    if (matches.length >= 3) {
      let points = 0;
      matches.forEach(b => {
        b.active = false;
        createExplosion(b.x, b.y, COLOR_CONFIG[b.color].hex);
        points += COLOR_CONFIG[targetColor].points;
      });
      const multiplier = matches.length > 3 ? 1.5 : 1.0;
      scoreRef.current += Math.floor(points * multiplier);
      setScore(scoreRef.current);
      return true;
    }
    return false;
  };

  const isNeighbor = (a: Bubble, b: Bubble) => {
    const dr = b.row - a.row;
    const dc = b.col - a.col;
    if (Math.abs(dr) > 1) return false;
    if (dr === 0) return Math.abs(dc) === 1;
    return a.row % 2 !== 0 ? (dc === 0 || dc === 1) : (dc === -1 || dc === 0);
  };

  const drawBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colorKey: BubbleColor) => {
    const config = COLOR_CONFIG[colorKey];
    const baseColor = config.hex;
    const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.2, baseColor);
    grad.addColorStop(1, adjustColor(baseColor, -60));
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = adjustColor(baseColor, -80);
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !gameContainerRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = gameContainerRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    anchorPos.current = { x: canvas.width / 2, y: canvas.height - SLINGSHOT_BOTTOM_OFFSET };
    ballPos.current = { ...anchorPos.current };
    initGrid(canvas.width);

    let camera: any = null;
    let hands: any = null;

    const onResults = (results: any) => {
      setLoading(false);
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        anchorPos.current = { x: canvas.width / 2, y: canvas.height - SLINGSHOT_BOTTOM_OFFSET };
        if (!isFlying.current && !isPinching.current) ballPos.current = { ...anchorPos.current };
      }
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let handPos: Point | null = null;
      let pinchDist = 1.0;
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const idxTip = landmarks[8], thumbTip = landmarks[4];
        handPos = { x: (idxTip.x + thumbTip.x) / 2 * canvas.width, y: (idxTip.y + thumbTip.y) / 2 * canvas.height };
        pinchDist = Math.sqrt(Math.pow(idxTip.x - thumbTip.x, 2) + Math.pow(idxTip.y - thumbTip.y, 2));
        
        // Se encontramos a mão, resetamos o contador de perda
        handLossCounter.current = 0;

        if (window.drawConnectors) {
           window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {color: '#669df6', lineWidth: 1});
           window.drawLandmarks(ctx, landmarks, {color: '#aecbfa', lineWidth: 1, radius: 2});
        }
        ctx.beginPath();
        ctx.arc(handPos.x, handPos.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = pinchDist < GRAB_THRESHOLD ? '#66bb6a' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // Se a mão sumiu, incrementamos o contador
        handLossCounter.current++;
      }
      
      // LOGICA DE PINÇA COM HISTERESE
      if (handPos && !isFlying.current) {
        if (!isPinching.current) {
          // Só começa a segurar se os dedos estiverem MUITO próximos e perto da bola
          const distToBall = Math.sqrt(Math.pow(handPos.x - ballPos.current.x, 2) + Math.pow(handPos.y - ballPos.current.y, 2));
          if (pinchDist < GRAB_THRESHOLD && distToBall < 140) {
            isPinching.current = true;
          }
        } else {
          // Se já está segurando, permite que os dedos se afastem um pouco mais sem soltar (histerese)
          if (pinchDist > RELEASE_THRESHOLD) {
             isPinching.current = false;
             handleLaunch();
          } else {
             ballPos.current = { x: handPos.x, y: handPos.y };
             const dragDx = ballPos.current.x - anchorPos.current.x, dragDy = ballPos.current.y - anchorPos.current.y;
             const dragDist = Math.sqrt(dragDx*dragDx + dragDy*dragDy);
             if (dragDist > MAX_DRAG_DIST) {
                const angle = Math.atan2(dragDy, dragDx);
                ballPos.current.x = anchorPos.current.x + Math.cos(angle) * MAX_DRAG_DIST;
                ballPos.current.y = anchorPos.current.y + Math.sin(angle) * MAX_DRAG_DIST;
             }
          }
        }
      } else if (isPinching.current && handLossCounter.current > HAND_LOSS_TOLERANCE) {
        // Solta a bola se a mão sumir por muito tempo ou se o sistema travar
        isPinching.current = false;
        handleLaunch();
      }

      function handleLaunch() {
        const dx = anchorPos.current.x - ballPos.current.x, dy = anchorPos.current.y - ballPos.current.y;
        const stretchDist = Math.sqrt(dx*dx + dy*dy);
        if (stretchDist > 40) { // Mínimo de força para lançar
            isFlying.current = true;
            flightStartTime.current = performance.now();
            const powerRatio = Math.min(stretchDist / MAX_DRAG_DIST, 1.0);
            const velocityMultiplier = MIN_FORCE_MULT + (MAX_FORCE_MULT - MIN_FORCE_MULT) * (powerRatio * powerRatio);
            ballVel.current = { x: dx * velocityMultiplier, y: dy * velocityMultiplier };
        } else {
            ballPos.current = { ...anchorPos.current };
        }
      }

      if (!isFlying.current && !isPinching.current) {
          ballPos.current.x += (anchorPos.current.x - ballPos.current.x) * 0.15;
          ballPos.current.y += (anchorPos.current.y - ballPos.current.y) * 0.15;
      }

      if (isFlying.current) {
        if (performance.now() - flightStartTime.current > 5000) {
            isFlying.current = false;
            ballPos.current = { ...anchorPos.current };
        } else {
            const steps = Math.ceil(Math.sqrt(ballVel.current.x ** 2 + ballVel.current.y ** 2) / (BUBBLE_RADIUS * 0.8)); 
            let collisionOccurred = false;
            for (let i = 0; i < steps; i++) {
                ballPos.current.x += ballVel.current.x / steps;
                ballPos.current.y += ballVel.current.y / steps;
                if (ballPos.current.x < BUBBLE_RADIUS || ballPos.current.x > canvas.width - BUBBLE_RADIUS) {
                    ballVel.current.x *= -1;
                    ballPos.current.x = Math.max(BUBBLE_RADIUS, Math.min(canvas.width - BUBBLE_RADIUS, ballPos.current.x));
                }
                if (ballPos.current.y < BUBBLE_RADIUS) { collisionOccurred = true; break; }
                for (const b of bubbles.current) {
                    if (!b.active) continue;
                    if (Math.sqrt(Math.pow(ballPos.current.x - b.x, 2) + Math.pow(ballPos.current.y - b.y, 2)) < BUBBLE_RADIUS * 1.8) { 
                        collisionOccurred = true; break;
                    }
                }
                if (collisionOccurred) break;
            }
            ballVel.current.x *= FRICTION; ballVel.current.y *= FRICTION;
            if (collisionOccurred) {
                isFlying.current = false;
                let bestDist = Infinity, bestRow = 0, bestCol = 0, bestX = 0, bestY = 0;
                for (let r = 0; r < GRID_ROWS + 5; r++) {
                    const cols = r % 2 !== 0 ? GRID_COLS - 1 : GRID_COLS;
                    for (let c = 0; c < cols; c++) {
                        const { x, y } = getBubblePos(r, c, canvas.width);
                        if (bubbles.current.some(b => b.active && b.row === r && b.col === c)) continue;
                        const dist = Math.sqrt(Math.pow(ballPos.current.x - x, 2) + Math.pow(ballPos.current.y - y, 2));
                        if (dist < bestDist) { bestDist = dist; bestRow = r; bestCol = c; bestX = x; bestY = y; }
                    }
                }
                const nb: Bubble = { id: `${bestRow}-${bestCol}-${Date.now()}`, row: bestRow, col: bestCol, x: bestX, y: bestY, color: selectedColorRef.current, active: true };
                bubbles.current.push(nb);
                checkMatches(nb);
                updateAvailableColors();
                ballPos.current = { ...anchorPos.current };
            }
            if (ballPos.current.y > canvas.height) { isFlying.current = false; ballPos.current = { ...anchorPos.current }; }
        }
      }

      bubbles.current.forEach(b => { if (b.active) drawBubble(ctx, b.x, b.y, BUBBLE_RADIUS - 1, b.color); });
      const bandColor = isPinching.current ? '#fdd835' : 'rgba(255,255,255,0.4)';
      if (!isFlying.current) {
        ctx.beginPath(); ctx.moveTo(anchorPos.current.x - 35, anchorPos.current.y - 10);
        ctx.lineTo(ballPos.current.x, ballPos.current.y);
        ctx.lineWidth = 5; ctx.strokeStyle = bandColor; ctx.lineCap = 'round'; ctx.stroke();
      }
      ctx.save();
      drawBubble(ctx, ballPos.current.x, ballPos.current.y, BUBBLE_RADIUS, selectedColorRef.current);
      ctx.restore();
      if (!isFlying.current) {
        ctx.beginPath(); ctx.moveTo(ballPos.current.x, ballPos.current.y);
        ctx.lineTo(anchorPos.current.x + 35, anchorPos.current.y - 10);
        ctx.lineWidth = 5; ctx.strokeStyle = bandColor; ctx.lineCap = 'round'; ctx.stroke();
      }

      ctx.beginPath(); ctx.moveTo(anchorPos.current.x, canvas.height); 
      ctx.lineTo(anchorPos.current.x, anchorPos.current.y + 40); ctx.lineTo(anchorPos.current.x - 40, anchorPos.current.y); 
      ctx.moveTo(anchorPos.current.x, anchorPos.current.y + 40); ctx.lineTo(anchorPos.current.x + 40, anchorPos.current.y); 
      ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.strokeStyle = '#616161'; ctx.stroke();

      for (let i = particles.current.length - 1; i >= 0; i--) {
          const p = particles.current[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.05;
          if (p.life <= 0) particles.current.splice(i, 1);
          else { ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); ctx.globalAlpha = 1.0; }
      }
      ctx.restore();
    };

    const HandsCtor = window.Hands ?? (globalThis as any).Hands;
    const CameraCtor = window.Camera ?? (globalThis as any).Camera;
    if (HandsCtor) {
      hands = new HandsCtor({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
      hands.onResults(onResults);
      if (CameraCtor) {
        camera = new CameraCtor(video, {
          onFrame: async () => {
            if (!videoRef.current || !hands || frameInFlightRef.current) return;
            frameInFlightRef.current = true;
            try {
              await hands.send({ image: videoRef.current });
            } finally {
              frameInFlightRef.current = false;
            }
          },
          width: 960,
          height: 540
        });
        camera.start();
      }
    } else {
      setLoading(false);
    }
    return () => {
      frameInFlightRef.current = false;
      if (camera) camera.stop();
      if (hands) hands.close();
    };
  }, [initGrid]);

  return (
    <div className="w-full h-screen bg-[#121212] overflow-hidden font-roboto text-[#e3e3e3]">
      
      {/* GAME AREA */}
      <div ref={gameContainerRef} className="relative h-full overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 z-0 w-full h-full object-cover opacity-45 pointer-events-none"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="absolute inset-0 z-10" />

        {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#121212] z-50">
                <div className="flex flex-col items-center">
                    <Loader2 className="w-12 h-12 text-[#42a5f5] animate-spin mb-4" />
                    <p className="text-[#e3e3e3] text-lg font-medium">Starting Engine...</p>
                </div>
            </div>
        )}

        {/* TOP HUD: Score */}
        <div className="absolute top-4 left-4 right-4 z-40 flex justify-start items-start pointer-events-none">
            <div className="bg-[#1e1e1e]/90 p-3 rounded-2xl border border-[#444746] shadow-xl flex items-center gap-3 min-w-[120px] pointer-events-auto backdrop-blur-md">
                <div className="bg-[#42a5f5]/20 p-2 rounded-full hidden sm:block">
                    <Trophy className="w-5 h-5 text-[#42a5f5]" />
                </div>
                <div>
                    <p className="text-[10px] text-[#c4c7c5] uppercase tracking-wider font-bold">Score</p>
                    <p className="text-xl sm:text-2xl font-bold text-white leading-none">{score.toLocaleString()}</p>
                </div>
            </div>
        </div>

        {/* BOTTOM HUD: Color Picker */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4">
            <div className="bg-[#1e1e1e]/90 px-4 py-3 rounded-[32px] border border-[#444746] shadow-2xl flex items-center justify-center gap-3 backdrop-blur-md overflow-x-auto no-scrollbar">
                {availableColors.length === 0 ? (
                    <p className="text-xs text-gray-500 uppercase tracking-widest">Awaiting Board...</p>
                ) : (
                    COLOR_KEYS.filter(c => availableColors.includes(c)).map(color => {
                        const isSelected = selectedColor === color;
                        const config = COLOR_CONFIG[color];
                        return (
                            <button
                                key={color}
                                onClick={() => setSelectedColor(color)}
                                className={`relative flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full transition-all duration-300 transform flex items-center justify-center
                                    ${isSelected ? 'scale-110 ring-2 ring-white z-10' : 'opacity-70 hover:opacity-100'}
                                `}
                                style={{ background: `radial-gradient(circle at 35% 35%, ${config.hex}, ${adjustColor(config.hex, -60)})` }}
                            >
                                <div className="absolute top-2 left-3 w-3 h-1.5 bg-white/30 rounded-full transform -rotate-45" />
                                {isSelected && <MousePointerClick className="w-5 h-5 text-white/80" />}
                            </button>
                        )
                    })
                )}
            </div>
        </div>

        {!isPinching.current && !isFlying.current && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none opacity-60">
                <div className="flex items-center gap-2 bg-[#1e1e1e]/90 px-4 py-2 rounded-full border border-[#444746] backdrop-blur-sm">
                    <Play className="w-3 h-3 text-[#42a5f5] fill-current" />
                    <p className="text-[#e3e3e3] text-[10px] sm:text-xs font-bold uppercase tracking-wider">Pinch & Pull</p>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default GeminiSlingshot;
