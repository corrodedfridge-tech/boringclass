(function () {
    // ── Constants ──
    const INTERNAL_WIDTH = 400;
    const INTERNAL_HEIGHT = 600;
    const TILE = 20;
    const COLS = INTERNAL_WIDTH / TILE;
    const ROWS = INTERNAL_HEIGHT / TILE;
    const GRAVITY = 0.55;
    const JUMP_FORCE = -10.5;
    const MOVE_SPEED = 3.2;
    const PLAYER_SIZE = 18;
    const LAVA_INITIAL_SPEED = 0.4;
    const LAVA_MAX_SPEED = 1.8;
    const LAVA_ACCEL = 0.00008;
    const TOWER_HEIGHT = 250; // number of "screens" worth of platforms
    const PARTICLE_COUNT = 20;

    // ── Canvas Setup ──
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // Internal resolution
    canvas.width = INTERNAL_WIDTH;
    canvas.height = INTERNAL_HEIGHT;

    // Scale up for display
    function resizeCanvas() {
        const maxH = window.innerHeight - 40;
        const maxW = window.innerWidth - 40;
        const scale = Math.min(maxW / INTERNAL_WIDTH, maxH / INTERNAL_HEIGHT);
        canvas.style.width = Math.floor(INTERNAL_WIDTH * scale) + 'px';
        canvas.style.height = Math.floor(INTERNAL_HEIGHT * scale) + 'px';
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ── UI Elements ──
    const titleScreen = document.getElementById('title-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const winScreen = document.getElementById('win-screen');
    const hud = document.getElementById('hud');
    const scoreDisplay = document.getElementById('score-display');
    const finalScore = document.getElementById('final-score');
    const highScoreDisplay = document.getElementById('high-score-display');
    const winScoreEl = document.getElementById('win-score');

    // ── Game State ──
    let gameState = 'title'; // title, playing, dead, won
    let camera = { y: 0 };
    let player, platforms, walls, lava, particles, score, highScore, towerTopY;
    let deathParticles = [];
    let screenShake = 0;
    let lavaParticles = [];

    highScore = parseInt(localStorage.getItem('cubeEscapeHighScore')) || 0;

    // ── Input ──
    const keys = {};
    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if ((e.code === 'Space' || e.code === 'ArrowUp') && gameState !== 'playing') {
            e.preventDefault();
            handleStart();
        }
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });

    // Touch controls
    let touchLeft = false, touchRight = false, touchJump = false;
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchmove', handleTouch, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // Click/tap to start
    document.addEventListener('click', () => {
        if (gameState !== 'playing') handleStart();
    });

    function handleTouch(e) {
        e.preventDefault();
        if (gameState !== 'playing') {
            handleStart();
            return;
        }
        touchLeft = false;
        touchRight = false;
        touchJump = false;

        const rect = canvas.getBoundingClientRect();
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            const x = (t.clientX - rect.left) / rect.width;
            const y = (t.clientY - rect.top) / rect.height;

            if (y < 0.5) {
                touchJump = true;
            } else {
                if (x < 0.4) touchLeft = true;
                else if (x > 0.6) touchRight = true;
                else touchJump = true;
            }
        }
    }

    function handleTouchEnd(e) {
        e.preventDefault();
        if (e.touches.length === 0) {
            touchLeft = false;
            touchRight = false;
            touchJump = false;
        } else {
            handleTouch(e);
        }
    }

    function handleStart() {
        if (gameState === 'title' || gameState === 'dead' || gameState === 'won') {
            startGame();
        }
    }

    // ── Color Palette ──
    const COLORS = {
        bg: '#1a1a2e',
        bgGrad: '#16213e',
        wall: '#4a4a6a',
        wallHighlight: '#5a5a7a',
        wallShadow: '#3a3a5a',
        platform: '#5b8c5a',
        platformTop: '#6ea66d',
        platformDark: '#4a7a49',
        player: '#ffcc00',
        playerLight: '#ffdd44',
        playerDark: '#cc9900',
        playerEye: '#222',
        lava: '#ff3300',
        lavaLight: '#ff6633',
        lavaDark: '#cc2200',
        lavaGlow: 'rgba(255, 80, 0, 0.3)',
        spike: '#cc4444',
        exitPlatform: '#44cc44',
        exitGlow: '#88ff88',
        particle: '#ffaa00',
        text: '#ffffff'
    };

    // ── Level Generation ──
    function generateLevel() {
        platforms = [];
        walls = [];

        // Total height of the tower
        const totalHeight = TOWER_HEIGHT * INTERNAL_HEIGHT;
        towerTopY = -totalHeight;

        // Generate walls (left and right boundaries)
        // Walls are just collision boundaries, we'll draw them procedurally

        // Generate platforms
        let y = INTERNAL_HEIGHT - TILE * 3; // starting platform
        const startPlatY = y;

        // Floor platform
        platforms.push({
            x: TILE * 2,
            y: startPlatY,
            w: INTERNAL_WIDTH - TILE * 4,
            h: TILE,
            type: 'normal'
        });

        // Generate platforms going up
        let currentY = startPlatY - 50;
        let platformId = 0;

        while (currentY > towerTopY - INTERNAL_HEIGHT) {
            const sectionType = Math.random();
            platformId++;

            if (sectionType < 0.3) {
                // Staircase pattern
                const dir = Math.random() < 0.5 ? 1 : -1;
                const steps = 3 + Math.floor(Math.random() * 3);
                let px = TILE * 2 + Math.random() * (INTERNAL_WIDTH - TILE * 8);
                for (let s = 0; s < steps && currentY > towerTopY; s++) {
                    const pw = TILE * (3 + Math.floor(Math.random() * 3));
                    px += dir * (TILE * 2);
                    px = Math.max(TILE * 2, Math.min(px, INTERNAL_WIDTH - TILE * 2 - pw));
                    platforms.push({
                        x: px, y: currentY, w: pw, h: TILE, type: 'normal'
                    });
                    currentY -= 38 + Math.random() * 20;
                }
            } else if (sectionType < 0.55) {
                // Zigzag
                const pw = TILE * (3 + Math.floor(Math.random() * 2));
                const leftX = TILE * 2 + Math.random() * TILE * 2;
                const rightX = INTERNAL_WIDTH - TILE * 2 - pw - Math.random() * TILE * 2;
                for (let s = 0; s < 4 && currentY > towerTopY; s++) {
                    const px = s % 2 === 0 ? leftX : rightX;
                    platforms.push({
                        x: px, y: currentY, w: pw, h: TILE, type: 'normal'
                    });
                    currentY -= 42 + Math.random() * 18;
                }
            } else if (sectionType < 0.7) {
                // Central floating platforms
                for (let s = 0; s < 3 && currentY > towerTopY; s++) {
                    const pw = TILE * (2 + Math.floor(Math.random() * 2));
                    const px = TILE * 3 + Math.random() * (INTERNAL_WIDTH - TILE * 6 - pw);
                    platforms.push({
                        x: px, y: currentY, w: pw, h: TILE, type: 'normal'
                    });
                    currentY -= 45 + Math.random() * 20;
                }
            } else if (sectionType < 0.82) {
                // Wide platforms with gaps
                const gapX = TILE * 3 + Math.random() * (INTERNAL_WIDTH - TILE * 8);
                const gapW = TILE * 3;
                // Left part
                if (gapX > TILE * 3) {
                    platforms.push({
                        x: TILE * 2, y: currentY,
                        w: gapX - TILE * 2, h: TILE, type: 'normal'
                    });
                }
                // Right part
                const rightStart = gapX + gapW;
                const rightEnd = INTERNAL_WIDTH - TILE * 2;
                if (rightEnd - rightStart > TILE * 2) {
                    platforms.push({
                        x: rightStart, y: currentY,
                        w: rightEnd - rightStart, h: TILE, type: 'normal'
                    });
                }
                currentY -= 50 + Math.random() * 15;
            } else {
                // Spike section - platform with spikes nearby
                const pw = TILE * (4 + Math.floor(Math.random() * 3));
                const px = TILE * 2 + Math.random() * (INTERNAL_WIDTH - TILE * 4 - pw);
                platforms.push({
                    x: px, y: currentY, w: pw, h: TILE, type: 'normal'
                });

                // Add spike on the platform
                if (Math.random() < 0.5 && pw > TILE * 3) {
                    const spikeX = px + TILE + Math.random() * (pw - TILE * 2);
                    platforms.push({
                        x: spikeX, y: currentY - TILE, w: TILE, h: TILE, type: 'spike'
                    });
                }
                currentY -= 45 + Math.random() * 20;
            }

            // Ensure we always have a reachable platform
            if (platformId % 8 === 0) {
                // Safety platform - wide and easy to reach
                const pw = TILE * 6;
                const px = (INTERNAL_WIDTH - pw) / 2;
                platforms.push({
                    x: px, y: currentY, w: pw, h: TILE, type: 'normal'
                });
                currentY -= 45;
            }
        }

        // Exit platform at the very top
        platforms.push({
            x: TILE * 3, y: towerTopY + TILE * 2,
            w: INTERNAL_WIDTH - TILE * 6, h: TILE,
            type: 'exit'
        });
    }

    // ── Player ──
    function createPlayer() {
        return {
            x: INTERNAL_WIDTH / 2 - PLAYER_SIZE / 2,
            y: INTERNAL_HEIGHT - TILE * 3 - PLAYER_SIZE,
            vx: 0,
            vy: 0,
            w: PLAYER_SIZE,
            h: PLAYER_SIZE,
            onGround: false,
            rotation: 0,
            targetRotation: 0,
            rotationSpeed: 0,
            facingDir: 1, // 1 = right, -1 = left
            jumping: false,
            jumpPressed: false,
            dead: false,
            trail: [],
            squash: 1,
            stretch: 1,
            landTimer: 0
        };
    }

    // ── Particles ──
    function spawnParticles(x, y, color, count, spread, speed) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x + (Math.random() - 0.5) * spread,
                y: y + (Math.random() - 0.5) * spread,
                vx: (Math.random() - 0.5) * speed,
                vy: (Math.random() - 0.5) * speed - 1,
                life: 0.5 + Math.random() * 0.5,
                maxLife: 0.5 + Math.random() * 0.5,
                color: color,
                size: 2 + Math.random() * 3
            });
        }
    }

    function spawnDeathParticles(x, y) {
        deathParticles = [];
        for (let i = 0; i < 30; i++) {
            const angle = (Math.PI * 2 / 30) * i + Math.random() * 0.3;
            const speed = 2 + Math.random() * 5;
            deathParticles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                life: 1,
                size: 3 + Math.random() * 4,
                color: Math.random() < 0.5 ? COLORS.player : COLORS.playerDark,
                rotation: Math.random() * Math.PI * 2
            });
        }
    }

    // ── Game Start ──
    function startGame() {
        generateLevel();
        player = createPlayer();
        camera.y = 0;
        lava = {
            y: INTERNAL_HEIGHT + 100,
            speed: LAVA_INITIAL_SPEED,
            baseY: INTERNAL_HEIGHT + 100
        };
        particles = [];
        deathParticles = [];
        lavaParticles = [];
        score = 0;
        screenShake = 0;
        gameState = 'playing';

        titleScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        winScreen.classList.add('hidden');
        hud.classList.remove('hidden');
    }

    // ── Collision Detection ──
    function rectCollision(a, b) {
        return a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y;
    }

    // ── Update ──
    function update(dt) {
        if (gameState !== 'playing') {
            // Update death particles even when dead
            updateDeathParticles(dt);
            return;
        }

        const p = player;

        // ── Input ──
        let moveDir = 0;
        if (keys['ArrowLeft'] || keys['KeyA'] || touchLeft) moveDir = -1;
        if (keys['ArrowRight'] || keys['KeyD'] || touchRight) moveDir = 1;

        const jumpKey = keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || touchJump;

        // ── Horizontal Movement ──
        if (moveDir !== 0) {
            p.vx = moveDir * MOVE_SPEED;
            p.facingDir = moveDir;
        } else {
            p.vx *= 0.7; // friction
            if (Math.abs(p.vx) < 0.1) p.vx = 0;
        }

        // ── Jump ──
        if (jumpKey && !p.jumpPressed && p.onGround) {
            p.vy = JUMP_FORCE;
            p.onGround = false;
            p.jumping = true;
            p.jumpPressed = true;
            p.squash = 0.6;
            p.stretch = 1.4;

            // Set target rotation (90 degrees in move direction, GD style)
            p.targetRotation += (Math.PI / 2) * (p.facingDir || 1);
            p.rotationSpeed = (p.facingDir || 1) * 8;

            spawnParticles(p.x + p.w / 2, p.y + p.h, '#ffffff', 5, 10, 3);
        }
        if (!jumpKey) {
            p.jumpPressed = false;
        }

        // ── Gravity ──
        p.vy += GRAVITY;
        if (p.vy > 15) p.vy = 15;

        // ── Move & Collide ──
        // Horizontal
        p.x += p.vx;

        // Wall collision (tower walls)
        const wallLeft = TILE;
        const wallRight = INTERNAL_WIDTH - TILE;
        if (p.x < wallLeft) {
            p.x = wallLeft;
            p.vx = 0;
        }
        if (p.x + p.w > wallRight) {
            p.x = wallRight - p.w;
            p.vx = 0;
        }

        // Platform collision horizontal
        for (const plat of platforms) {
            if (plat.type === 'spike') continue;
            if (rectCollision(p, plat)) {
                if (p.vx > 0) {
                    p.x = plat.x - p.w;
                } else if (p.vx < 0) {
                    p.x = plat.x + plat.w;
                }
                p.vx = 0;
            }
        }

        // Vertical
        p.y += p.vy;
        p.onGround = false;

        for (const plat of platforms) {
            if (plat.type === 'spike') continue;
            if (rectCollision(p, plat)) {
                if (p.vy > 0) {
                    // Landing on top
                    p.y = plat.y - p.h;
                    if (p.vy > 3) {
                        p.squash = 1.3;
                        p.stretch = 0.7;
                        p.landTimer = 0.15;
                        spawnParticles(p.x + p.w / 2, p.y + p.h, '#ffffff', 3, 8, 2);
                    }
                    p.vy = 0;
                    p.onGround = true;
                    p.jumping = false;

                    // Snap rotation to nearest 90 degrees (GD style)
                    const snapAngle = Math.round(p.rotation / (Math.PI / 2)) * (Math.PI / 2);
                    p.rotation = snapAngle;
                    p.targetRotation = snapAngle;
                    p.rotationSpeed = 0;

                    // Check if it's the exit
                    if (plat.type === 'exit') {
                        gameState = 'won';
                        const finalHeight = Math.floor(Math.abs(towerTopY - INTERNAL_HEIGHT) / 10);
                        winScoreEl.textContent = 'YOU CLIMBED ' + finalHeight + ' METERS!';
                        winScreen.classList.remove('hidden');
                        hud.classList.add('hidden');
                        if (score > highScore) {
                            highScore = score;
                            localStorage.setItem('cubeEscapeHighScore', highScore);
                        }
                    }
                } else if (p.vy < 0) {
                    // Hitting from below
                    p.y = plat.y + plat.h;
                    p.vy = 0;
                }
            }
        }

        // Spike collision
        for (const plat of platforms) {
            if (plat.type === 'spike') {
                if (rectCollision(p, plat)) {
                    killPlayer();
                    return;
                }
            }
        }

        // ── Rotation (Geometry Dash style) ──
        if (!p.onGround) {
            // Rotate while in air
            p.rotation += p.rotationSpeed * dt;

            // Smoothly approach target
            if (Math.abs(p.rotationSpeed) > 0.1) {
                // Keep spinning
            }
        }

        // ── Squash & Stretch ──
        p.squash += (1 - p.squash) * 0.15;
        p.stretch += (1 - p.stretch) * 0.15;
        if (p.landTimer > 0) p.landTimer -= dt;

        // ── Trail ──
        if (Math.abs(p.vx) > 0.5 || Math.abs(p.vy) > 0.5) {
            p.trail.push({
                x: p.x + p.w / 2,
                y: p.y + p.h / 2,
                life: 0.3,
                size: PLAYER_SIZE * 0.6
            });
        }
        for (let i = p.trail.length - 1; i >= 0; i--) {
            p.trail[i].life -= dt;
            if (p.trail[i].life <= 0) p.trail.splice(i, 1);
        }

        // ── Camera ──
        const targetCamY = p.y - INTERNAL_HEIGHT * 0.55;
        camera.y += (targetCamY - camera.y) * 0.08;
        if (camera.y > 0) camera.y = 0;

        // ── Score ──
        const height = Math.floor((INTERNAL_HEIGHT - p.y) / 10);
        if (height > score) score = height;
        scoreDisplay.textContent = 'HEIGHT: ' + score + 'm';

        // ── Lava ──
        lava.speed = Math.min(LAVA_MAX_SPEED, LAVA_INITIAL_SPEED + score * LAVA_ACCEL * 10);
        lava.y -= lava.speed;

        // Lava can't be too far behind the player
        const maxLavaDist = INTERNAL_HEIGHT * 1.5;
        if (lava.y > p.y + maxLavaDist) {
            lava.y = p.y + maxLavaDist;
        }

        // Lava catches player
        if (p.y + p.h > lava.y) {
            killPlayer();
            return;
        }

        // ── Lava Particles ──
        if (Math.random() < 0.3) {
            lavaParticles.push({
                x: TILE + Math.random() * (INTERNAL_WIDTH - TILE * 2),
                y: lava.y - Math.random() * 5,
                vx: (Math.random() - 0.5) * 2,
                vy: -1 - Math.random() * 3,
                life: 0.5 + Math.random() * 0.5,
                size: 2 + Math.random() * 4,
                color: Math.random() < 0.5 ? COLORS.lava : COLORS.lavaLight
            });
        }

        // ── Update Particles ──
        updateParticles(dt);
        updateLavaParticles(dt);

        // ── Screen Shake ──
        if (screenShake > 0) screenShake -= dt * 5;
        if (screenShake < 0) screenShake = 0;
    }

    function killPlayer() {
        gameState = 'dead';
        spawnDeathParticles(player.x + player.w / 2, player.y + player.h / 2);
        screenShake = 3;

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('cubeEscapeHighScore', highScore);
        }

        finalScore.textContent = 'HEIGHT: ' + score + 'm';
        highScoreDisplay.textContent = 'BEST: ' + highScore + 'm';

        setTimeout(() => {
            gameOverScreen.classList.remove('hidden');
            hud.classList.add('hidden');
        }, 800);
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updateLavaParticles(dt) {
        for (let i = lavaParticles.length - 1; i >= 0; i--) {
            const p = lavaParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= dt;
            p.size *= 0.97;
            if (p.life <= 0) lavaParticles.splice(i, 1);
        }
    }

    function updateDeathParticles(dt) {
        for (let i = deathParticles.length - 1; i >= 0; i--) {
            const p = deathParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15;
            p.vx *= 0.98;
            p.life -= dt * 1.5;
            p.rotation += 0.1;
            if (p.life <= 0) deathParticles.splice(i, 1);
        }
    }

    // ── Drawing ──
    function draw() {
        // Clear
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

        if (gameState === 'title') {
            drawTitleBG();
            return;
        }

        ctx.save();

        // Screen shake
        if (screenShake > 0) {
            ctx.translate(
                (Math.random() - 0.5) * screenShake * 4,
                (Math.random() - 0.5) * screenShake * 4
            );
        }

        // Camera transform
        ctx.translate(0, -camera.y);

        // Background
        drawBackground();

        // Walls
        drawWalls();

        // Platforms
        drawPlatforms();

        // Lava glow
        drawLavaGlow();

        // Player trail
        if (player && !player.dead) {
            drawTrail();
        }

        // Player
        if (gameState === 'playing') {
            drawPlayer();
        }

        // Death particles
        drawDeathParticles();

        // Particles
        drawParticles();

        // Lava
        drawLava();

        // Lava particles
        drawLavaParticlesVisual();

        ctx.restore();
    }

    function drawTitleBG() {
        // Animated background for title
        const time = Date.now() / 1000;
        for (let y = 0; y < INTERNAL_HEIGHT; y += TILE) {
            for (let x = 0; x < INTERNAL_WIDTH; x += TILE) {
                const brightness = Math.sin(x * 0.05 + time) * Math.cos(y * 0.05 + time * 0.7) * 15;
                const val = Math.floor(20 + brightness);
                ctx.fillStyle = `rgb(${val}, ${val}, ${val + 15})`;
                ctx.fillRect(x, y, TILE, TILE);
            }
        }

        // Draw some floating cubes
        for (let i = 0; i < 5; i++) {
            const cx = INTERNAL_WIDTH * 0.2 + i * 70;
            const cy = INTERNAL_HEIGHT * 0.5 + Math.sin(time * 2 + i) * 30;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(time * (i % 2 === 0 ? 1 : -1));
            ctx.fillStyle = COLORS.player;
            ctx.fillRect(-8, -8, 16, 16);
            ctx.fillStyle = COLORS.playerLight;
            ctx.fillRect(-8, -8, 16, 4);
            ctx.fillRect(-8, -8, 4, 16);
            ctx.restore();
        }
    }

    function drawBackground() {
        // Parallax brick pattern
        const startY = Math.floor((camera.y - 50) / TILE) * TILE;
        const endY = camera.y + INTERNAL_HEIGHT + TILE;

        for (let y = startY; y < endY; y += TILE) {
            for (let x = 0; x < INTERNAL_WIDTH; x += TILE) {
                const isOffset = (Math.floor(y / TILE) % 2 === 0);
                const bx = isOffset ? x : x + TILE / 2;
                const noise = ((bx * 7 + y * 13) % 17) / 17;
                const base = 26;
                const val = Math.floor(base + noise * 8);
                ctx.fillStyle = `rgb(${val}, ${val}, ${val + 18})`;
                ctx.fillRect(x, y, TILE, TILE);

                // Brick lines
                ctx.fillStyle = `rgba(0,0,0,0.15)`;
                ctx.fillRect(x, y + TILE - 1, TILE, 1);
                const lineX = isOffset ? x : x + TILE / 2;
                ctx.fillRect(lineX, y, 1, TILE);
            }
        }
    }

    function drawWalls() {
        const startY = Math.floor((camera.y - TILE) / TILE) * TILE;
        const endY = camera.y + INTERNAL_HEIGHT + TILE;

        for (let y = startY; y < endY; y += TILE) {
            // Left wall
            ctx.fillStyle = COLORS.wall;
            ctx.fillRect(0, y, TILE, TILE);
            ctx.fillStyle = COLORS.wallHighlight;
            ctx.fillRect(0, y, TILE, 3);
            ctx.fillRect(TILE - 3, y, 3, TILE);
            ctx.fillStyle = COLORS.wallShadow;
            ctx.fillRect(0, y + TILE - 2, TILE, 2);

            // Right wall
            ctx.fillStyle = COLORS.wall;
            ctx.fillRect(INTERNAL_WIDTH - TILE, y, TILE, TILE);
            ctx.fillStyle = COLORS.wallHighlight;
            ctx.fillRect(INTERNAL_WIDTH - TILE, y, TILE, 3);
            ctx.fillStyle = COLORS.wallShadow;
            ctx.fillRect(INTERNAL_WIDTH - TILE, y + TILE - 2, TILE, 2);
            ctx.fillRect(INTERNAL_WIDTH - TILE, y, 3, TILE);
        }
    }

    function drawPlatforms() {
        const viewTop = camera.y - TILE;
        const viewBottom = camera.y + INTERNAL_HEIGHT + TILE;

        for (const plat of platforms) {
            if (plat.y + plat.h < viewTop || plat.y > viewBottom) continue;

            if (plat.type === 'spike') {
                drawSpike(plat);
            } else if (plat.type === 'exit') {
                drawExitPlatform(plat);
            } else {
                drawNormalPlatform(plat);
            }
        }
    }

    function drawNormalPlatform(plat) {
        // Main body
        ctx.fillStyle = COLORS.platform;
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

        // Top highlight
        ctx.fillStyle = COLORS.platformTop;
        ctx.fillRect(plat.x, plat.y, plat.w, 4);

        // Bottom shadow
        ctx.fillStyle = COLORS.platformDark;
        ctx.fillRect(plat.x, plat.y + plat.h - 3, plat.w, 3);

        // Left highlight
        ctx.fillStyle = COLORS.platformTop;
        ctx.fillRect(plat.x, plat.y, 3, plat.h);

        // Right shadow
        ctx.fillStyle = COLORS.platformDark;
        ctx.fillRect(plat.x + plat.w - 3, plat.y, 3, plat.h);

        // Surface detail - dots
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let dx = 4; dx < plat.w - 4; dx += 8) {
            ctx.fillRect(plat.x + dx, plat.y + 6, 2, 2);
        }
    }

    function drawSpike(plat) {
        ctx.fillStyle = COLORS.spike;
        // Draw triangle spike
        ctx.beginPath();
        ctx.moveTo(plat.x, plat.y + plat.h);
        ctx.lineTo(plat.x + plat.w / 2, plat.y);
        ctx.lineTo(plat.x + plat.w, plat.y + plat.h);
        ctx.closePath();
        ctx.fill();

        // Highlight
        ctx.fillStyle = '#ee6666';
        ctx.beginPath();
        ctx.moveTo(plat.x + 3, plat.y + plat.h);
        ctx.lineTo(plat.x + plat.w / 2, plat.y + 4);
        ctx.lineTo(plat.x + plat.w / 2, plat.y + plat.h);
        ctx.closePath();
        ctx.fill();
    }

    function drawExitPlatform(plat) {
        const time = Date.now() / 1000;
        const pulse = Math.sin(time * 4) * 0.3 + 0.7;

        // Glow
        ctx.fillStyle = `rgba(68, 255, 68, ${pulse * 0.2})`;
        ctx.fillRect(plat.x - 5, plat.y - 5, plat.w + 10, plat.h + 10);

        // Platform
        ctx.fillStyle = COLORS.exitPlatform;
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

        // Shimmer
        ctx.fillStyle = COLORS.exitGlow;
        ctx.fillRect(plat.x, plat.y, plat.w, 4);

        // "EXIT" text
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('▲ EXIT ▲', plat.x + plat.w / 2, plat.y - 8);
        ctx.textAlign = 'left';

        // Arrow particles
        if (Math.random() < 0.1) {
            particles.push({
                x: plat.x + Math.random() * plat.w,
                y: plat.y,
                vx: 0,
                vy: -2,
                life: 0.8,
                maxLife: 0.8,
                color: COLORS.exitGlow,
                size: 3
            });
        }
    }

    function drawPlayer() {
        const p = player;
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(p.rotation);
        ctx.scale(p.stretch, p.squash);

        const halfW = p.w / 2;
        const halfH = p.h / 2;

        // Shadow under player
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-halfW + 2, -halfH + 2, p.w, p.h);

        // Main body
        ctx.fillStyle = COLORS.player;
        ctx.fillRect(-halfW, -halfH, p.w, p.h);

        // Top/left highlight
        ctx.fillStyle = COLORS.playerLight;
        ctx.fillRect(-halfW, -halfH, p.w, 4);
        ctx.fillRect(-halfW, -halfH, 4, p.h);

        // Bottom/right shadow
        ctx.fillStyle = COLORS.playerDark;
        ctx.fillRect(-halfW, halfH - 4, p.w, 4);
        ctx.fillRect(halfW - 4, -halfH, 4, p.h);

        // Eye (always faces movement direction relative to cube rotation)
        ctx.fillStyle = COLORS.playerEye;
        const eyeOffsetX = 3;
        const eyeOffsetY = -1;
        ctx.fillRect(eyeOffsetX, eyeOffsetY, 5, 5);

        // Eye highlight
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(eyeOffsetX + 1, eyeOffsetY + 1, 2, 2);

        ctx.restore();
    }

    function drawTrail() {
        for (const t of player.trail) {
            const alpha = t.life / 0.3;
            ctx.fillStyle = `rgba(255, 204, 0, ${alpha * 0.3})`;
            const s = t.size * alpha;
            ctx.fillRect(t.x - s / 2, t.y - s / 2, s, s);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    }

    function drawDeathParticles() {
        for (const p of deathParticles) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function drawLavaGlow() {
        // Glow above lava
        const gradient = ctx.createLinearGradient(0, lava.y - 150, 0, lava.y);
        gradient.addColorStop(0, 'rgba(255, 50, 0, 0)');
        gradient.addColorStop(1, 'rgba(255, 50, 0, 0.15)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, lava.y - 150, INTERNAL_WIDTH, 150);
    }

    function drawLava() {
        const time = Date.now() / 1000;

        // Wave surface
        ctx.fillStyle = COLORS.lava;
        ctx.beginPath();
        ctx.moveTo(0, lava.y);
        for (let x = 0; x <= INTERNAL_WIDTH; x += 4) {
            const wave = Math.sin(x * 0.05 + time * 3) * 4 +
                Math.sin(x * 0.08 + time * 5) * 2;
            ctx.lineTo(x, lava.y + wave);
        }
        ctx.lineTo(INTERNAL_WIDTH, lava.y + 1000);
        ctx.lineTo(0, lava.y + 1000);
        ctx.closePath();
        ctx.fill();

        // Lighter top layer
        ctx.fillStyle = COLORS.lavaLight;
        ctx.beginPath();
        ctx.moveTo(0, lava.y + 3);
        for (let x = 0; x <= INTERNAL_WIDTH; x += 4) {
            const wave = Math.sin(x * 0.05 + time * 3) * 4 +
                Math.sin(x * 0.08 + time * 5) * 2;
            ctx.lineTo(x, lava.y + wave + 3);
        }
        ctx.lineTo(INTERNAL_WIDTH, lava.y + 15);
        ctx.lineTo(0, lava.y + 15);
        ctx.closePath();
        ctx.fill();

        // Dark under layer
        ctx.fillStyle = COLORS.lavaDark;
        ctx.fillRect(0, lava.y + 20, INTERNAL_WIDTH, 1000);

        // Bubbling effect
        for (let i = 0; i < 5; i++) {
            const bx = ((time * 30 + i * 80) % (INTERNAL_WIDTH - TILE * 2)) + TILE;
            const by = lava.y + 10 + Math.sin(time * 2 + i * 3) * 5;
            const br = 2 + Math.sin(time * 4 + i) * 2;
            ctx.fillStyle = COLORS.lavaLight;
            ctx.beginPath();
            ctx.arc(bx, by, Math.max(1, br), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawLavaParticlesVisual() {
        for (const p of lavaParticles) {
            ctx.globalAlpha = Math.max(0, p.life * 2);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    }

    // ── Game Loop ──
    let lastTime = 0;
    function gameLoop(timestamp) {
        const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;

        update(dt);
        draw();

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
})();
