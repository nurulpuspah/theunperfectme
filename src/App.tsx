import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Sparkles, HeartPulse, Calendar as CalendarIcon, Cherry, LogIn } from 'lucide-react';
import { db, auth, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';

// --- Types ---

interface DailyWin {
  id: string;
  text: string;
}

interface DayEntry {
  date: string;
  wins: DailyWin[];
}

interface RoughThought {
  id: string;
  text: string;
  timestamp: number;
}

// --- Utils ---

const mulberry32 = (a: number) => {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// --- Components ---

const Castle = ({ winCount, thoughtCount }: { winCount: number, thoughtCount: number }) => {
  const flowerTypes = {
    small: [
      { name: 'lavender', colors: ['#967BB6', '#B284BE', '#D1B3FF'], baseSize: 7 },
      { name: 'babybreath', colors: ['#FFFFFF'], baseSize: 4 },
      { name: 'cosmos', colors: ['#FF69B4', '#DA70D6', '#FF1493'], baseSize: 8 },
    ],
    large: [
      { name: 'rose', colors: ['#E31C25', '#FF4D6D', '#FF5555'], baseSize: 13 },
      { name: 'peony', colors: ['#FFC0CB', '#FFB7C5', '#F8C8DC'], baseSize: 16 },
      { name: 'lily', colors: ['#FFF9F0', '#FDFBF0'], baseSize: 15 }
    ]
  };

  const featureBoundaries = [
    { x: 184, y: 245, w: 32, h: 40 }, // Main tower window (center area)
    { x: 163, y: 345, w: 19, h: 28 }, // Main tower left window (center area)
    { x: 218, y: 345, w: 19, h: 28 }, // Main tower right window (center area)
    { x: 93, y: 355, w: 14, h: 24 },  // Left tower window (center area)
    { x: 293, y: 355, w: 14, h: 24 }, // Right tower window (center area)
    { x: 185, y: 500, w: 30, h: 75 }, // Door (center area)
  ];

  // Pre-generate a stable pool of flowers
  const flowerPool = useMemo(() => {
    const pool: any[] = [];
    const rng = mulberry32(12345);
    
    const isBlocking = (x: number, y: number) => {
      // Hard block for window/door glass areas
      return featureBoundaries.some(b => 
        x >= b.x - 12 && x <= b.x + b.w + 12 && y >= b.y - 12 && y <= b.y + b.h + 12
      );
    };

    const zones = [
      // Wall surfaces
      { type: 'rect', x: 132, y: 350, w: 10, h: 200 }, 
      { type: 'rect', x: 258, y: 350, w: 10, h: 200 }, 
      { type: 'rect', x: 70, y: 330, w: 15, h: 220 },  
      { type: 'rect', x: 315, y: 330, w: 15, h: 220 }, 
      { type: 'rect', x: 140, y: 535, w: 120, h: 25 }, 
      
      // Above the door area (Refined into two horizontal rows, sparse)
      { type: 'rect', x: 170, y: 440, w: 60, h: 8, isSparse: true }, 
      { type: 'rect', x: 170, y: 465, w: 60, h: 8, isSparse: true }, 

      // Upper main tower sides
      { type: 'rect', x: 148, y: 210, w: 20, h: 80 }, 
      { type: 'rect', x: 232, y: 210, w: 20, h: 80 }, 
      
      // Roof edges (Main Tower)
      { type: 'line', x1: 125, y1: 200, x2: 200, y2: 45 },
      { type: 'line', x1: 200, y1: 45, x2: 275, y2: 200 },
      { type: 'line', x1: 125, y1: 200, x2: 275, y2: 200 }, // Base
      
      // Roof edges (Side Towers)
      { type: 'line', x1: 65, y1: 300, x2: 100, y2: 195 },
      { type: 'line', x1: 100, y1: 195, x2: 135, y2: 300 },
      { type: 'line', x1: 65, y1: 300, x2: 135, y2: 300 }, // Base Left
      { type: 'line', x1: 265, y1: 300, x2: 300, y2: 195 },
      { type: 'line', x1: 300, y1: 195, x2: 335, y2: 300 },
      { type: 'line', x1: 265, y1: 300, x2: 335, y2: 300 }, // Base Right

      // Garden zones (Grass area) - Symmetrical beds framing the path
      { type: 'rect', x: 30, y: 560, w: 135, h: 20, isGround: true }, 
      { type: 'rect', x: 235, y: 560, w: 135, h: 20, isGround: true }, 
    ];

    const candidates: {x: number, y: number, isRoof: boolean, isGround: boolean, isSparse: boolean}[] = [];
    const minDistance = 18; 

    for (let i = 0; i < 1800 && candidates.length < 600; i++) {
        const zone: any = zones[Math.floor(rng() * zones.length)];
        let nx, ny;

        if (zone.type === 'rect') {
          nx = zone.x! + rng() * zone.w!;
          ny = zone.y! + rng() * zone.h!;
        } else {
          const t = rng();
          nx = zone.x1! + (zone.x2! - zone.x1!) * t;
          ny = zone.y1! + (zone.y2! - zone.y1!) * t;
        }

        if (!isBlocking(nx, ny)) {
          // Ground flowers can be slightly denser to look "filled" but still orderly
          const checkDist = zone.isSparse ? 28 : (zone.isGround ? 18 : minDistance);
          const isTooClose = candidates.some(c => 
            Math.sqrt(Math.pow(c.x - nx, 2) + Math.pow(c.y - ny, 2)) < checkDist
          );
          if (!isTooClose) {
            candidates.push({ 
              x: nx, 
              y: ny, 
              isRoof: zone.type === 'line', 
              isGround: !!zone.isGround,
              isSparse: !!zone.isSparse
            });
          }
        }
    }

    for (let i = 0; i < candidates.length; i++) {
      const pos = candidates[i];
      const category = (rng() > 0.4 || pos.isRoof || pos.isSparse) ? flowerTypes.small : flowerTypes.large;
      const type = category[Math.floor(rng() * category.length)];
      
      pool.push({
        id: `flower-${i}`,
        x: pos.x,
        y: pos.y,
        type: type.name,
        color: type.colors[Math.floor(rng() * type.colors.length)],
        size: type.baseSize * (0.8 + rng() * 0.4),
        rotate: rng() * 360,
        leafAngle: rng() * 360,
        isGround: pos.isGround
      });
    }
    return pool;
  }, []);

  const flowers = useMemo(() => flowerPool.slice(0, winCount), [winCount, flowerPool]);

  const cracks = useMemo(() => {
    const items = [];
    const rng = mulberry32(6789);
    const fracturePoints: {x: number, y: number}[] = [];
    
    const isInsideFeature = (x: number, y: number) => {
      return featureBoundaries.some(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    };

    const wallBounds = [
      { x: 70, y: 300, w: 60, h: 260 },
      { x: 270, y: 300, w: 60, h: 260 },
      { x: 140, y: 200, w: 120, h: 360 }
    ];

    const generateJaggedPath = (x1: number, y1: number, x2: number, y2: number) => {
      let path = `M ${x1} ${y1}`;
      const segments = 4;
      const points = [{x: x1, y: y1}];
      for (let j = 1; j < segments; j++) {
        const t = j / segments;
        const px = x1 + (x2 - x1) * t + (rng() - 0.5) * 8;
        const py = y1 + (y2 - y1) * t + (rng() - 0.5) * 8;
        path += ` L ${px} ${py}`;
        points.push({x: px, y: py});
      }
      path += ` L ${x2} ${y2}`;
      points.push({x: x2, y: y2});
      return { path, points, endPoint: { x: x2, y: y2 } };
    };

    const crackNodes: {x: number, y: number}[] = [];
    const allCrackSegments: {x1: number, y1: number, x2: number, y2: number}[] = [];

    const segmentsIntersect = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
      const det = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
      if (det === 0) return false;
      const lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det;
      const gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det;
      return (0.01 < lambda && lambda < 0.99) && (0.01 < gamma && gamma < 0.99);
    };

    const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      let t = ((px - x1) * dx + (py - y1) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
    };

    const isCrossingFeature = (x1: number, y1: number, x2: number, y2: number) => {
      for (let t = 0.1; t <= 0.9; t += 0.1) {
        if (isInsideFeature(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
      }
      return false;
    };

    for (let i = 0; i < thoughtCount; i++) {
        const wall = wallBounds[Math.floor(rng() * wallBounds.length)];
        let startX, startY;
        let isBranch = false;
        
        const wallNodes = crackNodes.filter(p => 
          p.x >= wall.x - 2 && p.x <= wall.x + wall.w + 2 && 
          p.y >= wall.y - 2 && p.y <= wall.y + wall.h + 2
        );

        if (wallNodes.length > 0 && rng() > 0.3) {
          const base = wallNodes[Math.floor(rng() * wallNodes.length)];
          startX = base.x;
          startY = base.y;
          isBranch = true;
        } else {
          let attempts = 0;
          do {
            startX = wall.x + (rng() * wall.w * 0.8) + (wall.w * 0.1);
            startY = wall.y + (rng() * wall.h * 0.6) + (wall.h * 0.1); 
            attempts++;
            
            // Check if start point is too close to existing segments
            const tooCloseToAny = allCrackSegments.some(seg => 
               distToSegment(startX, startY, seg.x1, seg.y1, seg.x2, seg.y2) < 15
            );
            if (!tooCloseToAny) break;
          } while (attempts < 20);
        }

        let bestEndX = 0;
        let bestEndY = 0;
        let found = false;

        for (let attempt = 0; attempt < 15; attempt++) {
          const angle = rng() * Math.PI * 2;
          const length = 18 + rng() * 22;
          let tx = startX + Math.cos(angle) * length;
          let ty = startY + Math.sin(angle) * length;

          tx = Math.max(wall.x + 2, Math.min(wall.x + wall.w - 2, tx));
          ty = Math.max(wall.y + 2, Math.min(wall.y + wall.h - 2, ty));

          if (!isInsideFeature(tx, ty) && !isCrossingFeature(startX, startY, tx, ty)) {
            const distToStart = Math.sqrt((tx - startX)**2 + (ty - startY)**2);
            if (distToStart < 10) continue;

            // Collision check
            const intersectsExisting = allCrackSegments.some(seg => 
              segmentsIntersect(startX, startY, tx, ty, seg.x1, seg.y1, seg.x2, seg.y2)
            );
            if (intersectsExisting) continue;

            // Proximity check for the endpoint and midpoint
            const mx = (startX + tx) / 2;
            const my = (startY + ty) / 2;
            
            const isTooClose = allCrackSegments.some(seg => {
               // Ignore the segment we're branching from if we're a branch
               const dEnd = distToSegment(tx, ty, seg.x1, seg.y1, seg.x2, seg.y2);
               const dMid = distToSegment(mx, my, seg.x1, seg.y1, seg.x2, seg.y2);
               
               // If branching, we only care if we're parallel and too close
               const threshold = 12;
               return dEnd < threshold || dMid < threshold;
            });

            if (!isTooClose) {
              bestEndX = tx;
              bestEndY = ty;
              found = true;
              break;
            }
          }
        }

        if (found) {
          const crack = generateJaggedPath(startX, startY, bestEndX, bestEndY);
          crackNodes.push(crack.endPoint);
          if (rng() > 0.5) crackNodes.push(crack.points[Math.floor(crack.points.length/2)]);
          
          fracturePoints.push(...crack.points);
          allCrackSegments.push({ x1: startX, y1: startY, x2: bestEndX, y2: bestEndY });

        
        items.push({
          id: `crack-${i}`,
          path: crack.path,
          glints: Array.from({length: 15}).map(() => {
            const t = rng();
            const colors = ['#D4AF37', '#FFF7A1', '#FFFFFF', '#FFD700'];
            return {
              id: rng(),
              x: startX + t * (bestEndX - startX) + (rng()-0.5) * 5,
              y: startY + t * (bestEndY - startY) + (rng()-0.5) * 5,
              scale: 0.1 + rng() * 0.2, // Tiny particles
              delay: rng() * 4,
              color: colors[Math.floor(rng() * colors.length)]
            };
          })
        });
      }
    }
    return items;
  }, [thoughtCount]);


  return (
    <div className="relative w-full max-w-[750px] aspect-[4/5] md:aspect-[16/10] mx-auto mt-8 flex justify-center items-center">
      <svg 
        viewBox="0 0 400 600" 
        className="w-full h-full max-h-[80vh] overflow-visible" 
        style={{ filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.1))' }}
      >
        <defs>
          <linearGradient id="wallGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F5F1E1" />
            <stop offset="50%" stopColor="#FAF7EB" />
            <stop offset="100%" stopColor="#E6DECA" />
          </linearGradient>
          <linearGradient id="roofGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A8B781" />
            <stop offset="30%" stopColor="#96A56C" />
            <stop offset="100%" stopColor="#5E6A3A" />
          </linearGradient>
          <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE14D" />
            <stop offset="50%" stopColor="#FFF7A1" />
            <stop offset="100%" stopColor="#D4AF37" />
            <animate attributeName="x1" from="0%" to="100%" dur="2s" repeatCount="indefinite" />
          </linearGradient>
          <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <fePointLight x="200" y="300" z="50" />
            <feComposite in2="SourceGraphic" operator="over" />
          </filter>
          <pattern id="bricks" x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
            <rect width="40" height="20" fill="none" />
            <path d="M 0 20 L 40 20 M 20 0 L 20 20" stroke="rgba(0,0,0,0.03)" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Castle Structure */}
        <g filter="drop-shadow(3px 5px 12px rgba(0,0,0,0.18))">
          {/* Main Tower */}
          <rect x="140" y="200" width="120" height="380" fill="url(#wallGradient)" rx="4" />
          <rect x="140" y="200" width="120" height="380" fill="url(#bricks)" rx="4" />
          <path d="M 120 205 L 200 40 L 280 205 Q 200 190 120 205 Z" fill="url(#roofGradient)" stroke="#5E683F" strokeWidth="0.5" />
          <path d="M 125 200 L 200 55" stroke="rgba(255,255,255,0.2)" strokeWidth="1" fill="none" pointerEvents="none" />
          <circle cx="200" cy="40" r="2.5" fill="#D4AF37" />
          
          {/* Side Towers */}
          <rect x="70" y="300" width="60" height="280" fill="url(#wallGradient)" rx="2" />
          <rect x="70" y="300" width="60" height="280" fill="url(#bricks)" rx="2" />
          <path d="M 60 305 L 100 190 L 140 305 Q 100 295 60 305 Z" fill="url(#roofGradient)" stroke="#5E683F" strokeWidth="0.5" />
          <path d="M 65 300 L 100 205" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" fill="none" pointerEvents="none" />
          <circle cx="100" cy="190" r="2" fill="#D4AF37" />
          
          <rect x="270" y="300" width="60" height="280" fill="url(#wallGradient)" rx="2" />
          <rect x="270" y="300" width="60" height="280" fill="url(#bricks)" rx="2" />
          <path d="M 260 305 L 300 190 L 340 305 Q 300 295 260 305 Z" fill="url(#roofGradient)" stroke="#5E683F" strokeWidth="0.5" />
          <path d="M 265 300 L 300 205" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" fill="none" pointerEvents="none" />
          <circle cx="300" cy="190" r="2" fill="#D4AF37" />
        </g>

        {/* Features - Arched Windows and Doors with Frames and Depth Shadows */}
        <g stroke="#9C9C9C" strokeWidth="0.4">
          {/* Main Tower Central Window */}
          <g>
            <path d="M 180 285 L 180 255 Q 200 235 220 255 L 220 285 Z" fill="#FDFBF0" stroke="#B0B0B0" strokeWidth="1" />
            <path d="M 181 284 L 181 256 Q 192 245 202 256 L 202 284 Z" fill="rgba(0,0,0,0.06)" stroke="none" />
          </g>
          {/* Main Tower Side Windows */}
          <g>
            <path d="M 160 375 L 160 350 Q 172.5 335 185 350 L 185 375 Z" fill="#FDFBF0" stroke="#B0B0B0" strokeWidth="0.8" />
            <path d="M 161 374 L 161 351 Q 168 343 175 351 L 175 374 Z" fill="rgba(0,0,0,0.06)" stroke="none" />
          </g>
          <g>
            <path d="M 215 375 L 215 350 Q 227.5 335 240 350 L 240 375 Z" fill="#FDFBF0" stroke="#B0B0B0" strokeWidth="0.8" />
            <path d="M 216 374 L 216 351 Q 223 343 230 351 L 230 374 Z" fill="rgba(0,0,0,0.06)" stroke="none" />
          </g>
          {/* Side Tower Windows */}
          <g>
            <path d="M 90 380 L 90 360 Q 100 345 110 360 L 110 380 Z" fill="#FDFBF0" stroke="#B0B0B0" strokeWidth="0.8" />
            <path d="M 91 379 L 91 361 Q 97 353 103 361 L 103 379 Z" fill="rgba(0,0,0,0.06)" stroke="none" />
          </g>
          <g>
            <path d="M 290 380 L 290 360 Q 300 345 310 360 L 310 380 Z" fill="#FDFBF0" stroke="#B0B0B0" strokeWidth="0.8" />
            <path d="M 291 379 L 291 361 Q 297 353 303 361 L 303 379 Z" fill="rgba(0,0,0,0.06)" stroke="none" />
          </g>
        </g>
        <path d="M 175 580 L 175 510 Q 200 485 225 510 L 225 580 Z" fill="#755E4C" stroke="#4A3F35" strokeWidth="1" />

        {/* Foundation Shadow and Grass - Rendered after castle to hide gaps */}
        <ellipse cx="200" cy="580" rx="160" ry="12" fill="rgba(0,0,0,0.1)" />
        
        <path d="M 20 575 Q 200 550 380 575 L 380 600 L 20 600 Z" fill="#7D8A52" />
        <path d="M 30 570 Q 200 545 370 570 L 370 585 Q 200 560 30 585 Z" fill="#8A9A5B" />
        {[...Array(20)].map((_, i) => (
          <path 
            key={`grass-${i}`} 
            d={`M ${30 + i * 18} 570 Q ${35 + i * 18} 550 ${40 + i * 18} 570`} 
            fill="none" 
            stroke="#8A9A5B" 
            strokeWidth="1.5" 
          />
        ))}

        {/* Kintsugi Cracks */}
        <AnimatePresence>
          {cracks.map((crack) => (
            <g key={crack.id}>
              <motion.path
                d={crack.path}
                fill="none"
                stroke="#D4AF37"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                style={{ filter: "drop-shadow(0 0 4px #ffd700)" }}
              />
              {crack.glints.map(glint => (
                <motion.circle
                  key={glint.id}
                  cx={glint.x}
                  cy={glint.y}
                  r={2.5 * glint.scale}
                  fill={glint.color}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: [0, 0.9, 0.4, 1, 0],
                    scale: [0, 1.1, 0.9, 1.2, 0],
                  }}
                  transition={{ 
                    duration: 3 + Math.random() * 2, 
                    repeat: Infinity, 
                    delay: glint.delay,
                    ease: "easeInOut"
                  }}
                />
              ))}
            </g>
          ))}
        </AnimatePresence>

        {/* Realistic Flowers with Stems and Leaves */}
        <AnimatePresence>
          {flowers.map((flower) => (
            <motion.g
              key={flower.id}
              initial={{ scale: 0, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 80, damping: 12 }}
              style={{ transformOrigin: `${flower.x}px ${flower.y}px` }}
            >
              {/* Botanical Base: Stems and Leaves */}
              <g transform={`translate(${flower.x},${flower.y})`}>
                {flower.isGround && (
                  <path 
                    d="M 0 0 Q 2 15 0 28" 
                    stroke="#5E6A3A" 
                    strokeWidth="1.5" 
                    fill="none" 
                  />
                )}
                <g transform={`rotate(${flower.leafAngle})`}>
                  <path d="M 0 0 Q 5 15 0 25" stroke="#6C7A45" strokeWidth="1" fill="none" opacity="0.8" />
                  <path d="M 0 5 C 10 2, 14 10, 0 14" fill="#8A9A5B" opacity="0.6" />
                  <path d="M 0 5 C -10 2, -14 10, 0 14" fill="#8A9A5B" opacity="0.6" />
                </g>
              </g>

              {flower.type === 'lavender' ? (
                <g transform={`translate(${flower.x},${flower.y}) rotate(${flower.rotate}) scale(${flower.size / 10})`}>
                  <path d="M 0 20 Q 2 10 0 0" stroke="#6C7A45" strokeWidth="0.8" fill="none" />
                  {[...Array(6)].map((_, i) => (
                    <path 
                      key={i} 
                      d="M 0 0 C 4 -2, 4 -6, 0 -8 C -4 -6, -4 -2, 0 0" 
                      fill={flower.color} 
                      transform={`translate(0, ${i * 4}) rotate(${i % 2 === 0 ? 35 : -35})`} 
                    />
                  ))}
                </g>
              ) : flower.type === 'rose' ? (
                <g transform={`translate(${flower.x},${flower.y}) scale(${flower.size / 15}) rotate(${flower.rotate})`}>
                  {/* Lush layers for rose */}
                  {[0, 72, 144, 216, 288].map(deg => (
                    <path 
                      key={deg} 
                      d="M 0 0 C -14 -6, -18 -22, 0 -25 C 18 -22, 14 -6, 0 0" 
                      fill={flower.color} 
                      transform={`rotate(${deg})`} 
                      opacity="0.6"
                    />
                  ))}
                  <path 
                    d="M -6 -3 C -10 -18, 10 -18, 6 -3 C 3 6, -3 6, -6 -3" 
                    fill={flower.color} 
                    opacity="0.7"
                    filter="brightness(0.9)"
                  />
                  <path d="M -4 -6 Q 0 -10 4 -6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" />
                </g>
              ) : flower.type === 'peony' ? (
                <g transform={`translate(${flower.x},${flower.y}) scale(${flower.size / 20}) rotate(${flower.rotate})`}>
                  {[...Array(12)].map((_, i) => (
                    <path 
                      key={i} 
                      d="M 0 0 C -12 -12, 12 -12, 0 0" 
                      fill={flower.color} 
                      transform={`rotate(${i * 30}) translate(0, -6)`} 
                      opacity="0.6"
                    />
                  ))}
                  {[...Array(8)].map((_, i) => (
                    <path 
                      key={`in-${i}`} 
                      d="M 0 0 C -7 -10, 7 -10, 0 0" 
                      fill={flower.color} 
                      transform={`rotate(${i * 45 + 15})`} 
                    />
                  ))}
                  <circle r="3.5" fill="#FFE5B4" />
                </g>
              ) : flower.type === 'babybreath' ? (
                <g transform={`translate(${flower.x},${flower.y})`}>
                  <path d="M 0 0 L 8 8 M 0 0 L -8 8 M 0 0 L 0 -12" stroke="#8A9A5B" strokeWidth="0.4" opacity="0.6" />
                  {[0, 90, 180, 270].map((deg, i) => (
                    <circle key={i} cx={Math.cos(deg) * 6} cy={Math.sin(deg) * 6} r="1.8" fill="white" stroke="#E0E0E0" strokeWidth="0.2" />
                  ))}
                </g>
              ) : flower.type === 'lily' ? (
                <g transform={`translate(${flower.x},${flower.y}) scale(${flower.size / 18}) rotate(${flower.rotate})`}>
                  {/* Sepals (Small green base to make it visible on white wall) */}
                  {[0, 120, 240].map(deg => (
                    <path 
                      key={`sepal-${deg}`} 
                      d="M 0 0 C -3 5, -5 10, 0 12 C 5 10, 3 5, 0 0" 
                      fill="#6C7A45" 
                      transform={`rotate(${deg + 60})`} 
                      opacity="0.6"
                    />
                  ))}
                  {/* Petals */}
                  {[0, 120, 240].map(deg => (
                    <path 
                      key={deg} 
                      d="M 0 0 C -6 -12, -10 -30, 0 -35 C 10 -30, 6 -12, 0 0" 
                      fill={flower.color} 
                      stroke="rgba(0,0,0,0.05)"
                      strokeWidth="0.2"
                      transform={`rotate(${deg})`} 
                    />
                  ))}
                  <g opacity="0.9">
                    <path d="M 0 -8 L 0 -22" stroke="#DAA520" strokeWidth="1.2" strokeLinecap="round" />
                    <circle cy="-23" r="1.8" fill="#DAA520" />
                  </g>
                </g>
              ) : (
                <g transform={`translate(${flower.x},${flower.y}) rotate(${flower.rotate}) scale(${flower.size / 12})`}>
                  {[...Array(8)].map((_, i) => (
                    <path 
                      key={i} 
                      d="M 0 0 C -5 -10, 5 -10, 0 0" 
                      fill={flower.color} 
                      transform={`rotate(${i * 45}) translate(0, -5)`} 
                    />
                  ))}
                  <circle r="3" fill="#FFD700" />
                </g>
              )}
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>
    </div>
  );
};




export default function App() {
  const today = new Date().toISOString().split('T')[0];
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [roughThoughts, setRoughThoughts] = useState<RoughThought[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [newWin, setNewWin] = useState('');
  const [newThought, setNewThought] = useState('');

  // Formatter of User Display Name (e.g. "Nurul Puspahapsari" -> "Nurul")
  const getFirstWord = (name: string | null) => {
    if (!name) return 'Beautiful Soul';
    return name.trim().split(' ')[0];
  };

  // Handle Authentication persistence and triggers
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
      if (currentUser) {
        // On successful login, save the user info object conforming to Schema/Rules
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          await setDoc(userRef, {
            userId: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || ''
          }, { merge: true });
        } catch (err) {
          console.error('Failed to create user profile in Firestore:', err);
        }
      } else {
        // Clear lists if logged out
        setDayEntries([]);
        setRoughThoughts([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to Cloud Firestore collections real-time per user
  useEffect(() => {
    if (!user) return;

    // 1. Subscribe to Wins
    const winsPath = `users/${user.uid}/wins`;
    const unsubscribeWins = onSnapshot(collection(db, winsPath), (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data() as { id: string; text: string; date: string });
      
      // Group wins by date
      const groups: { [date: string]: DailyWin[] } = {};
      list.forEach(w => {
        if (!groups[w.date]) {
          groups[w.date] = [];
        }
        groups[w.date].push({ id: w.id, text: w.text });
      });

      const entries = Object.entries(groups).map(([date, wins]) => ({
        date,
        wins
      }));
      setDayEntries(entries);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, winsPath);
    });

    // 2. Subscribe to Thoughts
    const thoughtsPath = `users/${user.uid}/thoughts`;
    const unsubscribeThoughts = onSnapshot(collection(db, thoughtsPath), (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id,
          text: data.text,
          timestamp: data.timestamp
        } as RoughThought;
      });
      setRoughThoughts(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, thoughtsPath);
    });

    return () => {
      unsubscribeWins();
      unsubscribeThoughts();
    };
  }, [user]);

  // Derived counts for the castle
  const totalWins = useMemo(() => dayEntries.reduce((acc, day) => acc + day.wins.length, 0), [dayEntries]);
  const totalThoughts = useMemo(() => roughThoughts.length, [roughThoughts]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const addWin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWin.trim()) return;
    if (!user) {
      alert('Please sign in with Google first to write your journal');
      return;
    }

    const winId = crypto.randomUUID();
    const path = `users/${user.uid}/wins`;
    const winDocRef = doc(db, path, winId);
    
    try {
      await setDoc(winDocRef, {
        id: winId,
        text: newWin,
        date: selectedDate,
        createdAt: serverTimestamp()
      });
      setNewWin('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${path}/${winId}`);
    }
  };

  const removeWin = async (date: string, id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/wins`;
    const winDocRef = doc(db, path, id);
    try {
      await deleteDoc(winDocRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
    }
  };

  const addThought = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThought.trim()) return;
    if (!user) {
      alert('Please sign in with Google first to write your journal');
      return;
    }

    const thoughtId = crypto.randomUUID();
    const path = `users/${user.uid}/thoughts`;
    const thoughtDocRef = doc(db, path, thoughtId);
    
    try {
      await setDoc(thoughtDocRef, {
        id: thoughtId,
        text: newThought,
        timestamp: Date.now(),
        createdAt: serverTimestamp()
      });
      setNewThought('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${path}/${thoughtId}`);
    }
  };

  const removeThought = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/thoughts`;
    const thoughtDocRef = doc(db, path, id);
    try {
      await deleteDoc(thoughtDocRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
    }
  };

  return (
    <div className="min-h-screen pb-20 px-4 md:px-8 max-w-[1400px] mx-auto relative">
      {/* Notion-style Top Auth Bar */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex items-center gap-3 z-50">
        {!loadingAuth && user && (
          <span className="font-sans text-xs text-stone-600 bg-sage/10 px-2.5 py-1.5 rounded-md border border-sage/15 flex items-center gap-1.5 hover:bg-sage/20 transition-all shadow-sm">
            Hi, <span className="font-bold text-stone-800">{getFirstWord(user.displayName)}!</span> ✨
          </span>
        )}
        <button
          onClick={user ? handleSignOut : handleSignIn}
          disabled={loadingAuth}
          className="bg-white/90 hover:bg-white text-stone-700 px-3 py-1.5 rounded-md border border-stone-200 shadow-sm hover:shadow active:scale-95 transition-all text-xs font-semibold font-sans flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <LogIn size={13} className="text-sage" />
          {loadingAuth ? 'Loading...' : user ? 'Sign out' : 'Sign in with Google'}
        </button>
      </div>

      {/* Header */}
      <header className="pt-20 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-5xl md:text-7xl text-sage tracking-tight font-bold"
        >
          The Unperfect Me
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4 text-stone-600 font-sans italic max-w-md mx-auto leading-relaxed"
        >
          Beautiful not because it's perfect, but because it has the courage to exist.
        </motion.p>
      </header>

      {/* Castle Visualization */}
      <section className="my-12">
        <Castle winCount={totalWins} thoughtCount={totalThoughts} />
      </section>

      {/* Inputs Section */}
      <div className="max-w-[1300px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Daily Wins */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="lg:col-span-5 bg-white/60 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-sage/20 flex flex-col h-full"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-sage/10 p-2 rounded-lg">
              <Cherry className="text-sage" size={20} />
            </div>
            <h2 className="font-serif text-xl text-stone-800">Daily Wins</h2>
          </div>

          {!loadingAuth && !user && (
            <div className="bg-amber-50/70 border border-amber-200/50 rounded-lg p-3 text-stone-600 text-[11px] text-center flex items-center justify-center gap-2 mb-4">
              <Sparkles size={12} className="text-amber-500 shrink-0 animate-pulse" />
              <span>Please sign in with Google first to write your journal.</span>
            </div>
          )}

          <form onSubmit={addWin} className={`space-y-3 transition-all duration-300 ${!user ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[9px] uppercase tracking-[0.2em] text-stone-400 font-black mb-1 flex items-center gap-1 px-1">
                  <CalendarIcon size={10} className="text-sage" /> Date
                </label>
                <input 
                  type="date" 
                  value={selectedDate}
                  max={today}
                  disabled={!user}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-cream/30 rounded-md p-2 outline-none border border-sage/10 focus:border-sage/30 focus:bg-white transition-all font-sans text-stone-700 text-xs shadow-sm disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex-[3]">
                <label className="text-[9px] uppercase tracking-[0.2em] text-stone-400 font-black mb-1 flex items-center gap-1 px-1">
                  Small Win
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="A small win for today..."
                    value={newWin}
                    disabled={!user}
                    onChange={(e) => setNewWin(e.target.value)}
                    className="flex-1 bg-cream/30 rounded-md p-2 outline-none border border-sage/10 focus:border-sage/30 focus:bg-white transition-all font-sans text-stone-700 text-xs shadow-sm disabled:cursor-not-allowed"
                  />
                  <button 
                    type="submit"
                    disabled={!user}
                    className="bg-sage text-white px-3 rounded-md hover:bg-sage/90 transition-all shadow-md active:scale-95 flex items-center justify-center group h-[34px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={16} className="group-hover:rotate-90 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* List of Wins */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 mt-6">
            <div className="space-y-5 overflow-y-auto pr-2 custom-scrollbar">
            {dayEntries.sort((a,b) => a.date.localeCompare(b.date)).map(day => (
               <div key={day.date} className="group/day relative bg-white/30 rounded-lg p-3 border border-sage/5 hover:border-sage/10 transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-sage/70 font-mono tracking-wider">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <div className="h-[1px] flex-1 bg-sage/10" />
                </div>
                <ul className="space-y-1.5 ml-1">
                  {day.wins.map(win => (
                    <motion.li 
                      key={win.id}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group/item flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2 pt-0.5">
                        <span className="w-1 h-1 rounded-full bg-sage/30 mt-1.5 shrink-0" />
                        <span className="text-stone-600 font-sans text-xs leading-relaxed">
                          {win.text}
                        </span>
                      </div>
                      <button 
                        onClick={() => removeWin(day.date, win.id)}
                        className="opacity-0 group-hover/item:opacity-100 text-stone-300 hover:text-red-400 transition-all pt-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </div>
            ))}
            {dayEntries.length === 0 && (
              <div className="text-center py-10">
                <div className="text-sage/20 mb-3 flex justify-center">
                  <Cherry size={32} />
                </div>
                <p className="text-stone-400 italic text-[11px]">No flowers have bloomed yet today.</p>
              </div>
            )}
            </div>
          </div>
        </motion.div>

        {/* Things to let go */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="lg:col-span-7 bg-white/60 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-gold/20 flex flex-col h-full"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gold/10 p-2 rounded-lg">
              <Sparkles className="text-gold" size={20} />
            </div>
            <h2 className="font-serif text-xl text-stone-800">Things to let go...</h2>
          </div>

          {!loadingAuth && !user && (
            <div className="bg-amber-50/70 border border-amber-200/50 rounded-lg p-3 text-stone-600 text-[11px] text-center flex items-center justify-center gap-2 mb-4">
              <Sparkles size={12} className="text-amber-500 shrink-0 animate-pulse" />
              <span>Please sign in with Google first to write your journal.</span>
            </div>
          )}

          <form onSubmit={addThought} className={`mb-6 transition-all duration-300 ${!user ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-black flex items-center gap-2 px-1">
                Release your noisy thoughts...
              </label>
              <textarea 
                placeholder="Today felt exhausting because..."
                value={newThought}
                disabled={!user}
                onChange={(e) => setNewThought(e.target.value)}
                className="w-full bg-cream/50 rounded-lg p-3 outline-none border border-gold/10 focus:border-gold/30 focus:bg-white transition-all font-sans text-stone-700 shadow-inner resize-none text-sm h-[80px] disabled:cursor-not-allowed"
              />
              <button 
                type="submit"
                disabled={!user}
                className="w-full bg-stone-800 text-gold p-3 rounded-lg hover:bg-stone-900 transition-all shadow-lg font-sans font-bold text-sm flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <HeartPulse size={18} className="group-hover:scale-125 transition-transform" /> 
                Mend with Gold (Kintsugi)
              </button>
            </div>
          </form>

          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
            {roughThoughts.slice().reverse().map(thought => (
              <motion.div 
                key={thought.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative bg-white/40 p-4 rounded-lg border-l-4 border-gold shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex justify-between items-start">
                  <p className="text-stone-700 leading-relaxed font-sans text-xs italic">"{thought.text}"</p>
                  <button 
                    onClick={() => removeThought(thought.id)}
                    className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 transition-all ml-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Sparkles size={10} className="text-gold" />
                  <time className="text-[9px] text-stone-400 uppercase tracking-widest font-black">
                    {new Date(thought.timestamp).toLocaleDateString('en-US')} • {new Date(thought.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              </motion.div>
            ))}
            {roughThoughts.length === 0 && (
              <div className="text-center py-8">
                <div className="text-gold/20 mb-3 flex justify-center">
                  <Sparkles size={32} />
                </div>
                <p className="text-stone-400 italic text-xs">No cracks have been mended yet.</p>
              </div>
            )}
            </div>
          </div>
        </motion.div>
      </div>

      <footer className="mt-32 text-center">
        <p className="text-stone-400 font-serif italic text-lg leading-relaxed max-w-lg mx-auto">
          "The world breaks everyone and afterward many are strong at the broken places." 
          <span className="block mt-2 text-gold font-sans font-bold text-xs uppercase tracking-widest">— Ernest Hemingway</span>
        </p>
        <div className="mt-12 flex justify-center gap-6">
          <div className="w-2 h-2 rounded-full bg-sage/30" />
          <div className="w-2 h-2 rounded-full bg-gold/30" />
          <div className="w-2 h-2 rounded-full bg-sage/30" />
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #D4AF3733;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D4AF3766;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: sepia(50%) hue-rotate(40deg) saturate(300%) brightness(80%);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
