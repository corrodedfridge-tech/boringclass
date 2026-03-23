(function () {
    'use strict';

    // ═══════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════
    const W = 400;
    const H = 600;
    const TILE = 20;
    const GRAVITY = 0.38;
    const JUMP_FORCE = -8.8;
    const MOVE_SPEED = 2.6;
    const MOVE_ACCEL = 0.35;
    const MOVE_FRICTION = 0.78;
    const AIR_FRICTION = 0.92;
    const PLAYER_SIZE = 16;
    const WALL_W = TILE;
    const PLAY_LEFT = WALL_W;
    const PLAY_RIGHT = W - WALL_W;
    const PLAY_WIDTH = PLAY_RIGHT - PLAY_LEFT;

    // Lava
    const LAVA_START_DELAY = 3;       // seconds before lava starts
    const LAVA_INITIAL_SPEED = 0.25;
    const LAVA_MAX_SPEED = 1.1;
    const LAVA_ACCEL = 0.0015;

    // Level gen
    const PLATFORM_MIN_W = TILE * 3;
    const PLATFORM_MAX_W = TILE * 8;
    const VERTICAL_GAP_MIN = 34;
    const VERTICAL_GAP_MAX = 58;
    const MAX_HORIZONTAL_JUMP = 90; // max horizontal distance player can cross
    const TOWER_SECTIONS = 200;

    // ═══════════════════════════════════════
    //  CANVAS SETUP
    // ═══════════════════════════════════════
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;

    function resizeCanvas() {
        const maxH = window.innerHeight - 20;
        const maxW = window.innerWidth - 20;
        const scale = Math.min(maxW / W, maxH / H);
        canvas.style.width = Math.floor(W * scale) + 'px';
        canvas.style.height = Math.floor(H * scale) + 'px';
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ═══════════════════════════════════════
    //  UI ELEMENTS
    // ═══════════════════════════════════════
    const titleScreen = document.getElementById('title-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const winScreen = document.getElementById('win-screen');
    const hudEl = document.getElementById('hud');
    const scoreDisplay = document.getElementById('score-display');
    const finalScore = document.getElementById('final-score');
    const highScoreEl = document.getElementById('high-score-display');
    const newRecordEl = document.getElementById('new-record');
    const winScoreEl = document.getElementById('win-score');
    const dangerEl = document.getElementById('danger-indicator');
    const mobileControls = document.getElementById('mobile-controls');

    // ═══════════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════════
    const keys = {};
    let inputDir = 0;
    let inputJump = false;
    let inputJumpPressed = false;
    let isMobile = false;

    // Detect mobile
    function checkMobile() {
        isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        if (isMobile) {
            mobileControls.classList.remove('hidden');
        }
    }
    checkMobile();

    window.addEventListener('keydown', e => {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
            e.preventDefault();
        }
        keys[e.code] = true;

        if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') &&
            gameState !== 'playing') {
            handleStart();
        }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // Mobile button states
    const mobileState = { left: false, right: false, jump: false };
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnJump = document.getElementById('btn-jump');

    function setupMobileBtn(el, stateKey) {
        const onDown = e => {
            e.preventDefault();
            mobileState[stateKey] = true;
            el.classList.add('active');
            if (stateKey === 'jump' && gameState !== 'playing') handleStart();
        };
        const onUp = e => {
            e.preventDefault();
            mobileState[stateKey] = false;
            el.classList.remove('active');
        };
        el.addEventListener('touchstart', onDown, { passive: false });
        el.addEventListener('touchend', onUp, { passive: false });
        el.addEventListener('touchcancel', onUp, { passive: false });
        el.addEventListener('mousedown', onDown);
        el.addEventListener('mouseup', onUp);
        el.addEventListener('mouseleave', onUp);
    }
    setupMobileBtn(btnLeft, 'left');
    setupMobileBtn(btnRight, 'right');
    setupMobileBtn(btnJump, 'jump');

    // Tap canvas to start (non-playing states)
    canvas.addEventListener('click', () => {
        if (gameState !== 'playing') handleStart();
    });
    canvas.addEventListener('touchstart', e => {
        if (gameState !== 'playing') {
            e.preventDefault();
            handleStart();
        }
    }, { passive: false });

    function processInput() {
        inputDir = 0;
        if (keys['ArrowLeft'] || keys['KeyA'] || mobileState.left) inputDir -= 1;
        if (keys['ArrowRight'] || keys['KeyD'] || mobileState.right) inputDir += 1;

        const wantJump = keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || mobileState.jump;
        inputJumpPressed = wantJump && !inputJump;
        inputJump = wantJump;
    }

    // ═══════════════════════════════════════
    //  GAME STATE
    // ═══════════════════════════════════════
    let gameState = 'title';
    let player, platforms, camera, lava, particles;
    let score, highScore, towerTopY, gameTime;
    let screenShake = 0;
    let deathParticles = [];
    let frameCount = 0;

    highScore = parseInt(localStorage.getItem('cubeEscapeHigh')) || 0;

    function handleStart() {
        if (gameState === 'playing') return;
        startGame();
    }

    // ═══════════════════════════════════════
    //  LEVEL GENERATION (guaranteed reachable)
    // ═══════════════════════════════════════
    function generateLevel() {
        platforms = [];

        // Floor
        platforms.push({
            x: PLAY_LEFT, y: H - TILE * 2,
            w: PLAY_WIDTH, h: TILE,
            type: 'normal'
        });

        let prevPlat = platforms[0];
        let curY = prevPlat.y - VERTICAL_GAP_MIN;
        let sectionCount = 0;

        while (sectionCount < TOWER_SECTIONS) {
            sectionCount++;
            const gap = VERTICAL_GAP_MIN + Math.random() * (VERTICAL_GAP_MAX - VERTICAL_GAP_MIN);
            curY -= gap;

            // Determine platform width
            const pw = PLATFORM_MIN_W + Math.floor(Math.random() * (PLATFORM_MAX_W - PLATFORM_MIN_W) / TILE) * TILE;

            // Determine X position - must be reachable from previous platform
            const prevCenterX = prevPlat.x + prevPlat.w / 2;
            let minX = Math.max(PLAY_LEFT, prevCenterX - MAX_HORIZONTAL_JUMP - pw / 2);
            let maxX = Math.min(PLAY_RIGHT - pw, prevCenterX + MAX_HORIZONTAL_JUMP - pw / 2);

            if (minX > maxX) {
                minX = PLAY_LEFT;
                maxX = PLAY_RIGHT - pw;
            }

            const px = minX + Math.random() * (maxX - minX);

            const plat = {
                x: Math.round(px / 2) * 2, // snap to 2px grid
                y: Math.round(curY),
                w: pw, h: TILE,
                type: 'normal'
            };
            platforms.push(plat);

            // Occasionally add a spike on wider platforms (but not blocking passage)
            if (sectionCount > 10 && Math.random() < 0.15 && pw >= TILE * 5) {
                const spikeX = plat.x + TILE + Math.floor(Math.random() * (pw / TILE - 3)) * TILE;
                platforms.push({
                    x: spikeX, y: plat.y - TILE + 2,
                    w: TILE, h: TILE - 2,
                    type: 'spike'
                });
            }

            // Every few platforms, add a bonus side platform for variety
            if (sectionCount % 5 === 0 && Math.random() < 0.4) {
                const bw = TILE * 2 + Math.floor(Math.random() * 2) * TILE;
                let bx;
                if (plat.x > PLAY_LEFT + PLAY_WIDTH / 2) {
                    bx = PLAY_LEFT + Math.random() * TILE * 2;
                } else {
                    bx = PLAY_RIGHT - bw - Math.random() * TILE * 2;
                }
                bx = Math.max(PLAY_LEFT, Math.min(bx, PLAY_RIGHT - bw));
                platforms.push({
                    x: Math.round(bx), y: plat.y + gap * 0.4,
                    w: bw, h: TILE,
                    type: 'normal'
                });
            }

            prevPlat = plat;
        }

        towerTopY = curY - H * 0.3;

        // Exit platform at top
        platforms.push({
            x: PLAY_LEFT + TILE,
            y: towerTopY + TILE * 2,
            w: PLAY_WIDTH - TILE * 2,
            h: TILE,
            type: 'exit'
        });
    }

    // ═══════════════════════════════════════
    //  PLAYER
    // ═══════════════════════════════════════
    function createPlayer() {
        return {
            x: W / 2 - PLAYER_SIZE / 2,
            y: H - TILE * 2 - PLAYER_SIZE,
            vx: 0,
            vy: 0,
            w: PLAYER_SIZE,
            h: PLAYER_SIZE,
            grounded: false,
            wasGrounded: false,
            coyoteTime: 0,
            jumpBuffer: 0,
            rotation: 0,
            targetRotation: 0,
            facingDir: 1,
            squashX: 1,
            squashY: 1,
            trail: [],
            landFrame: 0
        };
    }

    // ═══════════════════════════════════════
    //  PARTICLES
    // ═══════════════════════════════════════
    function emit(x, y, color, count, spread, speed, life) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x + (Math.random() - 0.5) * spread,
                y: y + (Math.random() - 0.5) * spread,
                vx: (Math.random() - 0.5) * speed,
                vy: -Math.random() * speed * 0.8 - 0.5,
                life: life || (0.4 + Math.random() * 0.4),
                maxLife: life || 0.8,
                color: color,
                size: 2 + Math.random() * 3
            });
        }
    }

    function emitDeath(x, y) {
        deathParticles = [];
        const colors = ['#ffcc00', '#ffdd44', '#cc9900', '#ff8800', '#ffffff'];
        for (let i = 0; i < 40; i++) {
            const a = (Math.PI * 2 / 40) * i + Math.random() * 0.4;
            const spd = 1.5 + Math.random() * 4;
            deathParticles.push({
                x, y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd - 2,
                life: 1.2,
                size: 2 + Math.random() * 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                rot: Math.random() * 6.28
            });
        }
    }

    // ═══════════════════════════════════════
    //  START GAME
    // ═══════════════════════════════════════
    function startGame() {
        generateLevel();
        player = createPlayer();
        camera = { y: 0, targetY: 0 };
        lava = { y: H + 200, speed: 0 };
        particles = [];
        deathParticles = [];
        score = 0;
        gameTime = 0;
        screenShake = 0;

        gameState = 'playing';
        titleScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        winScreen.classList.add('hidden');
        hudEl.classList.remove('hidden');
        dangerEl.classList.add('hidden');
        if (isMobile) mobileControls.classList.remove('hidden');
    }

    // ═══════════════════════════════════════
    //  COLLISION HELPERS
    // ═══════════════════════════════════════
    function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    // ═══════════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════════
    function update(dt) {
        if (gameState !== 'playing') {
            updateDeathParticles(dt);
            return;
        }

        frameCount++;
        gameTime += dt;
        processInput();

        const p = player;
        p.wasGrounded = p.grounded;

        // ── Horizontal movement ──
        if (inputDir !== 0) {
            p.vx += inputDir * MOVE_ACCEL;
            const maxV = MOVE_SPEED;
            if (p.vx > maxV) p.vx = maxV;
            if (p.vx < -maxV) p.vx = -maxV;
            p.facingDir = inputDir;
        } else {
            p.vx *= p.grounded ? MOVE_FRICTION : AIR_FRICTION;
            if (Math.abs(p.vx) < 0.05) p.vx = 0;
        }

        // ── Jump buffer + coyote time ──
        if (inputJumpPressed) {
            p.jumpBuffer = 0.1;
        }
        if (p.jumpBuffer > 0) p.jumpBuffer -= dt;
        if (p.grounded) {
            p.coyoteTime = 0.08;
        } else {
            if (p.coyoteTime > 0) p.coyoteTime -= dt;
        }

        // ── Jump ──
        if (p.jumpBuffer > 0 && p.coyoteTime > 0) {
            p.vy = JUMP_FORCE;
            p.grounded = false;
            p.coyoteTime = 0;
            p.jumpBuffer = 0;

            // GD rotation: 90 degrees in facing direction
            p.targetRotation += (Math.PI / 2) * p.facingDir;

            // Squash
            p.squashX = 0.7;
            p.squashY = 1.3;

            emit(p.x + p.w / 2, p.y + p.h, 'rgba(255,255,255,0.7)', 4, 10, 2, 0.3);
        }

        // Variable jump height - release early for short hop
        if (!inputJump && p.vy < -2) {
            p.vy *= 0.85;
        }

        // ── Gravity ──
        p.vy += GRAVITY;
        if (p.vy > 10) p.vy = 10;

        // ── Move X ──
        p.x += p.vx;

        // Walls
        if (p.x < PLAY_LEFT) { p.x = PLAY_LEFT; p.vx = 0; }
        if (p.x + p.w > PLAY_RIGHT) { p.x = PLAY_RIGHT - p.w; p.vx = 0; }

        // Platform collision X
        for (const pl of platforms) {
            if (pl.type === 'spike' || pl.type === 'exit') continue;
            if (overlaps(p.x, p.y + 2, p.w, p.h - 4, pl.x, pl.y, pl.w, pl.h)) {
                if (p.vx > 0) p.x = pl.x - p.w;
                else if (p.vx < 0) p.x = pl.x + pl.w;
                p.vx = 0;
            }
        }

        // ── Move Y ──
        p.y += p.vy;
        p.grounded = false;

        for (const pl of platforms) {
            if (pl.type === 'spike') continue;
            if (overlaps(p.x + 2, p.y, p.w - 4, p.h, pl.x, pl.y, pl.w, pl.h)) {
                if (p.vy >= 0) {
                    // Land on top
                    p.y = pl.y - p.h;
                    if (p.vy > 2 && !p.wasGrounded) {
                        p.squashX = 1.25;
                        p.squashY = 0.75;
                        p.landFrame = 8;
                        emit(p.x + p.w / 2, p.y + p.h, 'rgba(255,255,255,0.5)', 3, 12, 1.5, 0.25);
                    }
                    p.vy = 0;
                    p.grounded = true;

                    // Snap rotation to nearest 90° (GD style)
                    p.rotation = Math.round(p.rotation / (Math.PI / 2)) * (Math.PI / 2);
                    p.targetRotation = p.rotation;

                    // Exit check
                    if (pl.type === 'exit') {
                        winGame();
                        return;
                    }
                } else if (p.vy < 0) {
                    // Head bonk
                    p.y = pl.y + pl.h;
                    p.vy = 0;
                }
            }
        }

        // ── Spike collision ──
        for (const pl of platforms) {
            if (pl.type === 'spike') {
                // Smaller hitbox for spikes (forgiving)
                if (overlaps(p.x + 3, p.y + 3, p.w - 6, p.h - 6,
                    pl.x + 3, pl.y + 3, pl.w - 6, pl.h - 6)) {
                    die();
                    return;
                }
            }
        }

        // ── Rotation ──
        if (!p.grounded) {
            // Smoothly rotate toward target
            const diff = p.targetRotation - p.rotation;
            p.rotation += diff * 0.18;
        }

        // ── Squash & stretch lerp ──
        p.squashX += (1 - p.squashX) * 0.18;
        p.squashY += (1 - p.squashY) * 0.18;
        if (p.landFrame > 0) p.landFrame--;

        // In-air stretch
        if (!p.grounded && Math.abs(p.vy) > 2) {
            const t = Math.min(Math.abs(p.vy) / 10, 0.25);
            p.squashX = 1 - t * 0.3;
            p.squashY = 1 + t * 0.3;
        }

        // ── Trail ──
        if (Math.abs(p.vx) > 0.3 || Math.abs(p.vy) > 1) {
            p.trail.push({
                x: p.x + p.w / 2,
                y: p.y + p.h / 2,
                life: 0.25,
                alpha: 0.25
            });
        }
        for (let i = p.trail.length - 1; i >= 0; i--) {
            p.trail[i].life -= dt;
            if (p.trail[i].life <= 0) p.trail.splice(i, 1);
        }

        // ── Camera ──
        camera.targetY = p.y - H * 0.55;
        if (camera.targetY > 0) camera.targetY = 0;
        camera.y += (camera.targetY - camera.y) * 0.06;

        // ── Score ──
        const height = Math.max(0, Math.floor((H - TILE * 2 - p.y) / 10));
        if (height > score) score = height;
        scoreDisplay.textContent = score + 'm';

        // ── Lava ──
        if (gameTime > LAVA_START_DELAY) {
            lava.speed = Math.min(LAVA_MAX_SPEED, LAVA_INITIAL_SPEED + (gameTime - LAVA_START_DELAY) * LAVA_ACCEL);
            lava.y -= lava.speed;

            // Don't let lava get too far behind
            const maxDist = H * 1.8;
            if (lava.y > p.y + maxDist) lava.y = p.y + maxDist;
        }

        // Danger indicator
        const lavaDist = lava.y - (p.y + p.h);
        if (lavaDist < H * 0.5 && lavaDist > 0) {
            dangerEl.classList.remove('hidden');
        } else {
            dangerEl.classList.add('hidden');
        }

        // Lava kills
        if (p.y + p.h > lava.y + 5) {
            die();
            return;
        }

        // Fell below camera too much
        if (p.y > camera.y + H + 100) {
            die();
            return;
        }

        // ── Particles ──
        updateParticles(dt);

        // ── Screen shake ──
        if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 6);
    }

    function die() {
        gameState = 'dead';
        emitDeath(player.x + player.w / 2, player.y + player.h / 2);
        screenShake = 2;

        let isNewRecord = false;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('cubeEscapeHigh', highScore);
            isNewRecord = true;
        }

        finalScore.textContent = 'HEIGHT: ' + score + 'm';
        highScoreEl.textContent = 'BEST: ' + highScore + 'm';

        if (isNewRecord && score > 0) {
            newRecordEl.classList.remove('hidden');
        } else {
            newRecordEl.classList.add('hidden');
        }

        setTimeout(() => {
            gameOverScreen.classList.remove('hidden');
            hudEl.classList.add('hidden');
            dangerEl.classList.add('hidden');
            if (isMobile) mobileControls.classList.add('hidden');
        }, 600);
    }

    function winGame() {
        gameState = 'won';
        winScoreEl.textContent = 'HEIGHT: ' + score + 'm';
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('cubeEscapeHigh', highScore);
        }
        emit(player.x + player.w / 2, player.y, '#44ff88', 20, 30, 5, 1);
        setTimeout(() => {
            winScreen.classList.remove('hidden');
            hudEl.classList.add('hidden');
            if (isMobile) mobileControls.classList.add('hidden');
        }, 500);
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updateDeathParticles(dt) {
        for (let i = deathParticles.length - 1; i >= 0; i--) {
            const p = deathParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12;
            p.vx *= 0.99;
            p.life -= dt;
            p.rot += 0.05;
            if (p.life <= 0) deathParticles.splice(i, 1);
        }
    }

    // ═══════════════════════════════════════
    //  DRAWING
    // ═══════════════════════════════════════

    // ── Color palette ──
    const C = {
        bgTop: '#12122a',
        bgBot: '#1a1a35',
        wall: '#3d3d5c',
        wallHi: '#4d4d6c',
        wallSh: '#2d2d4c',
        wallLine: '#292947',
        platTop: '#6bba6b',
        plat: '#549e54',
        platBot: '#3d7a3d',
        platDetail: 'rgba(0,0,0,0.08)',
        exitMain: '#33dd77',
        exitHi: '#66ffaa',
        exitSh: '#22aa55',
        spike: '#cc3333',
        spikeHi: '#dd5555',
        cubeMain: '#ffcc00',
        cubeHi: '#ffe055',
        cubeSh: '#cc9900',
        cubeEye: '#332200',
        cubeEyeHi: '#ffffffcc',
        lavaTop: '#ff5522',
        lavaMid: '#ee3311',
        lavaBot: '#aa1100',
        lavaGlow: '#ff440033',
        lavaBubble: '#ff8844',
        trailColor: 'rgba(255,204,0,',
        white: '#ffffff',
    };

    function draw() {
        ctx.fillStyle = C.bgTop;
        ctx.fillRect(0, 0, W, H);

        if (gameState === 'title') {
            drawTitleBackground();
            return;
        }

        ctx.save();

        // Screen shake
        if (screenShake > 0) {
            const s = screenShake * 3;
            ctx.translate(
                (Math.random() - 0.5) * s,
                (Math.random() - 0.5) * s
            );
        }

        // Camera
        ctx.translate(0, -Math.round(camera.y));

        drawBG();
        drawWalls();
        drawPlatforms();

        if (gameState === 'playing') {
            drawPlayerTrail();
            drawPlayer();
        }

        drawDeathParts();
        drawParts();
        drawLavaGlow();
        drawLava();

        ctx.restore();
    }

    function drawTitleBackground() {
        const t = Date.now() / 1000;
        // Subtle gradient
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0e0e22');
        grad.addColorStop(1, '#1a1a38');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Floating cube particles
        ctx.globalAlpha = 0.12;
        for (let i = 0; i < 12; i++) {
            const x = ((t * 15 + i * 37) % (W + 40)) - 20;
            const y = ((t * (8 + i * 2) + i * 53) % (H + 40)) - 20;
            const sz = 6 + (i % 4) * 4;
            const rot = t * (0.5 + i * 0.1);

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Lava at bottom
        const lavaY = H - 60 + Math.sin(t * 2) * 5;
        ctx.fillStyle = '#ff3311';
        ctx.beginPath();
        ctx.moveTo(0, lavaY);
        for (let x = 0; x <= W; x += 8) {
            ctx.lineTo(x, lavaY + Math.sin(x * 0.04 + t * 3) * 6);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ff6633';
        ctx.beginPath();
        ctx.moveTo(0, lavaY + 4);
        for (let x = 0; x <= W; x += 8) {
            ctx.lineTo(x, lavaY + 4 + Math.sin(x * 0.04 + t * 3) * 6);
        }
        ctx.lineTo(W, lavaY + 14);
        ctx.lineTo(0, lavaY + 14);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#aa1100';
        ctx.fillRect(0, lavaY + 20, W, H);
    }

    function drawBG() {
        const sy = Math.floor((camera.y) / TILE) * TILE - TILE;
        const ey = camera.y + H + TILE;

        for (let y = sy; y < ey; y += TILE) {
            const row = Math.floor(y / TILE);
            const isOdd = row % 2 !== 0;

            for (let x = PLAY_LEFT; x < PLAY_RIGHT; x += TILE) {
                const bx = isOdd ? x + TILE / 2 : x;
                // Subtle variation
                const hash = ((bx * 13 + y * 7) & 0xFF) / 255;
                const v = Math.floor(22 + hash * 6);
                ctx.fillStyle = `rgb(${v},${v},${v + 14})`;
                ctx.fillRect(x, y, TILE, TILE);

                // Mortar lines
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.fillRect(x, y + TILE - 1, TILE, 1);
                if (isOdd) {
                    ctx.fillRect(x + TILE / 2, y, 1, TILE);
                } else {
                    ctx.fillRect(x, y, 1, TILE);
                }
            }
        }
    }

    function drawWalls() {
        const sy = Math.floor(camera.y / TILE) * TILE - TILE;
        const ey = camera.y + H + TILE;

        for (let y = sy; y < ey; y += TILE) {
            const row = Math.floor(y / TILE);
            const shade = ((row * 17) & 0x0F);

            // Left wall
            ctx.fillStyle = C.wall;
            ctx.fillRect(0, y, WALL_W, TILE);
            ctx.fillStyle = C.wallHi;
            ctx.fillRect(WALL_W - 3, y, 3, TILE);
            ctx.fillRect(0, y, WALL_W, 2);
            ctx.fillStyle = C.wallLine;
            ctx.fillRect(0, y + TILE - 1, WALL_W, 1);

            // Right wall
            ctx.fillStyle = C.wall;
            ctx.fillRect(W - WALL_W, y, WALL_W, TILE);
            ctx.fillStyle = C.wallHi;
            ctx.fillRect(W - WALL_W, y, 3, TILE);
            ctx.fillRect(W - WALL_W, y, WALL_W, 2);
            ctx.fillStyle = C.wallLine;
            ctx.fillRect(W - WALL_W, y + TILE - 1, WALL_W, 1);

            // Decorative notch
            if (row % 4 === 0) {
                ctx.fillStyle = C.wallSh;
                ctx.fillRect(WALL_W - 5, y + 4, 2, TILE - 8);
                ctx.fillRect(W - WALL_W + 3, y + 4, 2, TILE - 8);
            }
        }
    }

    function drawPlatforms() {
        const viewTop = camera.y - TILE * 2;
        const viewBot = camera.y + H + TILE * 2;

        for (const pl of platforms) {
            if (pl.y + pl.h < viewTop || pl.y > viewBot) continue;

            if (pl.type === 'spike') {
                drawSpike(pl);
            } else if (pl.type === 'exit') {
                drawExit(pl);
            } else {
                drawPlat(pl);
            }
        }
    }

    function drawPlat(pl) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(pl.x + 2, pl.y + 2, pl.w, pl.h);

        // Body
        ctx.fillStyle = C.plat;
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);

        // Top highlight (grass-like)
        ctx.fillStyle = C.platTop;
        ctx.fillRect(pl.x, pl.y, pl.w, 4);

        // Left highlight
        ctx.fillStyle = C.platTop;
        ctx.fillRect(pl.x, pl.y, 2, pl.h);

        // Bottom shadow
        ctx.fillStyle = C.platBot;
        ctx.fillRect(pl.x, pl.y + pl.h - 3, pl.w, 3);

        // Right shadow
        ctx.fillStyle = C.platBot;
        ctx.fillRect(pl.x + pl.w - 2, pl.y, 2, pl.h);

        // Surface detail dots
        ctx.fillStyle = C.platDetail;
        for (let dx = 6; dx < pl.w - 6; dx += TILE / 2) {
            const hash = ((pl.x + dx) * 7 + pl.y * 3) & 0xFF;
            if (hash < 100) {
                ctx.fillRect(pl.x + dx, pl.y + 7, 2, 2);
            }
        }

        // Grass tufts on top
        ctx.fillStyle = '#7acc7a';
        for (let dx = 3; dx < pl.w - 3; dx += 7) {
            const hash = ((pl.x + dx) * 11 + pl.y * 5) & 0xFF;
            if (hash < 80) {
                ctx.fillRect(pl.x + dx, pl.y - 2, 2, 3);
            }
        }
    }

    function drawSpike(pl) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.moveTo(pl.x + 2, pl.y + pl.h + 2);
        ctx.lineTo(pl.x + pl.w / 2 + 2, pl.y + 2);
        ctx.lineTo(pl.x + pl.w + 2, pl.y + pl.h + 2);
        ctx.closePath();
        ctx.fill();

        // Main
        ctx.fillStyle = C.spike;
        ctx.beginPath();
        ctx.moveTo(pl.x, pl.y + pl.h);
        ctx.lineTo(pl.x + pl.w / 2, pl.y);
        ctx.lineTo(pl.x + pl.w, pl.y + pl.h);
        ctx.closePath();
        ctx.fill();

        // Highlight half
        ctx.fillStyle = C.spikeHi;
        ctx.beginPath();
        ctx.moveTo(pl.x + 2, pl.y + pl.h);
        ctx.lineTo(pl.x + pl.w / 2, pl.y + 2);
        ctx.lineTo(pl.x + pl.w / 2, pl.y + pl.h);
        ctx.closePath();
        ctx.fill();

        // Tip shine
        ctx.fillStyle = '#ff9999';
        ctx.fillRect(pl.x + pl.w / 2 - 1, pl.y + 1, 2, 3);
    }

    function drawExit(pl) {
        const t = Date.now() / 1000;
        const pulse = Math.sin(t * 3) * 0.3 + 0.7;

        // Glow
        ctx.globalAlpha = pulse * 0.15;
        ctx.fillStyle = '#44ff88';
        ctx.fillRect(pl.x - 8, pl.y - 8, pl.w + 16, pl.h + 16);
        ctx.globalAlpha = 1;

        // Platform
        ctx.fillStyle = C.exitMain;
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.fillStyle = C.exitHi;
        ctx.fillRect(pl.x, pl.y, pl.w, 4);
        ctx.fillRect(pl.x, pl.y, 2, pl.h);
        ctx.fillStyle = C.exitSh;
        ctx.fillRect(pl.x, pl.y + pl.h - 3, pl.w, 3);

        // Arrows above
        ctx.fillStyle = C.exitHi;
        const arrowY = pl.y - 14 + Math.sin(t * 4) * 3;
        for (let i = 0; i < 3; i++) {
            const ax = pl.x + pl.w * 0.25 + i * (pl.w * 0.25);
            ctx.beginPath();
            ctx.moveTo(ax - 4, arrowY + 6);
            ctx.lineTo(ax, arrowY);
            ctx.lineTo(ax + 4, arrowY + 6);
            ctx.closePath();
            ctx.fill();
        }

        // EXIT text
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('EXIT', pl.x + pl.w / 2, pl.y - 20);
        ctx.textAlign = 'left';

        // Sparkle particles
        if (frameCount % 8 === 0) {
            emit(
                pl.x + Math.random() * pl.w,
                pl.y - 2,
                '#88ffbb', 1, 4, 1.5, 0.6
            );
        }
    }

    function drawPlayer() {
        const p = player;
        const cx = Math.round(p.x + p.w / 2);
        const cy = Math.round(p.y + p.h / 2);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(p.rotation);
        ctx.scale(p.squashX, p.squashY);

        const half = p.w / 2;

        // Drop shadow (stays below cube, not rotated)
        // We draw it before rotation by accounting for it
        // Actually let's just draw a simple one

        // Cube shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-half + 2, -half + 2, p.w, p.h);

        // Main body
        ctx.fillStyle = C.cubeMain;
        ctx.fillRect(-half, -half, p.w, p.h);

        // Top/left highlight
        ctx.fillStyle = C.cubeHi;
        ctx.fillRect(-half, -half, p.w, 3);
        ctx.fillRect(-half, -half, 3, p.h);

        // Bottom/right shadow
        ctx.fillStyle = C.cubeSh;
        ctx.fillRect(-half, half - 3, p.w, 3);
        ctx.fillRect(half - 3, -half, 3, p.h);

        // Inner bevel
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(-half + 3, -half + 3, p.w - 6, 2);

        // Eye
        const eyeX = 2;
        const eyeY = -2;
        ctx.fillStyle = C.cubeEye;
        ctx.fillRect(eyeX, eyeY, 5, 6);

        // Pupil / highlight
        ctx.fillStyle = C.cubeEyeHi;
        ctx.fillRect(eyeX + 1, eyeY + 1, 2, 2);

        ctx.restore();
    }

    function drawPlayerTrail() {
        const p = player;
        for (const t of p.trail) {
            const a = (t.life / 0.25) * 0.2;
            ctx.fillStyle = C.trailColor + a.toFixed(2) + ')';
            const s = PLAYER_SIZE * (t.life / 0.25) * 0.5;
            ctx.fillRect(
                Math.round(t.x - s / 2),
                Math.round(t.y - s / 2),
                Math.round(s),
                Math.round(s)
            );
        }
    }

    function drawParts() {
        for (const p of particles) {
            const a = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            const s = Math.round(p.size * a);
            ctx.fillRect(
                Math.round(p.x - s / 2),
                Math.round(p.y - s / 2), s, s
            );
        }
        ctx.globalAlpha = 1;
    }

    function drawDeathParts() {
        for (const p of deathParticles) {
            ctx.save();
            ctx.translate(Math.round(p.x), Math.round(p.y));
            ctx.rotate(p.rot);
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            const s = Math.round(p.size);
            ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function drawLavaGlow() {
        if (!lava || lava.y > camera.y + H + 200) return;

        const grad = ctx.createLinearGradient(0, lava.y - 120, 0, lava.y);
        grad.addColorStop(0, 'rgba(255,50,0,0)');
        grad.addColorStop(0.7, 'rgba(255,50,0,0.06)');
        grad.addColorStop(1, 'rgba(255,50,0,0.18)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, lava.y - 120, W, 120);
    }

    function drawLava() {
        if (!lava || lava.y > camera.y + H + 200) return;

        const t = Date.now() / 1000;
        const ly = lava.y;

        // Main lava surface with waves
        ctx.fillStyle = C.lavaTop;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        for (let x = 0; x <= W; x += 4) {
            const wave = Math.sin(x * 0.04 + t * 2.5) * 5
                + Math.sin(x * 0.07 + t * 4) * 2.5
                + Math.cos(x * 0.02 + t * 1.5) * 3;
            ctx.lineTo(x, ly + wave);
        }
        ctx.lineTo(W, ly + 2000);
        ctx.lineTo(0, ly + 2000);
        ctx.closePath();
        ctx.fill();

        // Lighter crust layer
        ctx.fillStyle = C.lavaBubble;
        ctx.beginPath();
        ctx.moveTo(0, ly + 5);
        for (let x = 0; x <= W; x += 4) {
            const wave = Math.sin(x * 0.04 + t * 2.5) * 5
                + Math.sin(x * 0.07 + t * 4) * 2.5;
            ctx.lineTo(x, ly + wave + 5);
        }
        ctx.lineTo(W, ly + 15);
        ctx.lineTo(0, ly + 15);
        ctx.closePath();
        ctx.fill();

        // Dark depths
        ctx.fillStyle = C.lavaBot;
        ctx.fillRect(0, ly + 25, W, 2000);

        // Mid layer
        ctx.fillStyle = C.lavaMid;
        ctx.fillRect(0, ly + 15, W, 12);

        // Bubbles
        for (let i = 0; i < 6; i++) {
            const bx = ((t * (12 + i * 5) + i * 67) % (W - WALL_W * 2)) + WALL_W;
            const by = ly + 18 + Math.sin(t * 1.5 + i * 2.2) * 4;
            const br = 2 + Math.sin(t * 3 + i * 1.5) * 1.5;
            ctx.fillStyle = C.lavaBubble;
            ctx.beginPath();
            ctx.arc(bx, by, Math.max(1, br), 0, Math.PI * 2);
            ctx.fill();
        }

        // Bright surface highlights
        ctx.fillStyle = '#ffaa33';
        for (let i = 0; i < 4; i++) {
            const hx = ((t * 20 + i * 100) % (W - 60)) + 30;
            const hy = ly + Math.sin(t * 2.5 + i) * 5;
            ctx.fillRect(hx, hy, 8 + Math.sin(t + i) * 4, 2);
        }
    }

    // ═══════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════
    let lastTime = performance.now();

    function loop(now) {
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;

        // Cap delta to prevent spiral of death
        const dt = Math.min(rawDt, 1 / 30);

        update(dt);
        draw();

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
})();
