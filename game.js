'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ── Layout constants ──────────────────────────────────────────────────────────
const GAME_W = 480;
const GAME_H = 720;
const LANE_COUNT = 4;
const ROAD_LEFT = 60;
const ROAD_RIGHT = GAME_W - 60;
const ROAD_W = ROAD_RIGHT - ROAD_LEFT;
const LANE_W = ROAD_W / LANE_COUNT;

canvas.width = GAME_W;
canvas.height = GAME_H;

// ── Player car ────────────────────────────────────────────────────────────────
const CAR_W = 36;
const CAR_H = 60;
const CAR_MAX_SPEED_X = 5;
const CAR_ACCEL_X = 0.4;
const CAR_FRICTION = 0.82;
const CAR_START_Y = GAME_H - 140;

// ── Game state ────────────────────────────────────────────────────────────────
let state;

function createInitialState() {
  return {
    running: false,
    paused: false,
    gameOver: false,
    score: 0,
    best: parseInt(localStorage.getItem('rtr_best') || '0', 10),
    lives: 3,
    scrollSpeed: 3,
    speedTimer: 0,
    invincibleTimer: 0,
    player: {
      x: GAME_W / 2 - CAR_W / 2,
      y: CAR_START_Y,
      vx: 0,
    },
    road: {
      dashOffset: 0,
    },
    traffic: [],
    particles: [],
    keys: {},
  };
}

// ── Input ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (!state) return;
  state.keys[e.key] = true;
  if ((e.key === 'p' || e.key === 'P') && state.running && !state.gameOver) {
    togglePause();
  }
});
window.addEventListener('keyup', e => {
  if (!state) return;
  state.keys[e.key] = false;
});

// ── UI buttons ────────────────────────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('restart-btn').addEventListener('click', startGame);

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function startGame() {
  state = createInitialState();
  state.running = true;
  hide('start-screen');
  hide('game-over-screen');
  hide('pause-screen');
  updateHUD();
  requestAnimationFrame(loop);
}

function togglePause() {
  state.paused = !state.paused;
  if (state.paused) {
    show('pause-screen');
  } else {
    hide('pause-screen');
    requestAnimationFrame(loop);
  }
}

// ── Traffic spawning ──────────────────────────────────────────────────────────
const TRAFFIC_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c'];
let spawnTimer = 0;
const BASE_SPAWN_INTERVAL = 80;

function spawnCar() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const laneX = ROAD_LEFT + lane * LANE_W + (LANE_W - CAR_W) / 2;
  // avoid spawning on top of existing cars
  const tooClose = state.traffic.some(t => Math.abs(t.x - laneX) < LANE_W * 0.8 && t.y < CAR_H * 2);
  if (tooClose) return;
  state.traffic.push({
    x: laneX,
    y: -CAR_H - 10,
    color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
    speed: state.scrollSpeed * (0.6 + Math.random() * 0.5),
  });
}

// ── Particles ─────────────────────────────────────────────────────────────────
function spawnExplosion(x, y) {
  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.5;
    const speed = 2 + Math.random() * 4;
    state.particles.push({
      x: x + CAR_W / 2,
      y: y + CAR_H / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.03 + Math.random() * 0.03,
      r: Math.floor(Math.random() * 10) + 4,
      color: `hsl(${20 + Math.random() * 40}, 100%, ${50 + Math.random() * 20}%)`,
    });
  }
}

// ── Collision ─────────────────────────────────────────────────────────────────
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ── Update ────────────────────────────────────────────────────────────────────
function update() {
  const p = state.player;

  // Player movement
  const left = state.keys['ArrowLeft'] || state.keys['a'] || state.keys['A'];
  const right = state.keys['ArrowRight'] || state.keys['d'] || state.keys['D'];

  if (left) p.vx -= CAR_ACCEL_X;
  if (right) p.vx += CAR_ACCEL_X;
  p.vx = Math.max(-CAR_MAX_SPEED_X, Math.min(CAR_MAX_SPEED_X, p.vx));
  p.vx *= CAR_FRICTION;
  p.x += p.vx;

  // Clamp to road
  p.x = Math.max(ROAD_LEFT + 4, Math.min(ROAD_RIGHT - CAR_W - 4, p.x));

  // Vertical scroll (forward/back nudge)
  const up = state.keys['ArrowUp'] || state.keys['w'] || state.keys['W'];
  const down = state.keys['ArrowDown'] || state.keys['s'] || state.keys['S'];
  if (up) p.y = Math.max(GAME_H * 0.25, p.y - 2);
  if (down) p.y = Math.min(GAME_H - CAR_H - 20, p.y + 2);

  // Road scroll
  state.road.dashOffset = (state.road.dashOffset + state.scrollSpeed) % 60;

  // Speed ramp
  state.speedTimer++;
  if (state.speedTimer % 300 === 0) {
    state.scrollSpeed = Math.min(12, state.scrollSpeed + 0.3);
    updateHUD();
  }

  // Score
  state.score += Math.round(state.scrollSpeed * 0.1);
  updateScoreDisplay();

  // Invincibility flash
  if (state.invincibleTimer > 0) state.invincibleTimer--;

  // Spawn traffic
  spawnTimer++;
  const interval = Math.max(30, BASE_SPAWN_INTERVAL - state.scrollSpeed * 4);
  if (spawnTimer >= interval) {
    spawnTimer = 0;
    spawnCar();
  }

  // Update traffic
  state.traffic = state.traffic.filter(car => {
    car.y += state.scrollSpeed + car.speed;
    return car.y < GAME_H + CAR_H;
  });

  // Collision detection
  if (state.invincibleTimer === 0) {
    for (const car of state.traffic) {
      const margin = 6;
      if (rectsOverlap(
        p.x + margin, p.y + margin, CAR_W - margin * 2, CAR_H - margin * 2,
        car.x + margin, car.y + margin, CAR_W - margin * 2, CAR_H - margin * 2,
      )) {
        spawnExplosion(p.x, p.y);
        state.lives--;
        state.invincibleTimer = 120;
        updateHUD();
        if (state.lives <= 0) {
          triggerGameOver();
          return;
        }
        break;
      }
    }
  }

  // Particles
  state.particles = state.particles.filter(pt => {
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vy += 0.15;
    pt.life -= pt.decay;
    return pt.life > 0;
  });
}

function triggerGameOver() {
  state.gameOver = true;
  state.running = false;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('rtr_best', state.best);
  }
  document.getElementById('final-score').textContent = state.score;
  document.getElementById('best-score').textContent = state.best;
  show('game-over-screen');
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function drawRoad() {
  // Grass
  ctx.fillStyle = '#2d5a1b';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Road surface
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);

  // Road edges
  ctx.strokeStyle = '#f0c040';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT, 0);
  ctx.lineTo(ROAD_LEFT, GAME_H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ROAD_RIGHT, 0);
  ctx.lineTo(ROAD_RIGHT, GAME_H);
  ctx.stroke();

  // Lane dashes
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([30, 30]);
  ctx.lineDashOffset = -state.road.dashOffset;
  for (let i = 1; i < LANE_COUNT; i++) {
    const lx = ROAD_LEFT + i * LANE_W;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, GAME_H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawCarShape(x, y, color, flipped) {
  const w = CAR_W;
  const h = CAR_H;

  ctx.save();
  ctx.translate(x, y);
  if (flipped) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI);
    ctx.translate(-w / 2, -h / 2);
  }

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, h * 0.12, w, h * 0.76, 6);
  ctx.fill();

  // Windshield
  ctx.fillStyle = 'rgba(160,220,255,0.75)';
  ctx.beginPath();
  ctx.roundRect(w * 0.12, h * 0.14, w * 0.76, h * 0.22, 3);
  ctx.fill();

  // Rear window
  ctx.fillStyle = 'rgba(160,220,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(w * 0.12, h * 0.64, w * 0.76, h * 0.14, 3);
  ctx.fill();

  // Wheels
  ctx.fillStyle = '#111';
  const wheelW = 8;
  const wheelH = 14;
  ctx.fillRect(-wheelW + 2, h * 0.2, wheelW, wheelH);
  ctx.fillRect(w - 2, h * 0.2, wheelW, wheelH);
  ctx.fillRect(-wheelW + 2, h * 0.6, wheelW, wheelH);
  ctx.fillRect(w - 2, h * 0.6, wheelW, wheelH);

  // Headlights
  ctx.fillStyle = '#ffffc0';
  ctx.fillRect(w * 0.12, 0, w * 0.28, h * 0.14);
  ctx.fillRect(w * 0.6, 0, w * 0.28, h * 0.14);

  // Taillights
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(w * 0.12, h * 0.86, w * 0.28, h * 0.14);
  ctx.fillRect(w * 0.6, h * 0.86, w * 0.28, h * 0.14);

  ctx.restore();
}

function drawPlayer() {
  const p = state.player;
  // Invincibility flash: skip every other 8 frames
  if (state.invincibleTimer > 0 && Math.floor(state.invincibleTimer / 8) % 2 === 0) return;
  drawCarShape(p.x, p.y, '#f0c040', false);
}

function drawTraffic() {
  for (const car of state.traffic) {
    drawCarShape(car.x, car.y, car.color, true);
  }
}

function drawParticles() {
  for (const pt of state.particles) {
    ctx.globalAlpha = pt.life;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r * pt.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('lives').textContent = state.lives;
  document.getElementById('speed').textContent = state.scrollSpeed.toFixed(1);
}

function updateScoreDisplay() {
  document.getElementById('score').textContent = state.score;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop() {
  if (!state.running || state.paused) return;

  update();

  // Draw
  ctx.clearRect(0, 0, GAME_W, GAME_H);
  drawRoad();
  drawTraffic();
  drawPlayer();
  drawParticles();

  requestAnimationFrame(loop);
}

// ── Init: draw a static frame so canvas isn't blank before game starts ────────
(function staticFrame() {
  const s = createInitialState();
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.fillStyle = '#2d5a1b';
  ctx.fillRect(0, 0, ROAD_LEFT, GAME_H);
  ctx.fillRect(ROAD_RIGHT, 0, GAME_W - ROAD_RIGHT, GAME_H);
  drawCarShape(GAME_W / 2 - CAR_W / 2, CAR_START_Y, '#f0c040', false);
})();
