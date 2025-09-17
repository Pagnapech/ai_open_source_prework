// Game client for Mini MMORPG
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.websocket = null;
        this.myPlayerId = null;
        this.players = {};
        this.avatars = {};
        this.avatarImages = {}; // Cached avatar images
        this.viewport = { x: 0, y: 0 };
        
        // Movement state
        this.keysPressed = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        this.gameLoop = null;
        this.lastMoveTime = 0;
        this.moveInterval = 100; // Send move command every 100ms
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.connectToServer();
        this.setupEventListeners();
        this.startGameLoop();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.render();
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            console.log('World map loaded successfully');
            this.render();
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map');
        };
        this.worldImage.src = 'world.jpg';
    }
    
    connectToServer() {
        try {
            this.updateConnectionStatus('connecting');
            this.websocket = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.websocket.onopen = () => {
                console.log('Connected to game server');
                this.updateConnectionStatus('connected');
                this.joinGame();
            };
            
            this.websocket.onmessage = (event) => {
                this.handleServerMessage(JSON.parse(event.data));
            };
            
            this.websocket.onclose = () => {
                console.log('Disconnected from game server');
                this.updateConnectionStatus('disconnected');
                // Attempt to reconnect after 3 seconds
                setTimeout(() => this.connectToServer(), 3000);
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('disconnected');
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
            this.updateConnectionStatus('disconnected');
        }
    }
    
    joinGame() {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            const message = {
                action: 'join_game',
                username: 'Pech'
            };
            this.websocket.send(JSON.stringify(message));
            console.log('Sent join game message');
        }
    }
    
    handleServerMessage(data) {
        console.log('Received server message:', data);
        
        switch (data.action) {
            case 'join_game':
                if (data.success) {
                    this.myPlayerId = data.playerId;
                    this.players = data.players;
                    this.avatars = data.avatars;
                    this.loadAvatars();
                    this.centerViewportOnPlayer();
                    this.updatePlayerCount();
                    console.log('Successfully joined game as player:', this.myPlayerId);
                } else {
                    console.error('Failed to join game:', data.error);
                }
                break;
                
            case 'players_moved':
                this.players = { ...this.players, ...data.players };
                this.centerViewportOnPlayer();
                this.render();
                break;
                
            case 'player_joined':
                this.players[data.player.id] = data.player;
                this.avatars[data.avatar.name] = data.avatar;
                this.loadAvatar(data.avatar);
                this.updatePlayerCount();
                this.render();
                break;
                
            case 'player_left':
                delete this.players[data.playerId];
                this.updatePlayerCount();
                this.render();
                break;
        }
    }
    
    loadAvatars() {
        for (const avatarName in this.avatars) {
            this.loadAvatar(this.avatars[avatarName]);
        }
    }
    
    loadAvatar(avatar) {
        const avatarName = avatar.name;
        this.avatarImages[avatarName] = {};
        
        for (const direction in avatar.frames) {
            this.avatarImages[avatarName][direction] = [];
            
            avatar.frames[direction].forEach((base64Data, index) => {
                const img = new Image();
                img.onload = () => {
                    this.avatarImages[avatarName][direction][index] = img;
                    this.render(); // Re-render when avatar loads
                };
                img.src = base64Data;
            });
        }
    }
    
    centerViewportOnPlayer() {
        if (!this.myPlayerId || !this.players[this.myPlayerId]) return;
        
        const myPlayer = this.players[this.myPlayerId];
        const screenCenterX = this.canvas.width / 2;
        const screenCenterY = this.canvas.height / 2;
        
        // Calculate viewport offset to center player on screen
        this.viewport.x = myPlayer.x - screenCenterX;
        this.viewport.y = myPlayer.y - screenCenterY;
        
        // Apply boundary constraints to prevent showing beyond map edges
        this.viewport.x = Math.max(0, Math.min(this.viewport.x, this.worldWidth - this.canvas.width));
        this.viewport.y = Math.max(0, Math.min(this.viewport.y, this.worldHeight - this.canvas.height));
    }
    
    render() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the world map with viewport offset
        this.ctx.drawImage(
            this.worldImage,
            this.viewport.x, this.viewport.y, this.canvas.width, this.canvas.height,  // Source rectangle (viewport)
            0, 0, this.canvas.width, this.canvas.height  // Destination rectangle (full canvas)
        );
        
        // Draw all players
        this.drawPlayers();
    }
    
    drawPlayers() {
        for (const playerId in this.players) {
            const player = this.players[playerId];
            this.drawPlayer(player);
        }
    }
    
    drawPlayer(player) {
        // Convert world coordinates to screen coordinates
        const screenX = player.x - this.viewport.x;
        const screenY = player.y - this.viewport.y;
        
        // Only draw if player is visible on screen
        if (screenX < -50 || screenX > this.canvas.width + 50 || 
            screenY < -50 || screenY > this.canvas.height + 50) {
            return;
        }
        
        // Get avatar image
        const avatarName = player.avatar;
        const direction = player.facing;
        const frameIndex = player.animationFrame || 0;
        
        if (this.avatarImages[avatarName] && 
            this.avatarImages[avatarName][direction] && 
            this.avatarImages[avatarName][direction][frameIndex]) {
            
            const avatarImg = this.avatarImages[avatarName][direction][frameIndex];
            
            // Calculate avatar size (maintain aspect ratio)
            const avatarSize = 32; // Base size
            const aspectRatio = avatarImg.width / avatarImg.height;
            const width = avatarSize;
            const height = avatarSize / aspectRatio;
            
            // Draw avatar centered on player position
            const drawX = screenX - width / 2;
            const drawY = screenY - height;
            
            // Handle west direction by flipping horizontally
            if (direction === 'west') {
                this.ctx.save();
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(avatarImg, -drawX - width, drawY, width, height);
                this.ctx.restore();
            } else {
                this.ctx.drawImage(avatarImg, drawX, drawY, width, height);
            }
        }
        
        // Draw username label
        this.drawPlayerLabel(player, screenX, screenY);
    }
    
    drawPlayerLabel(player, screenX, screenY) {
        this.ctx.save();
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        const labelY = screenY - 40; // Position above avatar
        
        // Draw text with outline
        this.ctx.strokeText(player.username, screenX, labelY);
        this.ctx.fillText(player.username, screenX, labelY);
        
        this.ctx.restore();
    }
    
    startGameLoop() {
        const gameLoop = () => {
            this.updateMovement();
            this.render();
            this.gameLoop = requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }
    
    updateMovement() {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
        
        const now = Date.now();
        if (now - this.lastMoveTime < this.moveInterval) return;
        
        let hasMovement = false;
        let direction = null;
        
        // Check for diagonal movement (prioritize first pressed key)
        if (this.keysPressed.up) {
            direction = 'up';
            hasMovement = true;
        } else if (this.keysPressed.down) {
            direction = 'down';
            hasMovement = true;
        } else if (this.keysPressed.left) {
            direction = 'left';
            hasMovement = true;
        } else if (this.keysPressed.right) {
            direction = 'right';
            hasMovement = true;
        }
        
        if (hasMovement) {
            this.sendMovement(direction);
            this.lastMoveTime = now;
        }
    }
    
    sendMovement(direction) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            const message = {
                action: 'move',
                direction: direction
            };
            this.websocket.send(JSON.stringify(message));
        }
    }
    
    sendStop() {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            const message = {
                action: 'stop'
            };
            this.websocket.send(JSON.stringify(message));
        }
    }
    
    sendClickToMove(x, y) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            const message = {
                action: 'move',
                x: Math.round(x),
                y: Math.round(y)
            };
            this.websocket.send(JSON.stringify(message));
            console.log(`Moving to: ${x}, ${y}`);
        }
    }
    
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.className = status;
            statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
    }
    
    updatePlayerCount() {
        const countElement = document.getElementById('player-count');
        if (countElement) {
            const playerCount = Object.keys(this.players).length;
            countElement.textContent = `Players: ${playerCount}`;
        }
    }
    
    setupEventListeners() {
        // Add click-to-move functionality
        this.canvas.addEventListener('click', (event) => {
            if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
            
            const rect = this.canvas.getBoundingClientRect();
            const screenX = event.clientX - rect.left;
            const screenY = event.clientY - rect.top;
            
            // Convert screen coordinates to world coordinates
            const worldX = screenX + this.viewport.x;
            const worldY = screenY + this.viewport.y;
            
            // Send click-to-move command
            this.sendClickToMove(worldX, worldY);
        });
        
        // Add keyboard event listeners for continuous movement
        document.addEventListener('keydown', (event) => {
            if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
            
            let direction = null;
            switch(event.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    direction = 'up';
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    direction = 'down';
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    direction = 'left';
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    direction = 'right';
                    break;
            }
            
            if (direction && !this.keysPressed[direction]) {
                this.keysPressed[direction] = true;
                // Send immediate movement command
                this.sendMovement(direction);
            }
        });
        
        // Stop movement when key is released
        document.addEventListener('keyup', (event) => {
            if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
            
            let direction = null;
            switch(event.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    direction = 'up';
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    direction = 'down';
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    direction = 'left';
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    direction = 'right';
                    break;
            }
            
            if (direction) {
                this.keysPressed[direction] = false;
                // Check if any keys are still pressed
                const anyKeyPressed = Object.values(this.keysPressed).some(pressed => pressed);
                if (!anyKeyPressed) {
                    this.sendStop();
                }
            }
        });
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
