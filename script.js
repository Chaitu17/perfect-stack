class AudioController {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.baseFreq = 220; // A3
        // Pentatonic scale logic or similar for pleasant rising tones
        this.notes = [
            261.63, // C4
            293.66, // D4
            329.63, // E4
            392.00, // G4
            440.00, // A4
            523.25, // C5
            587.33, // D5
            659.25, // E5
            783.99, // G5
            880.00  // A5
        ];
    }

    playNote(index) {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Pick note based on score, cycle through scale
        const noteFreq = this.notes[index % this.notes.length];
        // Go up octaves every full cycle?
        const octave = Math.floor(index / this.notes.length);
        osc.frequency.setValueAtTime(noteFreq * Math.pow(2, octave), this.ctx.currentTime);

        osc.type = 'sine';

        // Envelope
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    }

    playPerfect() {
        this.playChord([261.63, 329.63, 392.00, 523.25]); // C Major 7ish
    }

    playChord(freqs) {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.frequency.value = f;
            osc.type = 'triangle';

            gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6 + (i * 0.1));

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 1.0);
        });
    }

    playGameOver() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.5);

        osc.type = 'sawtooth';

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.scoreElement = document.getElementById('score-container');
        this.startScreen = document.getElementById('start-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.finalScoreElement = document.getElementById('final-score');
        this.startBtn = document.getElementById('start-btn');
        this.restartBtn = document.getElementById('restart-btn');
        this.homeBtn = document.getElementById('home-btn');
        this.perfectMessage = document.getElementById('perfect-message');
        this.gameContainer = document.getElementById('game-container');
        this.finalScoreEl = document.getElementById('final-score');

        // Grab all theme pills globally from anywhere in the DOM
        this.themePills = document.querySelectorAll('.theme-pill');

        this.audio = new AudioController();

        // Theme palettes: block colors, window colors, accent trim
        this.themes = {
            dystopian: {
                blocks: ['#1a0a2e', '#2d1b4e', '#3d2060', '#1e0a3c', '#150826'],
                windows: ['#00ffff', '#ff00cc', '#ff6600', '#00ff88'],
                trim: '#ff00cc',
                windowGlow: true
            },
            ancient: {
                blocks: ['#5c3d1e', '#7a4f2a', '#8b5e35', '#6b4423', '#4a2f15'],
                windows: ['#f1c40f', '#e67e22', '#ffd700', '#ffaa00'],
                trim: '#e67e22',
                windowGlow: false
            },
            deserted: {
                blocks: ['#c0392b', '#e74c3c', '#922b21', '#d35400', '#a93226'],
                windows: ['#ecf0f1', '#f39c12', '#ffe0b2', '#fff9c4'],
                trim: '#f39c12',
                windowGlow: false
            }
        };

        this.currentTheme = 'dystopian';
        this.applyTheme(this.currentTheme);

        this.initEventListeners();
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.reset();
        this.loop();
    }

    applyTheme(themeName) {
        this.currentTheme = themeName;
        // Update body class for CSS variable switching
        document.body.className = `theme-${themeName}`;
        // Update game-container background image class
        this.gameContainer.className = `bg-${themeName}`;

        // Update ALL pill active states instantly regardless of which one was clicked
        this.themePills = document.querySelectorAll('.theme-pill'); // Re-query just to be safe
        this.themePills.forEach(pill => {
            pill.classList.toggle('active', pill.dataset.theme === themeName);
        });

        // Redraw blocks if we are in game over mode so the background/stack live-updates
        if (this.gameState === 'GAMEOVER') {
            this.draw();
        }
    }

    initEventListeners() {
        const actionHandler = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            this.handleAction();
        };

        this.canvas.addEventListener('mousedown', actionHandler);
        this.canvas.addEventListener('touchstart', actionHandler, { passive: false });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.gameState === 'GAMEOVER') {
                    this.start();
                } else {
                    this.handleAction();
                }
            }
        });

        // Theme pill buttons
        this.themePills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                // We do not want to remove game-over modal, just live change theme
                this.applyTheme(pill.dataset.theme);
                pill.blur(); // Fixes bug where Spacebar triggers the pill instead of dropping a block
            });
        });

        this.startBtn.addEventListener('click', () => {
            this.startBtn.blur();
            if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
            this.start();
        });

        this.restartBtn.addEventListener('click', () => {
            this.restartBtn.blur();
            if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
            this.start();
        });

        this.homeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.homeBtn.blur();
            this.gameOverScreen.classList.remove('active');
            this.startScreen.classList.add('active');

            // Clear out old game state visually
            this.blocks = [];
            this.draw();
        });
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.centerX = this.canvas.width / 2;
        this.blockHeight = 50;
        // Base width 40% of screen or roughly 300px
        this.baseBlockWidth = Math.min(300, this.canvas.width * 0.4);
    }

    reset() {
        this.score = 0;
        this.blocks = [];
        this.debris = [];
        this.gameState = 'IDLE';

        // Initial base block centered
        const initialX = (this.canvas.width - this.baseBlockWidth) / 2;
        this.addBlock(initialX, this.canvas.height - 150, this.baseBlockWidth, 0);

        this.currentBlock = null;
        this.direction = 1;
        this.speed = 4; // Starting speed
        this.cameraY = 0;
        this.targetCameraY = 0;

        this.updateScoreDisplay();
    }

    start() {
        this.reset();
        this.gameState = 'PLAYING';
        this.startScreen.classList.remove('active');
        this.gameOverScreen.classList.remove('active');
        this.spawnNextBlock();
    }

    spawnNextBlock() {
        const prevBlock = this.blocks[this.blocks.length - 1];
        const y = prevBlock.y - this.blockHeight;
        const width = prevBlock.width;

        // Spawn distance: ensure it's off screen but not too far
        const spawnDistance = 200;
        const x = this.direction === 1
            ? -width - spawnDistance
            : this.canvas.width + spawnDistance;

        // Pick color from current theme palette
        const theme = this.themes[this.currentTheme];
        const colorIndex = (this.score + 1) % theme.blocks.length;

        this.currentBlock = {
            x: x,
            y: y,
            width: width,
            color: theme.blocks[colorIndex],
            velocity: this.speed * this.direction
        };
    }

    addBlock(x, y, width, i) {
        const theme = this.themes[this.currentTheme];
        this.blocks.push({
            x: x,
            y: y,
            width: width,
            color: theme.blocks[i % theme.blocks.length]
        });
    }

    handleAction() {
        if (this.gameState !== 'PLAYING') return;
        if (this.currentBlock) {
            this.placeBlock();
        }
    }

    placeBlock() {
        const prevBlock = this.blocks[this.blocks.length - 1];
        const current = this.currentBlock;

        // Logic uses Left Edge
        const dist = current.x - prevBlock.x;
        const absDist = Math.abs(dist);

        const tolerance = 5;

        if (absDist <= tolerance) {
            // PERFECT
            current.x = prevBlock.x; // Snap
            this.audio.playPerfect();
            this.showPerfectEffect();

            this.addBlockFromCurrent();
            this.score++;
            // Slightly faster
            this.speed += 0.2;
        } else if (absDist < current.width) {
            // TRIMMED
            this.audio.playNote(this.score);

            const newWidth = current.width - absDist;
            let newX = current.x;

            // Debris calculation
            let debrisX, debrisWidth;

            if (dist > 0) {
                // Slipped Right
                // Debris is the rightmost part
                debrisWidth = dist;
                debrisX = current.x + newWidth;

                // New block stays at current.x (aligned with its own left edge)
                newX = current.x;
            } else {
                // Slipped Left
                // Debris is the leftmost part
                debrisWidth = absDist;
                debrisX = current.x;

                // New block must align with prevBlock.x (the overlapping part)
                newX = prevBlock.x;
            }

            this.addDebris(debrisX, current.y, debrisWidth, current.color);

            current.x = newX;
            current.width = newWidth;

            this.addBlockFromCurrent();
            this.score++;
            this.speed += 0.1;
        } else {
            // MISSED
            this.audio.playGameOver();
            this.addDebris(current.x, current.y, current.width, current.color);
            this.gameOver();
            return;
        }

        this.updateScoreDisplay();
        this.animateScore();

        this.direction *= -1;
        this.spawnNextBlock();
    }

    addBlockFromCurrent() {
        this.blocks.push({
            x: this.currentBlock.x,
            y: this.currentBlock.y,
            width: this.currentBlock.width,
            color: this.currentBlock.color
        });

        // Camera logic: keep last ~4 blocks in easy view
        // Base is at height-150.
        // As we go up, y decreases.
        // We want to shift world UP (positive Y translate)
        // Effectively we want the top block to stay around screen height * 0.6

        const topBlock = this.blocks[this.blocks.length - 1];
        const idealY = this.canvas.height * 0.6;

        if (topBlock.y < idealY) {
            // targetCameraY should be the difference
            this.targetCameraY = idealY - topBlock.y;
        }
    }

    addDebris(x, y, width, color) {
        this.debris.push({
            x: x,
            y: y,
            width: width,
            height: this.blockHeight,
            color: color,
            vy: 0,
            vx: 0,
            ay: 0.8,
            rot: 0,
            vRot: (Math.random() - 0.5) * 0.2, // slight rotation
            life: 1.0
        });
    }

    gameOver() {
        this.gameState = 'GAMEOVER';
        this.finalScoreElement.textContent = `Score: ${this.score}`;
        this.gameOverScreen.classList.add('active');
        this.currentBlock = null;
    }

    showPerfectEffect() {
        this.perfectMessage.classList.add('show');

        // Create ripple effect visual? 
        this.perfectMessage.style.left = (this.currentBlock.x + this.currentBlock.width / 2) + 'px';
        this.perfectMessage.style.top = (this.currentBlock.y - 20) + 'px';

        setTimeout(() => {
            this.perfectMessage.classList.remove('show');
        }, 800);
    }

    updateScoreDisplay() {
        this.scoreElement.innerText = this.score;
    }

    animateScore() {
        this.scoreElement.classList.add('bump');
        setTimeout(() => this.scoreElement.classList.remove('bump'), 150);
    }

    update() {
        if (this.gameState === 'PLAYING' && this.currentBlock) {
            this.currentBlock.x += this.currentBlock.velocity;

            // Bounds check to auto-reverse (making it easier/more forgiving)
            // Or just let it fly forever? 
            // "Blocks slide left-right" usually implies ping-pong.

            if (this.currentBlock.x > this.canvas.width + 200 && this.direction === 1) {
                this.direction = -1;
                this.currentBlock.velocity = -Math.abs(this.speed);
            } else if (this.currentBlock.x < -this.currentBlock.width - 200 && this.direction === -1) {
                this.direction = 1;
                this.currentBlock.velocity = Math.abs(this.speed);
            }
        }

        // Smooth camera
        this.cameraY += (this.targetCameraY - this.cameraY) * 0.1;

        // Debris physics
        for (let i = this.debris.length - 1; i >= 0; i--) {
            let p = this.debris[i];
            p.y += p.vy;
            p.vy += p.ay; // Gravity
            p.rot += p.vRot; // Rotation

            p.life -= 0.02;
            if (p.life <= 0 || p.y > this.canvas.height + Math.abs(this.cameraY)) {
                this.debris.splice(i, 1);
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(0, this.cameraY);

        // Draw blocks
        // Only draw visible blocks for performance? (optimization)
        for (const block of this.blocks) {
            // Simple culling
            if (block.y + this.cameraY > this.canvas.height + 100) continue;
            this.drawBlock(block);
        }

        // Draw current block
        if (this.currentBlock) {
            this.drawBlock(this.currentBlock);
        }

        // Draw debris
        for (const p of this.debris) {
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = p.life;
            this.ctx.save();
            this.ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
            this.ctx.rotate(p.rot);
            this.ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
            this.ctx.restore();
            this.ctx.globalAlpha = 1.0;
        }

        this.ctx.restore();
    }

    drawBlock(block) {
        const theme = this.themes[this.currentTheme];
        const bx = block.x;
        const by = block.y;
        const bw = block.width;
        const bh = this.blockHeight;

        // --- Floor/Building Body ---
        // Pick a block color deterministically from theme palette
        const colorIdx = Math.abs(Math.round(by / bh)) % theme.blocks.length;
        const baseColor = theme.blocks[colorIdx];

        // Shadow
        this.ctx.shadowColor = 'rgba(0,0,0,0.35)';
        this.ctx.shadowBlur = 12;
        this.ctx.shadowOffsetY = 6;

        this.ctx.fillStyle = baseColor;
        this.ctx.fillRect(bx, by, bw, bh);

        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetY = 0;

        // --- Concrete/Stone floor divider at top ---
        this.ctx.fillStyle = 'rgba(255,255,255,0.18)';
        this.ctx.fillRect(bx, by, bw, 4);

        // --- Bottom ledge/balcony rail ---
        this.ctx.fillStyle = 'rgba(0,0,0,0.25)';
        this.ctx.fillRect(bx, by + bh - 5, bw, 5);

        // --- Windows ---
        const winW = 14;
        const winH = bh * 0.45;
        const winY = by + bh * 0.18;
        const gap = 22;
        const startX = bx + 10;
        const endX = bx + bw - 10 - winW;

        for (let wx = startX; wx <= endX; wx += winW + gap) {
            const winColorIdx = Math.floor((wx - bx) / (winW + gap)) % theme.windows.length;
            const winColor = theme.windows[winColorIdx];

            // Window frame (slightly darker)
            this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
            this.ctx.fillRect(wx - 1, winY - 1, winW + 2, winH + 2);

            // Window glass
            this.ctx.fillStyle = winColor;
            if (theme.windowGlow) {
                this.ctx.shadowColor = winColor;
                this.ctx.shadowBlur = 8;
            }
            this.ctx.globalAlpha = 0.85;
            this.ctx.fillRect(wx, winY, winW, winH);
            this.ctx.globalAlpha = 1.0;
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;

            // Window shine (top-left glint)
            this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
            this.ctx.fillRect(wx + 1, winY + 1, winW * 0.4, winH * 0.3);
        }

        // --- Trim / accent stripe ---
        this.ctx.fillStyle = theme.trim;
        this.ctx.globalAlpha = 0.35;
        this.ctx.fillRect(bx, by + bh * 0.88, bw, 3);
        this.ctx.globalAlpha = 1.0;
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.onload = () => {
    new Game();
};
