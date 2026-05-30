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
ctx.imageSmoothingEnabled = false;

// ── Player car ────────────────────────────────────────────────────────────────
const CAR_W = 36;
const CAR_H = 60;
const CAR_MAX_SPEED_X = 5;
const CAR_ACCEL_X = 0.4;
const CAR_FRICTION = 0.82;
const CAR_START_Y = GAME_H - 140;

// ── Pixel-snap helper ─────────────────────────────────────────────────────────
function px(v) { return Math.round(v); }

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
      scrollOffset: 0,
    },
    traffic: [],
    scenery: [],
    skidMarks: [],
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
  sceneryTimer = 0;
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
  const tooClose = state.traffic.some(t => Math.abs(t.x - laneX) < LANE_W * 0.8 && t.y < CAR_H * 2);
  if (tooClose) return;
  state.traffic.push({
    x: laneX,
    y: -CAR_H - 10,
    color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
    speed: state.scrollSpeed * (0.6 + Math.random() * 0.5),
  });
}

// ── Scenery spawning ──────────────────────────────────────────────────────────
let sceneryTimer = 0;
const BASE_SCENERY_INTERVAL = 180;

function spawnScenery() {
  const side = Math.random() < 0.5 ? 'left' : 'right';
  const tooClose = state.scenery.some(s => s.side === side && s.y < 80);
  if (tooClose) return;
  const postX = side === 'left' ? 30 : 442;
  const type = Math.random() < 0.6 ? 'lamp' : 'sign';
  const color = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
  state.scenery.push({ x: postX, y: -50, type, side, color });
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

  // Skid marks when steering hard
  if (Math.abs(p.vx) > 2) {
    state.skidMarks.push({ x: px(p.x), y: px(p.y + 50), alpha: 0.7 });
    if (state.skidMarks.length > 200) state.skidMarks.shift();
  }
  state.skidMarks = state.skidMarks.filter(m => {
    m.y += state.scrollSpeed;
    m.alpha -= 0.008;
    return m.alpha > 0 && m.y < GAME_H + 10;
  });

  // Road scroll
  state.road.dashOffset  = (state.road.dashOffset  + state.scrollSpeed) % 60;
  state.road.scrollOffset = (state.road.scrollOffset + state.scrollSpeed) % 40;

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

  // Update scenery
  state.scenery = state.scenery.filter(s => {
    s.y += state.scrollSpeed;
    return s.y < GAME_H + 60;
  });
  sceneryTimer++;
  const sceneryInterval = Math.max(90, BASE_SCENERY_INTERVAL - state.scrollSpeed * 3);
  if (sceneryTimer >= sceneryInterval) {
    sceneryTimer = 0;
    spawnScenery();
  }

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

function drawGrass() {
  const stripeH = 20;
  const colors = ['#2d5a1b', '#3a7a22'];
  const offset = state.road.scrollOffset % (stripeH * 2);
  for (let y = -stripeH * 2 + offset; y < GAME_H; y += stripeH) {
    const idx = Math.abs(Math.floor((y - offset) / stripeH)) % 2;
    ctx.fillStyle = colors[idx];
    ctx.fillRect(0, px(y), ROAD_LEFT, stripeH);
    ctx.fillRect(ROAD_RIGHT, px(y), GAME_W - ROAD_RIGHT, stripeH);
  }
}

function drawRoad() {
  // Road surface
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);

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

function drawKerb() {
  const blockH = 20;
  const blockW = 8;
  const colors = ['#cc2222', '#eeeeee'];
  const offset = state.road.scrollOffset % (blockH * 2);
  for (let y = -blockH * 2 + offset; y < GAME_H; y += blockH) {
    const idx = Math.abs(Math.floor((y - offset) / blockH)) % 2;
    ctx.fillStyle = colors[idx];
    ctx.fillRect(ROAD_LEFT - blockW, px(y), blockW, blockH);
    ctx.fillRect(ROAD_RIGHT, px(y), blockW, blockH);
  }
}

function drawScenery() {
  for (const item of state.scenery) {
    const x = px(item.x);
    const y = px(item.y);

    if (item.type === 'lamp') {
      // Post
      ctx.fillStyle = '#888888';
      ctx.fillRect(x - 2, y - 40, 4, 40);
      // Arm toward road
      if (item.side === 'left') {
        ctx.fillRect(x - 2, y - 40, 14, 4);
      } else {
        ctx.fillRect(x - 12, y - 40, 14, 4);
      }
      // Fixture
      const fx = item.side === 'left' ? x + 10 : x - 18;
      ctx.fillStyle = '#cccccc';
      ctx.fillRect(fx, y - 44, 8, 6);
      // Pixelated glow (stacked rects)
      ctx.fillStyle = '#ffffa0';
      ctx.globalAlpha = 0.3;
      ctx.fillRect(fx - 2, y - 46, 12, 8);
      ctx.globalAlpha = 0.15;
      ctx.fillRect(fx - 5, y - 49, 18, 12);
      ctx.globalAlpha = 0.05;
      ctx.fillRect(fx - 8, y - 52, 24, 16);
      ctx.globalAlpha = 1;
    } else {
      // Sign post
      ctx.fillStyle = '#888888';
      ctx.fillRect(x - 1, y - 30, 3, 30);
      // Sign board
      ctx.fillStyle = item.color;
      ctx.fillRect(x - 12, y - 30, 24, 16);
      // Board border (4 edges via fillRect)
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 12, y - 30, 24, 1); // top
      ctx.fillRect(x - 12, y - 15, 24, 1); // bottom
      ctx.fillRect(x - 12, y - 30, 1, 16); // left
      ctx.fillRect(x + 11, y - 30, 1, 16); // right
    }
  }
}

function drawCarShape(x, y, color, flipped) {
  const w = CAR_W;
  const h = CAR_H;

  ctx.save();
  ctx.translate(px(x), px(y));
  if (flipped) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI);
    ctx.translate(-w / 2, -h / 2);
  }

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(px(w * 0.05) + 2, px(h * 0.12) + 2, w - px(w * 0.05), px(h * 0.76));

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(0, px(h * 0.12), w, px(h * 0.76));

  // Body top highlight strip
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(1, px(h * 0.12), w - 2, 3);

  // Windshield
  ctx.fillStyle = 'rgba(140,210,255,0.9)';
  ctx.fillRect(px(w * 0.12), px(h * 0.14), px(w * 0.76), px(h * 0.22));
  // Glare
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(px(w * 0.14), px(h * 0.16), px(w * 0.22), px(h * 0.08));

  // Rear window
  ctx.fillStyle = 'rgba(100,170,220,0.8)';
  ctx.fillRect(px(w * 0.12), px(h * 0.64), px(w * 0.76), px(h * 0.14));

  // Wheels
  const wheelW = 8;
  const wheelH = 14;
  ctx.fillStyle = '#222222';
  ctx.fillRect(-wheelW + 2, px(h * 0.2), wheelW, wheelH);
  ctx.fillRect(w - 2, px(h * 0.2), wheelW, wheelH);
  ctx.fillRect(-wheelW + 2, px(h * 0.6), wheelW, wheelH);
  ctx.fillRect(w - 2, px(h * 0.6), wheelW, wheelH);
  // Wheel hubs
  ctx.fillStyle = '#555555';
  ctx.fillRect(-wheelW + 3, px(h * 0.2) + 3, wheelW - 2, 4);
  ctx.fillRect(w - 1, px(h * 0.2) + 3, wheelW - 2, 4);
  ctx.fillRect(-wheelW + 3, px(h * 0.6) + 3, wheelW - 2, 4);
  ctx.fillRect(w - 1, px(h * 0.6) + 3, wheelW - 2, 4);

  // Headlights
  ctx.fillStyle = '#ffffc0';
  ctx.fillRect(px(w * 0.1), 0, px(w * 0.28), px(h * 0.14));
  ctx.fillRect(px(w * 0.62), 0, px(w * 0.28), px(h * 0.14));

  // Taillights
  ctx.fillStyle = '#ff3333';
  ctx.fillRect(px(w * 0.1), px(h * 0.86), px(w * 0.28), px(h * 0.14));
  ctx.fillRect(px(w * 0.62), px(h * 0.86), px(w * 0.28), px(h * 0.14));

  ctx.restore();
}

function drawPlayer() {
  const p = state.player;
  if (state.invincibleTimer > 0 && Math.floor(state.invincibleTimer / 8) % 2 === 0) return;
  drawCarShape(p.x, p.y, '#f0c040', false);
}

function drawTraffic() {
  for (const car of state.traffic) {
    drawCarShape(car.x, car.y, car.color, true);
  }
}

function drawSkidMarks() {
  for (const m of state.skidMarks) {
    ctx.globalAlpha = m.alpha;
    ctx.fillStyle = '#111111';
    ctx.fillRect(m.x + 4, m.y, 2, 6);
    ctx.fillRect(m.x + 28, m.y, 2, 6);
  }
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const pt of state.particles) {
    ctx.globalAlpha = pt.life;
    ctx.fillStyle = pt.color;
    ctx.fillRect(px(pt.x - pt.r * pt.life / 2), px(pt.y - pt.r * pt.life / 2),
                 px(pt.r * pt.life), px(pt.r * pt.life));
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

  ctx.clearRect(0, 0, GAME_W, GAME_H);
  drawGrass();
  drawRoad();
  drawKerb();
  drawScenery();
  drawSkidMarks();
  drawTraffic();
  drawPlayer();
  drawParticles();

  requestAnimationFrame(loop);
}

// ── Init: draw a static frame so canvas isn't blank before game starts ────────
(function staticFrame() {
  const stripeH = 20;
  const grassColors = ['#2d5a1b', '#3a7a22'];
  for (let y = 0; y < GAME_H; y += stripeH) {
    const idx = Math.floor(y / stripeH) % 2;
    ctx.fillStyle = grassColors[idx];
    ctx.fillRect(0, y, ROAD_LEFT, stripeH);
    ctx.fillRect(ROAD_RIGHT, y, GAME_W - ROAD_RIGHT, stripeH);
  }
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);
  // Kerb preview
  const blockH = 20;
  const blockW = 8;
  const kerbColors = ['#cc2222', '#eeeeee'];
  for (let y = 0; y < GAME_H; y += blockH) {
    const idx = Math.floor(y / blockH) % 2;
    ctx.fillStyle = kerbColors[idx];
    ctx.fillRect(ROAD_LEFT - blockW, y, blockW, blockH);
    ctx.fillRect(ROAD_RIGHT, y, blockW, blockH);
  }
  drawCarShape(GAME_W / 2 - CAR_W / 2, CAR_START_Y, '#f0c040', false);
})();
