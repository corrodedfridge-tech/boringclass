(function () {
    'use strict';

    // ── Canvas ──
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const INTERNAL_WIDTH = 400;
    const INTERNAL_HEIGHT = 700;

    // Off-screen buffer for pixelated rendering
    const buffer = document.createElement('canvas');
    buffer.width = INTERNAL_WIDTH;
    buffer.height = INTERNAL_HEIGHT;
    const bctx = buffer.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // ── Constants ──
    const TILE = 20;
    const GRAVITY = 0.48;
    const JUMP_FORCE = -10;
    const MOVE_SPEED = 3;
    const MOVE_ACCEL = 0.35;
    const MOVE_FRICTION = 0.8;
    const PLAYER_SIZE = 18;
    const WALL_W = TILE;
    const PLAY_LEFT = WALL_W;
    const PLAY_RIGHT = INTERNAL_WIDTH - WALL_W;
    const PLAY_WIDTH = PLAY_RIGHT - PLAY_LEFT;
    const LAVA_START_DELAY = 3;        // seconds before lava starts
    const LAVA_INITIAL_SPEED = 0.25;
    const LAVA_MAX_SPEED = 1.2;
    const LAVA_ACCEL = 0.00004;
    const TOWER_TOTAL_HEIGHT = 8000;   // total height in pixels
    const PLATFORM_MIN_GAP = 32;
    const PLATFORM_MAX_GAP = 55;       // easier gaps
    const COYOTE_TIME = 0.12;
    const JUMP_BUFFER_TIME = 0.15;

    // ── Colors ──
    const C = {
        bgTop: '#0f0f23',
        bgBot: '#1a1a2e',
        wall: '#3d3d5c',
        wallHi: '#50507a',
        wallSh: '#2a2a44',
        wallLine: '#222240',
        platMain: '#4a7a4a',
        platTop: '#5c9a5c',
        platSh: '#3a6a3a',
        platDot: 'rgba(0,0,0,0.12)',
        movePlat: '#4a6a8a',
        moveTop: '#5c8aaa',
        moveSh: '#3a5a7a',
        spike: '#cc4444',
        spikeHi: '#dd6666',
        exit: '#33dd55',
        exitGlow: '#88ff99',
        player: '#ffcc00',
        playerHi: '#ffdd55',
        playerSh: '#dd9900',
        playerEye: '#332200',
        eyeShine: '#ffffff',
        lava1: '#ff4400',
        lava2: '#ff7733',
        lava3: '#cc2200',
        lavaGlow: 'rgba(255,70,0,',
        particle: '#ffaa33',
        starColor: 'rgba(255,255,255,'
    };

    // ── State ──
    let gameState = 'title';
    let player, platforms, camera, lava;
    let particles = [], deathParts = [], lavaParts = [], starField = [];
    let score = 0, highScore = 0, newBest = false;
    let screenShake = 0, shakeX = 0, shakeY = 0;
    let gameTime = 0, lavaWaiting = true;
    let towerTopY;

    highScore = parseInt(localStorage.getItem('cubeEscapeHS2')) || 0;

    // ── Input ──
    const keys = {};
    let jumpBuffered = false, jumpBufferTimer = 0;
    let mobileLeft = false, mobileRight = false, mobileJump = false;
    const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(e.code)) e.preventDefault();
        if (gameState !== 'playing') handleStart();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // Mobile button controls
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnJump = document.getElementById('btn-jump');
    const mobileControls = document.getElementById('mobile-controls');

    function setupMobileBtn(btn, onDown, onUp) {
        btn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); onDown(); btn.classList.add('active'); });
        btn.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); onUp(); btn.classList.remove('active'); });
        btn.addEventListener('touchcancel', e => { e.preventDefault(); onUp(); btn.classList.remove('active'); });
    }
    setupMobileBtn(btnLeft, () => mobileLeft = true, () => mobileLeft = false);
    setupMobileBtn(btnRight, () => mobileRight = true, () => mobileRight = false);
    setupMobileBtn(btnJump, () => mobileJump = true, () => mobileJump = false);

    // Tap on canvas (for starting / simple tap-jump)
    canvas.addEventListener('touchstart', e => {
        if (gameState !== 'playing') { e.preventDefault(); handleStart(); }
    }, { passive: false });

    canvas.addEventListener('click', () => {
        if (gameState !== 'playing') handleStart();
    });

    // ── UI Refs ──
    const titleScreen = document.getElementById('title-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const winScreen = document.getElementById('win-screen');
    const hud = document.getElementById('hud');
    const scoreDisplay = document.getElementById('score-display');
    const finalScoreEl = document.getElementById('final-score');
    const highScoreEl = document.getElementById('high-score-display');
    const newBestEl = document.getElementById('new-best');
    const winScoreEl = document.getElementById('win-score');
    const titleHSEl = document.getElementById('title-high-score');
    const heightBarFill = document.getElementById('height-bar-fill');
    const heightBarPlayer = document.getElementById('height-bar-player');
    const heightBarLava = document.getElementById('height-bar-lava');

    if (highScore > 0) {
        titleHSEl.textContent = 'BEST: ' + highScore + 'm';
        titleHSEl.classList.remove('hidden');
    }

    function handleStart() {
        if (gameState === 'playing') return;
        startGame();
    }

    // ── Stars ──
    function generateStars() {
        starField = [];
        for (let i = 0; i < 80; i++) {
            starField.push({
                x: Math.random() * INTERNAL_WIDTH,
                y: Math.random() * (TOWER_TOTAL_HEIGHT + INTERNAL_HEIGHT),
                size: Math.random() < 0.3 ? 2 : 1,
                twinkle: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 2
            });
        }
    }

    // ── Level Generation ──
    function generateLevel() {
        platforms = [];
        towerTopY = -(TOWER_TOTAL_HEIGHT);
        const floorY = INTERNAL_HEIGHT - TILE * 2;

        // Floor
        platforms.push({ x: PLAY_LEFT, y: floorY, w: PLAY_WIDTH, h: TILE, type: 'normal' });

        let curY = floorY - 50;
        let lastX = INTERNAL_WIDTH / 2;

        while (curY > towerTopY + 100) {
            const gap = PLATFORM_MIN_GAP + Math.random() * (PLATFORM_MAX_GAP - PLATFORM_MIN_GAP);
            curY -= gap;

            // Difficulty ramps subtly
            const progress = 1 - ((curY - towerTopY) / TOWER_TOTAL_HEIGHT);
            const minW = Math.max(3, 5 - progress * 1.5);
            const maxW = Math.max(4, 7 - progress * 2);
            const pw = TILE * (minW + Math.random() * (maxW - minW));

            // Platforms tend to be reachable from last position
            let px = lastX + (Math.random() - 0.5) * 120;
            px = Math.max(PLAY_LEFT, Math.min(px, PLAY_RIGHT - pw));

            let type = 'normal';
            // Occasional moving platform (not too early)
            if (progress > 0.15 && Math.random() < 0.15) {
                type = 'moving';
            }
            // Occasional spike decoration nearby
            let spike = null;
            if (progress > 0.2 && Math.random() < 0.12) {
                const sx = px + TILE + Math.random() * (pw - TILE * 2);
                if (pw > TILE * 3) {
                    spike = { x: sx, y: curY - TILE, w: TILE, h: TILE, type: 'spike' };
                }
            }

            const p = {
                x: px, y: curY, w: pw, h: TILE, type,
                origX: px,
                moveRange: 30 + Math.random() * 40,
                moveSpeed: 0.5 + Math.random() * 0.8,
                moveOffset: Math.random() * Math.PI * 2
            };
            platforms.push(p);
            if (spike) platforms.push(spike);

            lastX = px + pw / 2;

            // Safety platform every so often (wide & centered)
            if (Math.floor((floorY - curY) / 400) > Math.floor((floorY - (curY + gap)) / 400)) {
                curY -= gap * 0.6;
                const safeW = TILE * 7;
                platforms.push({
                    x: (INTERNAL_WIDTH - safeW) / 2,
                    y: curY,
                    w: safeW,
                    h: TILE,
                    type: 'normal',
                    origX: (INTERNAL_WIDTH - safeW) / 2,
                    moveRange: 0, moveSpeed: 0, moveOffset: 0
                });
                lastX = INTERNAL_WIDTH / 2;
            }
        }

        // Exit platform
        platforms.push({
            x: PLAY_LEFT + 20,
            y: towerTopY + 40,
            w: PLAY_WIDTH - 40,
            h: TILE,
            type: 'exit',
            origX: PLAY_LEFT + 20,
            moveRange: 0, moveSpeed: 0, moveOffset: 0
        });
    }

    // ── Create Player ──
    function createPlayer() {
        return {
            x: INTERNAL_WIDTH / 2 - PLAYER_SIZE / 2,
            y: INTERNAL_HEIGHT - TILE * 2 - PLAYER_SIZE,
            vx: 0, vy: 0,
            w: PLAYER_SIZE, h: PLAYER_SIZE,
            onGround: false,
            coyoteTimer: 0,
            rotation: 0,
            targetRotation: 0,
            facingDir: 1,
            squash: 1, stretch: 1,
            trail: [],
            groundY: 0
        };
    }

    // ── Particles ──
    function emit(x, y, color, count, spread, speed, grav) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x + (Math.random() - 0.5) * spread,
                y: y + (Math.random() - 0.5) * spread,
                vx: (Math.random() - 0.5) * speed,
                vy: -Math.random() * speed * 0.7 - 0.5,
                life: 0.4 + Math.random() * 0.5,
                max: 0.9,
                color, grav: grav || 0.12,
                size: 2 + Math.random() * 3
            });
        }
    }

    function emitDeath(x, y) {
        deathParts = [];
        for (let i = 0; i < 40; i++) {
            const a = (Math.PI * 2 / 40) * i + Math.random() * 0.4;
            const sp = 2 + Math.random() * 5;
            deathParts.push({
                x, y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 2,
                life: 1,
                size: 2 + Math.random() * 5,
                color: Math.random() < 0.5 ? C.player : C.playerSh,
                rot: Math.random() * 6.28
            });
        }
    }

    // ── Start ──
    function startGame() {
        generateStars();
        generateLevel();
        player = createPlayer();
        camera = { y: 0, targetY: 0 };
        lava = { y: INTERNAL_HEIGHT + 200, speed: LAVA_INITIAL_SPEED };
        particles = [];
        deathParts = [];
        lavaParts = [];
        score = 0;
        newBest = false;
        screenShake = 0;
        gameTime = 0;
        lavaWaiting = true;
        jumpBuffered = false;
        jumpBufferTimer = 0;

        gameState = 'playing';
        titleScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        winScreen.classList.add('hidden');
        hud.classList.remove('hidden');
        if (isMobile) mobileControls.classList.remove('hidden');
    }

    // ── Collision ──
    function overlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x &&
               a.y < b.y + b.h && a.y + a.h > b.y;
    }

    // ── Update ──
    function update(dt) {
        if (gameState !== 'playing') {
            updateDeathParts(dt);
            return;
        }

        gameTime += dt;
        const p = player;

        // ── Moving platforms ──
        for (const pl of platforms) {
            if (pl.type === 'moving') {
                const oldX = pl.x;
                pl.x = pl.origX + Math.sin(gameTime * pl.moveSpeed + pl.moveOffset) * pl.moveRange;
                pl._dx = pl.x - oldX;
                // Clamp
                if (pl.x < PLAY_LEFT) pl.x = PLAY_LEFT;
                if (pl.x + pl.w > PLAY_RIGHT) pl.x = PLAY_RIGHT - pl.w;
            }
        }

        // ── Input ──
        let moveDir = 0;
        if (keys['ArrowLeft'] || keys['KeyA'] || mobileLeft) moveDir -= 1;
        if (keys['ArrowRight'] || keys['KeyD'] || mobileRight) moveDir += 1;
        const wantJump = keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || mobileJump;

        // ── Horizontal ──
        if (moveDir !== 0) {
            p.vx += moveDir * MOVE_ACCEL;
            if (Math.abs(p.vx) > MOVE_SPEED) p.vx = moveDir * MOVE_SPEED;
            p.facingDir = moveDir;
        } else {
            p.vx *= MOVE_FRICTION;
            if (Math.abs(p.vx) < 0.15) p.vx = 0;
        }

        // ── Jump buffer & coyote ──
        if (p.onGround || p.coyoteTimer > 0) {
            // can jump
        }
        if (wantJump && !p._jumpHeld) {
            jumpBuffered = true;
            jumpBufferTimer = JUMP_BUFFER_TIME;
            p._jumpHeld = true;
        }
        if (!wantJump) {
            p._jumpHeld = false;
        }
        if (jumpBufferTimer > 0) jumpBufferTimer -= dt;
        else jumpBuffered = false;

        if (jumpBuffered && (p.onGround || p.coyoteTimer > 0)) {
            p.vy = JUMP_FORCE;
            p.onGround = false;
            p.coyoteTimer = 0;
            jumpBuffered = false;
            jumpBufferTimer = 0;
            p.squash = 0.6;
            p.stretch = 1.3;
            p.targetRotation += (Math.PI / 2) * (p.facingDir || 1);
            emit(p.x + p.w / 2, p.y + p.h, '#ffffff', 4, 10, 2.5, 0.1);
        }

        // Variable jump height
        if (!wantJump && p.vy < -3) {
            p.vy *= 0.85;
        }

        // ── Gravity ──
        p.vy += GRAVITY;
        if (p.vy > 13) p.vy = 13;

        // ── Coyote ──
        if (!p.onGround) {
            p.coyoteTimer -= dt;
        }

        // ── Move X ──
        p.x += p.vx;

        // Wall collision
        if (p.x < PLAY_LEFT) { p.x = PLAY_LEFT; p.vx = 0; }
        if (p.x + p.w > PLAY_RIGHT) { p.x = PLAY_RIGHT - p.w; p.vx = 0; }

        // Platform side collision
        for (const pl of platforms) {
            if (pl.type === 'spike') continue;
            if (!overlap(p, pl)) continue;
            if (p.vx > 0) p.x = pl.x - p.w;
            else if (p.vx < 0) p.x = pl.x + pl.w;
            p.vx = 0;
        }

        // ── Move Y ──
        const wasOnGround = p.onGround;
        p.y += p.vy;
        p.onGround = false;
        let ridingPlatform = null;

        for (const pl of platforms) {
            if (pl.type === 'spike') continue;
            if (!overlap(p, pl)) continue;
            if (p.vy >= 0 && p.y + p.h - p.vy <= pl.y + 4) {
                // Land on top
                p.y = pl.y - p.h;
                if (p.vy > 3) {
                    p.squash = 1.25;
                    p.stretch = 0.75;
                    emit(p.x + p.w / 2, p.y + p.h, 'rgba(255,255,255,0.6)', 3, 10, 1.5, 0.05);
                }
                p.vy = 0;
                p.onGround = true;
                p.coyoteTimer = COYOTE_TIME;
                p.groundY = pl.y;
                ridingPlatform = pl;

                // Snap rotation
                const snap = Math.round(p.rotation / (Math.PI / 2)) * (Math.PI / 2);
                p.rotation = snap;
                p.targetRotation = snap;

                // Check exit
                if (pl.type === 'exit') {
                    winGame();
                    return;
                }
            } else if (p.vy < 0) {
                p.y = pl.y + pl.h;
                p.vy = 0;
            }
        }

        // Ride moving platform
        if (ridingPlatform && ridingPlatform.type === 'moving' && ridingPlatform._dx) {
            p.x += ridingPlatform._dx;
        }

        if (wasOnGround && !p.onGround && p.vy >= 0) {
            p.coyoteTimer = COYOTE_TIME;
        }

        // ── Spikes ──
        for (const pl of platforms) {
            if (pl.type === 'spike' && overlap(p, pl)) {
                killPlayer();
                return;
            }
        }

        // ── Rotation (GD style) ──
        if (!p.onGround) {
            const diff = p.targetRotation - p.rotation;
            p.rotation += diff * 0.18;
        }

        // ── Squash/stretch ──
        p.squash += (1 - p.squash) * 0.18;
        p.stretch += (1 - p.stretch) * 0.18;

        // ── Trail ──
        if (Math.abs(p.vx) > 0.5 || Math.abs(p.vy) > 1) {
            p.trail.push({
                x: p.x + p.w / 2, y: p.y + p.h / 2,
                life: 0.25, size: PLAYER_SIZE * 0.5
            });
        }
        for (let i = p.trail.length - 1; i >= 0; i--) {
            p.trail[i].life -= dt;
            if (p.trail[i].life <= 0) p.trail.splice(i, 1);
        }

        // ── Camera (smooth) ──
        camera.targetY = p.y - INTERNAL_HEIGHT * 0.55;
        if (camera.targetY > 0) camera.targetY = 0;
        camera.y += (camera.targetY - camera.y) * 0.1;

        // ── Score ──
        const height = Math.max(0, Math.floor((INTERNAL_HEIGHT - TILE * 2 - p.y) / 8));
        if (height > score) score = height;
        scoreDisplay.textContent = score + 'm';

        // Height bar
        const totalH = INTERNAL_HEIGHT - TILE * 2 - towerTopY;
        const playerProg = Math.min(1, (INTERNAL_HEIGHT - TILE * 2 - p.y) / totalH);
        const lavaProg = Math.min(1, Math.max(0, (INTERNAL_HEIGHT - TILE * 2 - lava.y + 200) / totalH));
        heightBarFill.style.height = (playerProg * 100) + '%';
        heightBarPlayer.style.bottom = (playerProg * 100) + '%';
        heightBarLava.style.height = (lavaProg * 100) + '%';

        // ── Lava ──
        if (lavaWaiting) {
            if (gameTime > LAVA_START_DELAY) {
                lavaWaiting = false;
            }
        } else {
            lava.speed = Math.min(LAVA_MAX_SPEED, LAVA_INITIAL_SPEED + score * LAVA_ACCEL * 8);
            lava.y -= lava.speed;
            const maxDist = INTERNAL_HEIGHT * 1.8;
            if (lava.y > p.y + maxDist) lava.y = p.y + maxDist;
        }

        if (p.y + p.h > lava.y + 5) {
            killPlayer();
            return;
        }

        // Lava particles
        if (Math.random() < 0.25) {
            lavaParts.push({
                x: PLAY_LEFT + Math.random() * PLAY_WIDTH,
                y: lava.y - Math.random() * 3,
                vx: (Math.random() - 0.5) * 1.5,
                vy: -1 - Math.random() * 2.5,
                life: 0.6 + Math.random() * 0.4,
                size: 2 + Math.random() * 4,
                color: Math.random() < 0.5 ? C.lava1 : C.lava2
            });
        }

        // ── Update particles ──
        updateParticles(dt);
        updateLavaParts(dt);
        updateDeathParts(dt);

        // ── Screen shake ──
        if (screenShake > 0) {
            screenShake -= dt * 4;
            if (screenShake < 0) screenShake = 0;
            shakeX = (Math.random() - 0.5) * screenShake * 6;
            shakeY = (Math.random() - 0.5) * screenShake * 6;
        } else {
            shakeX = 0;
            shakeY = 0;
        }
    }

    function killPlayer() {
        gameState = 'dead';
        emitDeath(player.x + player.w / 2, player.y + player.h / 2);
        screenShake = 2;

        newBest = score > highScore;
        if (newBest) {
            highScore = score;
            localStorage.setItem('cubeEscapeHS2', highScore);
        }

        finalScoreEl.textContent = 'HEIGHT: ' + score + 'm';
        highScoreEl.textContent = 'BEST: ' + highScore + 'm';
        if (newBest) newBestEl.classList.remove('hidden');
        else newBestEl.classList.add('hidden');

        setTimeout(() => {
            gameOverScreen.classList.remove('hidden');
            hud.classList.add('hidden');
            if (isMobile) mobileControls.classList.add('hidden');
        }, 600);
    }

    function winGame() {
        gameState = 'won';
        winScoreEl.textContent = 'CLIMBED ' + score + 'm!';
        screenShake = 1;
        emit(player.x + player.w / 2, player.y, '#44ff44', 20, 30, 5, 0.05);
        emit(player.x + player.w / 2, player.y, '#ffcc00', 15, 20, 4, 0.05);

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('cubeEscapeHS2', highScore);
        }

        setTimeout(() => {
            winScreen.classList.remove('hidden');
            hud.classList.add('hidden');
            if (isMobile) mobileControls.classList.add('hidden');
        }, 500);
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const pp = particles[i];
            pp.x += pp.vx;
            pp.y += pp.vy;
            pp.vy += pp.grav;
            pp.life -= dt;
            if (pp.life <= 0) particles.splice(i, 1);
        }
    }
    function updateLavaParts(dt) {
        for (let i = lavaParts.length - 1; i >= 0; i--) {
            const pp = lavaParts[i];
            pp.x += pp.vx;
            pp.y += pp.vy;
            pp.life -= dt;
            pp.size *= 0.97;
            if (pp.life <= 0) lavaParts.splice(i, 1);
        }
    }
    function updateDeathParts(dt) {
        for (let i = deathParts.length - 1; i >= 0; i--) {
            const pp = deathParts[i];
            pp.x += pp.vx;
            pp.y += pp.vy;
            pp.vy += 0.12;
            pp.vx *= 0.99;
            pp.life -= dt;
            pp.rot += 0.08;
            if (pp.life <= 0) deathParts.splice(i, 1);
        }
    }

    // ── Drawing ──
    function draw() {
        const c = bctx;
        c.clearRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

        if (gameState === 'title') {
            drawTitleBG(c);
            blitToScreen();
            return;
        }

        c.save();
        c.translate(Math.round(shakeX), Math.round(-camera.y + shakeY));

        drawBG(c);
        drawStars(c);
        drawWalls(c);
        drawPlatforms(c);
        drawLavaGlow(c);

        if (player) {
            drawTrail(c);
            if (gameState === 'playing') drawPlayer(c);
        }

        drawDeathParts(c);
        drawParticlesVis(c);
        drawLava(c);
        drawLavaPartsVis(c);

        // Vignette at bottom near lava
        if (lava) {
            const vignY = lava.y - 120;
            const grad = c.createLinearGradient(0, vignY, 0, lava.y);
            grad.addColorStop(0, 'rgba(255,50,0,0)');
            grad.addColorStop(1, 'rgba(255,50,0,0.08)');
            c.fillStyle = grad;
            c.fillRect(0, vignY, INTERNAL_WIDTH, 120);
        }

        c.restore();

        // Screen vignette overlay
        drawVignette(c);

        blitToScreen();
    }

    function blitToScreen() {
        ctx.imageSmoothingEnabled = false;
        // Calculate scale to fill screen (maintain aspect ratio)
        const scaleX = canvas.width / INTERNAL_WIDTH;
        const scaleY = canvas.height / INTERNAL_HEIGHT;
        const scale = Math.max(scaleX, scaleY);
        const dw = INTERNAL_WIDTH * scale;
        const dh = INTERNAL_HEIGHT * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(buffer, dx, dy, dw, dh);
    }

    function drawTitleBG(c) {
        const t = Date.now() / 1000;
        // Gradient background
        const grad = c.createLinearGradient(0, 0, 0, INTERNAL_HEIGHT);
        grad.addColorStop(0, C.bgTop);
        grad.addColorStop(1, '#12122a');
        c.fillStyle = grad;
        c.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

        // Floating stars
        for (let i = 0; i < 40; i++) {
            const sx = (i * 37 + t * 5) % INTERNAL_WIDTH;
            const sy = (i * 53 + Math.sin(t + i) * 10) % INTERNAL_HEIGHT;
            const alpha = 0.3 + Math.sin(t * 2 + i) * 0.2;
            c.fillStyle = C.starColor + alpha + ')';
            c.fillRect(Math.floor(sx), Math.floor(sy), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
        }

        // Animated cubes
        for (let i = 0; i < 6; i++) {
            const cx = 40 + i * 65;
            const cy = INTERNAL_HEIGHT * 0.7 + Math.sin(t * 1.5 + i * 1.2) * 25;
            const rot = t * (i % 2 === 0 ? 1.5 : -1.5) + i;
            const s = 10 + i * 2;
            c.save();
            c.translate(cx, cy);
            c.rotate(rot);
            c.globalAlpha = 0.3;
            c.fillStyle = C.player;
            c.fillRect(-s / 2, -s / 2, s, s);
            c.fillStyle = C.playerHi;
            c.fillRect(-s / 2, -s / 2, s, 3);
            c.fillRect(-s / 2, -s / 2, 3, s);
            c.globalAlpha = 1;
            c.restore();
        }

        // Fake lava at bottom
        c.fillStyle = C.lava1;
        c.beginPath();
        c.moveTo(0, INTERNAL_HEIGHT - 30);
        for (let x = 0; x <= INTERNAL_WIDTH; x += 4) {
            c.lineTo(x, INTERNAL_HEIGHT - 30 + Math.sin(x * 0.04 + t * 2.5) * 5);
        }
        c.lineTo(INTERNAL_WIDTH, INTERNAL_HEIGHT);
        c.lineTo(0, INTERNAL_HEIGHT);
        c.closePath();
        c.fill();
        c.fillStyle = C.lava3;
        c.fillRect(0, INTERNAL_HEIGHT - 15, INTERNAL_WIDTH, 15);
    }

    function drawBG(c) {
        const startY = Math.floor(camera.y / TILE) * TILE - TILE;
        const endY = camera.y + INTERNAL_HEIGHT + TILE;

        // Gradient sky
        const grad = c.createLinearGradient(0, startY, 0, endY);
        grad.addColorStop(0, C.bgTop);
        grad.addColorStop(1, C.bgBot);
        c.fillStyle = grad;
        c.fillRect(0, startY, INTERNAL_WIDTH, endY - startY);

        // Subtle brick pattern
        for (let y = startY; y < endY; y += TILE) {
            const row = Math.floor(y / TILE);
            const offset = (row % 2) * (TILE / 2);
            for (let x = 0; x < INTERNAL_WIDTH; x += TILE) {
                const bx = x + offset;
                const hash = ((bx * 7 + y * 13 + 37) % 29) / 29;
                const alpha = 0.02 + hash * 0.03;
                c.fillStyle = 'rgba(255,255,255,' + alpha + ')';
                c.fillRect(bx, y, TILE - 1, TILE - 1);
            }
        }
    }

    function drawStars(c) {
        const t = Date.now() / 1000;
        for (const s of starField) {
            const sy = s.y - Math.abs(camera.y) * 0.05; // parallax
            const screenY = sy - camera.y * 0.15;
            if (screenY < camera.y - 20 || screenY > camera.y + INTERNAL_HEIGHT + 20) continue;
            const tw = Math.sin(t * s.speed + s.twinkle);
            const alpha = 0.2 + tw * 0.25;
            if (alpha <= 0) continue;
            c.fillStyle = C.starColor + alpha.toFixed(2) + ')';
            c.fillRect(Math.floor(s.x), Math.floor(screenY), s.size, s.size);
        }
    }

    function drawWalls(c) {
        const startY = Math.floor(camera.y / TILE) * TILE - TILE;
        const endY = camera.y + INTERNAL_HEIGHT + TILE * 2;

        for (let y = startY; y < endY; y += TILE) {
            const row = Math.floor(y / TILE);
            // Left wall
            c.fillStyle = C.wall;
            c.fillRect(0, y, WALL_W, TILE);
            c.fillStyle = C.wallHi;
            c.fillRect(WALL_W - 3, y, 3, TILE);
            c.fillStyle = C.wallSh;
            c.fillRect(0, y, 3, TILE);
            c.fillStyle = C.wallLine;
            c.fillRect(0, y + TILE - 1, WALL_W, 1);
            if (row % 2 === 0) {
                c.fillStyle = C.wallLine;
                c.fillRect(WALL_W / 2, y, 1, TILE);
            }

            // Right wall
            c.fillStyle = C.wall;
            c.fillRect(INTERNAL_WIDTH - WALL_W, y, WALL_W, TILE);
            c.fillStyle = C.wallSh;
            c.fillRect(INTERNAL_WIDTH - WALL_W, y, 3, TILE);
            c.fillStyle = C.wallHi;
            c.fillRect(INTERNAL_WIDTH - 3, y, 3, TILE);
            c.fillStyle = C.wallLine;
            c.fillRect(INTERNAL_WIDTH - WALL_W, y + TILE - 1, WALL_W, 1);
            if (row % 2 === 1) {
                c.fillStyle = C.wallLine;
                c.fillRect(INTERNAL_WIDTH - WALL_W / 2, y, 1, TILE);
            }
        }
    }

    function drawPlatforms(c) {
        const vTop = camera.y - TILE * 2;
        const vBot = camera.y + INTERNAL_HEIGHT + TILE * 2;

        for (const pl of platforms) {
            if (pl.y + pl.h < vTop || pl.y > vBot) continue;
            if (pl.type === 'spike') drawSpike(c, pl);
            else if (pl.type === 'exit') drawExit(c, pl);
            else drawPlat(c, pl);
        }
    }

    function drawPlat(c, pl) {
        const isMoving = pl.type === 'moving';
        const main = isMoving ? C.movePlat : C.platMain;
        const top = isMoving ? C.moveTop : C.platTop;
        const sh = isMoving ? C.moveSh : C.platSh;

        // Drop shadow
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(pl.x + 2, pl.y + 2, pl.w, pl.h);

        // Body
        c.fillStyle = main;
        c.fillRect(pl.x, pl.y, pl.w, pl.h);

        // Top highlight
        c.fillStyle = top;
        c.fillRect(pl.x, pl.y, pl.w, 4);
        c.fillRect(pl.x, pl.y, 3, pl.h);

        // Bottom/right shadow
        c.fillStyle = sh;
        c.fillRect(pl.x, pl.y + pl.h - 3, pl.w, 3);
        c.fillRect(pl.x + pl.w - 3, pl.y, 3, pl.h);

        // Surface details
        c.fillStyle = C.platDot;
        for (let dx = 6; dx < pl.w - 6; dx += 8) {
            c.fillRect(pl.x + dx, pl.y + 7, 2, 2);
        }

        // Moving platform indicator arrows
        if (isMoving) {
            c.fillStyle = 'rgba(255,255,255,0.15)';
            const my = pl.y + pl.h / 2 - 1;
            c.fillRect(pl.x + 4, my, 3, 2);
            c.fillRect(pl.x + pl.w - 7, my, 3, 2);
        }
    }

    function drawSpike(c, pl) {
        // Shadow
        c.fillStyle = 'rgba(0,0,0,0.2)';
        c.beginPath();
        c.moveTo(pl.x + 2, pl.y + pl.h + 2);
        c.lineTo(pl.x + pl.w / 2 + 2, pl.y + 2);
        c.lineTo(pl.x + pl.w + 2, pl.y + pl.h + 2);
        c.closePath();
        c.fill();

        c.fillStyle = C.spike;
        c.beginPath();
        c.moveTo(pl.x, pl.y + pl.h);
        c.lineTo(pl.x + pl.w / 2, pl.y);
        c.lineTo(pl.x + pl.w, pl.y + pl.h);
        c.closePath();
        c.fill();

        c.fillStyle = C.spikeHi;
        c.beginPath();
        c.moveTo(pl.x + 3, pl.y + pl.h);
        c.lineTo(pl.x + pl.w / 2, pl.y + 4);
        c.lineTo(pl.x + pl.w / 2, pl.y + pl.h);
        c.closePath();
        c.fill();

        // Glint
        c.fillStyle = 'rgba(255,255,255,0.3)';
        c.fillRect(pl.x + pl.w / 2 - 1, pl.y + 2, 2, 2);
    }

    function drawExit(c, pl) {
        const t = Date.now() / 1000;
        const pulse = Math.sin(t * 3) * 0.3 + 0.7;

        // Big glow
        c.fillStyle = 'rgba(50,255,80,' + (pulse * 0.12) + ')';
        c.fillRect(pl.x - 10, pl.y - 20, pl.w + 20, pl.h + 30);

        // Rays
        for (let i = 0; i < 5; i++) {
            const rx = pl.x + (pl.w / 6) * (i + 0.5);
            const rh = 15 + Math.sin(t * 4 + i * 1.5) * 8;
            c.fillStyle = 'rgba(100,255,100,' + (0.08 + Math.sin(t * 3 + i) * 0.04) + ')';
            c.fillRect(rx, pl.y - rh, 4, rh);
        }

        // Platform
        c.fillStyle = C.exit;
        c.fillRect(pl.x, pl.y, pl.w, pl.h);
        c.fillStyle = C.exitGlow;
        c.fillRect(pl.x, pl.y, pl.w, 4);

        // Sparkles
        for (let i = 0; i < 3; i++) {
            const sx = pl.x + 10 + ((t * 30 + i * 50) % (pl.w - 20));
            const sy = pl.y - 5 - Math.sin(t * 3 + i * 2) * 8;
            const sa = 0.4 + Math.sin(t * 5 + i * 3) * 0.3;
            c.fillStyle = 'rgba(200,255,200,' + sa + ')';
            c.fillRect(Math.floor(sx), Math.floor(sy), 2, 2);
        }

        // Text
        c.fillStyle = '#ffffff';
        c.font = '8px monospace';
        c.textAlign = 'center';
        c.globalAlpha = 0.6 + pulse * 0.3;
        c.fillText('▲ ESCAPE ▲', pl.x + pl.w / 2, pl.y - 10);
        c.globalAlpha = 1;
        c.textAlign = 'left';
    }

    function drawPlayer(c) {
        const p = player;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;

        c.save();
        c.translate(Math.round(cx), Math.round(cy));
        c.rotate(p.rotation);
        c.scale(p.stretch, p.squash);

        const hw = p.w / 2;
        const hh = p.h / 2;

        // Shadow
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(-hw + 2, -hh + 2, p.w, p.h);

        // Body
        c.fillStyle = C.player;
        c.fillRect(-hw, -hh, p.w, p.h);

        // Top/left highlight
        c.fillStyle = C.playerHi;
        c.fillRect(-hw, -hh, p.w, 4);
        c.fillRect(-hw, -hh, 4, p.h);

        // Bottom/right shadow
        c.fillStyle = C.playerSh;
        c.fillRect(-hw, hh - 4, p.w, 4);
        c.fillRect(hw - 4, -hh, 4, p.h);

        // Corner pixel accents
        c.fillStyle = C.playerHi;
        c.fillRect(-hw, -hh, 2, 2);
        c.fillStyle = C.playerSh;
        c.fillRect(hw - 2, hh - 2, 2, 2);

        // Eye
        const ex = 2, ey = -2;
        c.fillStyle = C.playerEye;
        c.fillRect(ex, ey, 6, 6);
        c.fillStyle = C.eyeShine;
        c.fillRect(ex + 1, ey + 1, 2, 2);

        c.restore();

        // Ground shadow
        if (p.onGround) {
            c.fillStyle = 'rgba(0,0,0,0.2)';
            const sw = p.w * 0.8;
            c.fillRect(cx - sw / 2, p.groundY + 1, sw, 3);
        }
    }

    function drawTrail(c) {
        for (const t of player.trail) {
            const alpha = (t.life / 0.25) * 0.2;
            const s = t.size * (t.life / 0.25);
            c.fillStyle = 'rgba(255,204,0,' + alpha.toFixed(2) + ')';
            c.fillRect(Math.floor(t.x - s / 2), Math.floor(t.y - s / 2), Math.ceil(s), Math.ceil(s));
        }
    }

    function drawParticlesVis(c) {
        for (const pp of particles) {
            const alpha = Math.max(0, pp.life / pp.max);
            c.globalAlpha = alpha;
            c.fillStyle = pp.color;
            c.fillRect(Math.floor(pp.x - pp.size / 2), Math.floor(pp.y - pp.size / 2),
                        Math.ceil(pp.size), Math.ceil(pp.size));
        }
        c.globalAlpha = 1;
    }

    function drawDeathParts(c) {
        for (const pp of deathParts) {
            c.save();
            c.translate(Math.floor(pp.x), Math.floor(pp.y));
            c.rotate(pp.rot);
            c.globalAlpha = Math.max(0, pp.life);
            c.fillStyle = pp.color;
            const s = pp.size * Math.max(0.3, pp.life);
            c.fillRect(-s / 2, -s / 2, s, s);
            c.restore();
        }
        c.globalAlpha = 1;
    }

    function drawLavaGlow(c) {
        if (!lava) return;
        const grad = c.createLinearGradient(0, lava.y - 200, 0, lava.y);
        grad.addColorStop(0, 'rgba(255,60,0,0)');
        grad.addColorStop(0.5, 'rgba(255,60,0,0.05)');
        grad.addColorStop(1, 'rgba(255,60,0,0.18)');
        c.fillStyle = grad;
        c.fillRect(0, lava.y - 200, INTERNAL_WIDTH, 200);
    }

    function drawLava(c) {
        if (!lava) return;
        const t = Date.now() / 1000;
        const ly = lava.y;

        // Surface wave
        c.fillStyle = C.lava1;
        c.beginPath();
        c.moveTo(0, ly);
        for (let x = 0; x <= INTERNAL_WIDTH; x += 3) {
            const w = Math.sin(x * 0.04 + t * 2.8) * 5 +
                      Math.sin(x * 0.07 + t * 4.2) * 2.5 +
                      Math.sin(x * 0.12 + t * 1.5) * 1.5;
            c.lineTo(x, ly + w);
        }
        c.lineTo(INTERNAL_WIDTH, ly + 800);
        c.lineTo(0, ly + 800);
        c.closePath();
        c.fill();

        // Bright crest
        c.fillStyle = C.lava2;
        c.beginPath();
        c.moveTo(0, ly + 4);
        for (let x = 0; x <= INTERNAL_WIDTH; x += 3) {
            const w = Math.sin(x * 0.04 + t * 2.8) * 5 +
                      Math.sin(x * 0.07 + t * 4.2) * 2.5;
            c.lineTo(x, ly + w + 4);
        }
        c.lineTo(INTERNAL_WIDTH, ly + 16);
        c.lineTo(0, ly + 16);
        c.closePath();
        c.fill();

        // Yellow highlights on wave peaks
        c.fillStyle = '#ffaa33';
        for (let x = 0; x <= INTERNAL_WIDTH; x += 3) {
            const w = Math.sin(x * 0.04 + t * 2.8) * 5;
            if (w < -3) {
                c.fillRect(x, ly + w, 3, 2);
            }
        }

        // Dark underbody
        c.fillStyle = C.lava3;
        c.fillRect(0, ly + 25, INTERNAL_WIDTH, 800);

        // Internal glow streaks
        c.fillStyle = 'rgba(255,100,30,0.3)';
        for (let i = 0; i < 4; i++) {
            const sx = ((t * 20 + i * 100) % INTERNAL_WIDTH);
            c.fillRect(sx, ly + 12, 20, 3);
        }

        // Bubbles
        for (let i = 0; i < 6; i++) {
            const bx = ((t * 25 + i * 70) % (INTERNAL_WIDTH - WALL_W * 2)) + WALL_W;
            const by = ly + 10 + Math.sin(t * 2.5 + i * 2.5) * 4;
            const br = Math.max(1, 2 + Math.sin(t * 4 + i) * 2);
            c.fillStyle = C.lava2;
            c.beginPath();
            c.arc(bx, by, br, 0, Math.PI * 2);
            c.fill();
        }
    }

    function drawLavaPartsVis(c) {
        for (const pp of lavaParts) {
            c.globalAlpha = Math.max(0, pp.life);
            c.fillStyle = pp.color;
            c.fillRect(Math.floor(pp.x - pp.size / 2), Math.floor(pp.y - pp.size / 2),
                        Math.ceil(pp.size), Math.ceil(pp.size));
        }
        c.globalAlpha = 1;
    }

    function drawVignette(c) {
        // Subtle corner vignette
        const grad = c.createRadialGradient(
            INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_HEIGHT * 0.3,
            INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_HEIGHT * 0.75
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.35)');
        c.fillStyle = grad;
        c.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

        // Scanline effect (very subtle)
        c.fillStyle = 'rgba(0,0,0,0.04)';
        for (let y = 0; y < INTERNAL_HEIGHT; y += 3) {
            c.fillRect(0, y, INTERNAL_WIDTH, 1);
        }
    }

    // ── Game Loop ──
    let lastTime = 0;
    function loop(timestamp) {
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;

        update(dt);
        draw();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
})();
