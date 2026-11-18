window.BackroomsEngine = (function () {
    let state = 'DISCLAIMER';
    let scene, camera, renderer, clock;
    let playerModel = null;
    const bones = {};
    let isSprinting = false;
    let isCrouching = false;
    let playerHeight = 1.68;
    let stamina = 100;

    let waterHandGroup = null;
    let drinkAnimTimer = 0;
    let climbData = null;

    let audioCtx = null;
    let humGain = null;

    const moveVec = { x: 0, z: 0 };
    let yaw = 0;
    let pitch = 0;

    const colliders = [];
    const interactables = [];
    let currentTarget = null;

    const inventory = {
        hand: null,
        pocket0: null,
        pocket1: null,
        bag: new Array(9).fill(null)
    };
    let selectedSlotKey = 'hand';

    let killerMonster = null;
    let deathTimer = 0;

    const DB_URL = atob('aHR0cHM6Ly92cmdhbWVwLTc5ZGMwLWRlZmF1bHQtcnRkYi5maXJlYmFzZWlvLmNvbQ==');
    const playerId = 'agent_' + Math.floor(1000 + Math.random() * 9000);
    const playerName = 'Agent_' + playerId.slice(-2);
    let roomCode = '3953';
    const remotePlayers = {};
    let syncInterval = null;
    let chatHideTimeout = null;
    let lastChatTs = Date.now();

    function init() {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;

        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        renderer.shadowMap.enabled = false;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x262211);
        scene.fog = new THREE.FogExp2(0x262211, 0.045);

        camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 90);
        scene.add(camera);

        clock = new THREE.Clock();

        const hemiLight = new THREE.HemisphereLight(0xfff5cc, 0x8a7d4b, 0.9);
        scene.add(hemiLight);

        const ambLight = new THREE.AmbientLight(0xfff2bd, 0.35);
        scene.add(ambLight);

        const nameTag = document.getElementById('menu-agent-name');
        if (nameTag) nameTag.textContent = playerName;

        loadPlayerGLB('./backrooms_hazmat.glb');
        createWaterHand();
        setupUIEvents();
        setupTouchControls();
        renderInventoryUI();

        window.addEventListener('resize', onResize);
        animate();
    }
    function initLampHum() {
        if (audioCtx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            humGain = audioCtx.createGain();

            osc1.type = 'sawtooth';
            osc1.frequency.value = 60;
            osc2.type = 'sine';
            osc2.frequency.value = 120;

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 210;

            humGain.gain.value = 0.04;
            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(humGain);
            humGain.connect(audioCtx.destination);

            osc1.start();
            osc2.start();
        } catch (e) {}
    }

    function createCeilingTileTexture(rx, ry) {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#b5ad7e';
        ctx.fillRect(0, 0, 256, 256);

        for (let i = 0; i < 1500; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
        }

        ctx.strokeStyle = '#5c563a';
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, 256, 256);
        ctx.beginPath();
        ctx.moveTo(128, 0);
        ctx.lineTo(128, 256);
        ctx.moveTo(0, 128);
        ctx.lineTo(256, 128);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(rx, ry);
        return tex;
    }

    function loadPlayerGLB(url) {
        if (typeof THREE.GLTFLoader === 'undefined') {
            createFallbackHands();
            return;
        }
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            (gltf) => {
                playerModel = gltf.scene;
                playerModel.traverse((obj) => {
                    if (obj.isMesh) {
                        obj.frustumCulled = false;
                        if (obj.material) obj.material.side = THREE.DoubleSide;
                    }
                    if (obj.isBone) bones[obj.name] = obj;
                });
                scene.add(playerModel);
                updateModelAttachment();
            },
            undefined,
            () => createFallbackHands()
        );
    }
    function createFallbackHands() {
        const group = new THREE.Group();
        const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xd9b326 });
        const gloveMat = new THREE.MeshLambertMaterial({ color: 0x1a1d21 });

        ['left', 'right'].forEach((side, idx) => {
            const arm = new THREE.Group();
            const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.48), sleeveMat);
            const glove = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.17), gloveMat);
            glove.position.z = -0.3;
            arm.add(sleeve, glove);
            arm.position.set(idx === 0 ? -0.25 : 0.25, -0.26, -0.36);
            arm.name = side + 'ArmFallback';
            group.add(arm);
        });

        playerModel = group;
        playerModel.visible = false;
        camera.add(playerModel);
    }

    function createWaterHand() {
        waterHandGroup = new THREE.Group();

        const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xd9b326 });
        const gloveMat = new THREE.MeshLambertMaterial({ color: 0x1a1d21 });
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), sleeveMat);
        arm.position.set(0, -0.04, 0.18);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.12), gloveMat);
        hand.position.set(0, -0.02, -0.04);

        const bottleMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
        const capMat = new THREE.MeshLambertMaterial({ color: 0xe5e7eb });
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10), bottleMat);
        bottle.position.set(0, 0.06, -0.05);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 8), capMat);
        cap.position.set(0, 0.18, -0.05);

        waterHandGroup.add(arm, hand, bottle, cap);
        waterHandGroup.position.set(0.28, -0.26, -0.42);
        waterHandGroup.visible = false;
        camera.add(waterHandGroup);
    }

    function updateWaterHand(dt, t) {
        if (!waterHandGroup) return;
        const hasWater = hasItem('almond_water') && state === 'PLAYING' && !isSprinting;

        if (drinkAnimTimer > 0) {
            drinkAnimTimer -= dt;
            waterHandGroup.visible = true;
            waterHandGroup.position.set(0.14, -0.1, -0.32);
            waterHandGroup.rotation.x = 0.85;
            if (drinkAnimTimer <= 0) {
                waterHandGroup.rotation.x = 0;
                waterHandGroup.position.set(0.28, -0.26, -0.42);
                removeItem('almond_water');
                stamina = 100;
            }
            return;
        }

        waterHandGroup.visible = hasWater;
        if (hasWater) {
            waterHandGroup.position.y = -0.26 + Math.sin(t * 2.5) * 0.008;
        }
    }
    function updateModelAttachment() {
        if (!playerModel) return;

        if (state === 'UNIFORM') {
            camera.remove(playerModel);
            scene.add(playerModel);
            playerModel.visible = true;
            const menuPos = (window.Level0 && window.Level0.getMenuCameraPos)
                ? window.Level0.getMenuCameraPos()
                : new THREE.Vector3(0, 1.65, 4);
            playerModel.position.set(menuPos.x, 0, menuPos.z - 2.3);
            playerModel.rotation.set(0, 0, 0);
            if (bones['Head']) bones['Head'].scale.set(1, 1, 1);
            if (bones['Spine']) bones['Spine'].scale.set(1, 1, 1);
        } else {
            scene.remove(playerModel);
            camera.add(playerModel);
            playerModel.position.set(0, -1.46, -0.08);
            playerModel.rotation.set(0.15, Math.PI, 0);
            if (bones['Head']) bones['Head'].scale.set(0.001, 0.001, 0.001);
            playerModel.visible = false;
        }
    }

    function loadTexture(path, rx, ry) {
        const loader = new THREE.TextureLoader();
        const tex = loader.load(path);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(rx, ry);
        return tex;
    }

    function addBox(x, y, z, w, h, d, material, hasCollision = true) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        scene.add(mesh);

        if (hasCollision) {
            const box = new THREE.Box3().setFromCenterAndSize(
                new THREE.Vector3(x, y, z),
                new THREE.Vector3(w + 0.45, h, d + 0.45)
            );
            colliders.push(box);
        }
        return mesh;
    }
    function addItem(item) {
        for (let i = 0; i < 9; i++) {
            if (!inventory.bag[i]) {
                inventory.bag[i] = item;
                renderInventoryUI();
                updateDrinkButton();
                return true;
            }
        }
        return false;
    }

    function hasItem(id) {
        if (inventory.hand && inventory.hand.id === id) return true;
        if (inventory.pocket0 && inventory.pocket0.id === id) return true;
        if (inventory.pocket1 && inventory.pocket1.id === id) return true;
        return inventory.bag.some(it => it && it.id === id);
    }

    function removeItem(id) {
        if (inventory.hand && inventory.hand.id === id) {
            inventory.hand = null;
            renderInventoryUI();
            updateDrinkButton();
            return;
        }
        if (inventory.pocket0 && inventory.pocket0.id === id) {
            inventory.pocket0 = null;
            renderInventoryUI();
            updateDrinkButton();
            return;
        }
        if (inventory.pocket1 && inventory.pocket1.id === id) {
            inventory.pocket1 = null;
            renderInventoryUI();
            updateDrinkButton();
            return;
        }
        const idx = inventory.bag.findIndex(it => it && it.id === id);
        if (idx !== -1) {
            inventory.bag[idx] = null;
            renderInventoryUI();
            updateDrinkButton();
        }
    }

    function updateDrinkButton() {
        const drinkBtn = document.getElementById('btn-drink');
        if (!drinkBtn) return;
        drinkBtn.style.display = hasItem('almond_water') ? 'flex' : 'none';
    }

    function drinkAlmondWater() {
        if (!hasItem('almond_water') || drinkAnimTimer > 0) return;
        drinkAnimTimer = 0.9;
    }

    function getSlotItem(key) {
        if (key.startsWith('bag')) {
            return inventory.bag[parseInt(key.replace('bag', ''), 10)];
        }
        return inventory[key];
    }

    function selectSlot(key) {
        selectedSlotKey = key;
        renderInventoryUI();
    }

    function renderInventoryUI() {
        const bagGrid = document.getElementById('backpack-grid');
        if (!bagGrid) return;

        bagGrid.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot' + (selectedSlotKey === 'bag' + i ? ' selected' : '');
            slot.dataset.slot = 'bag' + i;
            const item = inventory.bag[i];
            if (item) {
                slot.innerHTML = `<div>${item.icon}</div><div style="font-size:9px">${item.name}</div>`;
            }
            slot.onclick = () => selectSlot('bag' + i);
            bagGrid.appendChild(slot);
        }

        ['hand', 'pocket0', 'pocket1'].forEach((key) => {
            const el = document.querySelector(`.inv-slot[data-slot="${key}"]`);
            if (!el) return;
            el.className = 'inv-slot' + (selectedSlotKey === key ? ' selected' : '');
            const item = inventory[key];
            el.innerHTML = item ? `<div>${item.icon}</div><div style="font-size:9px">${item.name}</div>` : '';
            el.onclick = () => selectSlot(key);
        });

        const currentItem = getSlotItem(selectedSlotKey);
        const iconEl = document.getElementById('inspect-icon');
        const titleEl = document.getElementById('inspect-title');
        const descEl = document.getElementById('inspect-desc');

        if (iconEl) iconEl.textContent = currentItem ? currentItem.icon : '?';
        if (titleEl) titleEl.textContent = currentItem ? currentItem.name : 'ПУСТО';
        if (descEl) descEl.textContent = currentItem ? currentItem.desc : 'Выберите ячейку.';
    }
    function addChatMessage(sender, text) {
        const log = document.getElementById('hud-chat-log');
        if (!log) return;
        log.style.opacity = '1';
        const line = document.createElement('div');
        line.innerHTML = `<b>[${sender}]:</b> ${text}`;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;

        clearTimeout(chatHideTimeout);
        chatHideTimeout = setTimeout(() => {
            const inputRow = document.getElementById('hud-chat-input-row');
            if (!inputRow || inputRow.style.display === 'none') {
                log.style.opacity = '0.25';
            }
        }, 6000);
    }

    function createNameTagSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
        ctx.fillRect(16, 12, 224, 40);
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 3;
        ctx.strokeRect(16, 12, 224, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 33);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(1.5, 0.38, 1);
        sprite.position.y = 2.05;
        return sprite;
    }

    let worldPromptSprite = null;
    let worldPromptCanvas = null;
    let lastPromptTitle = '';

    function updateWorldPromptSprite(targetItem) {
        if (!worldPromptSprite) {
            worldPromptCanvas = document.createElement('canvas');
            worldPromptCanvas.width = 512;
            worldPromptCanvas.height = 160;
            const tex = new THREE.CanvasTexture(worldPromptCanvas);
            const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
            worldPromptSprite = new THREE.Sprite(mat);
            worldPromptSprite.scale.set(1.15, 0.36, 1);
            worldPromptSprite.renderOrder = 999;
            scene.add(worldPromptSprite);
        }

        if (!targetItem) {
            worldPromptSprite.visible = false;
            lastPromptTitle = '';
            return;
        }

        worldPromptSprite.visible = true;
        worldPromptSprite.position.copy(targetItem.pos).add(new THREE.Vector3(0, 0.28, 0));

        if (lastPromptTitle !== targetItem.name) {
            lastPromptTitle = targetItem.name;
            const ctx = worldPromptCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 512, 160);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, 506, 154);

            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 38px sans-serif';
            ctx.fillText(targetItem.name, 256, 56);

            ctx.font = '700 30px sans-serif';
            ctx.fillText('Нажмите F', 256, 114);

            worldPromptSprite.material.map.needsUpdate = true;
        }
    }
    function startMultiplayerSync() {
        if (syncInterval) clearInterval(syncInterval);

        const syncTick = async () => {
            if (state !== 'LOBBY' && state !== 'PLAYING' && state !== 'INVENTORY' && state !== 'CLIMBING') return;
            try {
                await fetch(`${DB_URL}/rooms/${roomCode}/players/${playerId}.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: playerName,
                        state: state,
                        x: Number(camera.position.x.toFixed(2)),
                        y: Number(camera.position.y.toFixed(2)),
                        z: Number(camera.position.z.toFixed(2)),
                        yaw: Number(yaw.toFixed(2)),
                        ts: Date.now()
                    })
                });

                const res = await fetch(`${DB_URL}/rooms/${roomCode}/players.json`);
                const data = await res.json();
                if (data) {
                    const activePlayers = [];
                    Object.keys(data).forEach((id) => {
                        const p = data[id];
                        if (!p || Date.now() - p.ts > 12000) {
                            if (remotePlayers[id]) {
                                scene.remove(remotePlayers[id]);
                                delete remotePlayers[id];
                            }
                            return;
                        }
                        activePlayers.push({ id, ...p });
                        if (id !== playerId && (p.state === 'PLAYING' || p.state === 'INVENTORY' || p.state === 'CLIMBING')) {
                            updateRemotePlayerMesh(id, p);
                        }
                    });
                    renderLobbyPlayers(activePlayers);
                }

                const chatRes = await fetch(`${DB_URL}/rooms/${roomCode}/chat.json`);
                const chatData = await chatRes.json();
                if (chatData) {
                    Object.values(chatData).forEach((msg) => {
                        if (msg.ts > lastChatTs && msg.sender !== playerName) {
                            lastChatTs = msg.ts;
                            addChatMessage(msg.sender, msg.text);
                            const lobbyChat = document.getElementById('lobby-chat');
                            if (lobbyChat) {
                                lobbyChat.innerHTML += `<br><b>${msg.sender}:</b> ${msg.text}`;
                                lobbyChat.scrollTop = lobbyChat.scrollHeight;
                            }
                        }
                    });
                }
            } catch (e) {}
        };

        syncTick();
        syncInterval = setInterval(syncTick, 700);
    }

    function renderLobbyPlayers(players) {
        const listEl = document.getElementById('lobby-players-list');
        if (!listEl) return;
        let html = `<div style="font-size:11px; color:#9ca3af; margin-bottom:10px;">УЧАСТНИКИ ГРУППЫ (${players.length}/4)</div>`;
        players.forEach((p) => {
            const isMe = p.id === playerId ? ' (Вы)' : '';
            html += `<div class="slot-item"><span>${p.name}${isMe}</span><span class="slot-ready">ГОТОВ</span></div>`;
        });
        for (let i = players.length; i < 4; i++) {
            html += `<div class="slot-item" style="opacity:0.4"><span>Пустой слот #${i + 1}</span><span>Ожидание...</span></div>`;
        }
        listEl.innerHTML = html;
    }

    function updateRemotePlayerMesh(id, p) {
        if (!remotePlayers[id]) {
            const group = new THREE.Group();
            const suitMat = new THREE.MeshLambertMaterial({ color: 0xeab308 });
            const visorMat = new THREE.MeshLambertMaterial({ color: 0x111827 });

            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.35, 10), suitMat);
            body.position.y = 0.7;
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), suitMat);
            head.position.y = 1.55;
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.12), visorMat);
            visor.position.set(0, 1.56, 0.2);

            const nameSprite = createNameTagSprite(p.name || 'Agent');
            group.add(body, head, visor, nameSprite);

            scene.add(group);
            remotePlayers[id] = group;
        }
        remotePlayers[id].position.lerp(new THREE.Vector3(p.x, p.y - 1.68, p.z), 0.5);
        remotePlayers[id].rotation.y = p.yaw + Math.PI;
    }

    function sendNetworkChat(text) {
        if (!text.trim()) return;
        addChatMessage(playerName, text);
        fetch(`${DB_URL}/rooms/${roomCode}/chat.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: playerName, text: text, ts: Date.now() })
        }).catch(() => {});
    }
    function showScreen(id) {
        const screens = [
            'screen-disclaimer', 'screen-menu', 'screen-uniform',
            'screen-expedition', 'screen-lobby', 'screen-hud',
            'screen-inventory', 'screen-meg-lost'
        ];
        screens.forEach((s) => {
            const el = document.getElementById(s);
            if (el) el.style.display = 'none';
        });
        const target = document.getElementById(id);
        if (target) {
            const flexList = ['screen-expedition', 'screen-lobby', 'screen-inventory', 'screen-disclaimer', 'screen-meg-lost'];
            target.style.display = flexList.includes(id) ? 'flex' : 'block';
        }
    }

    function bindClick(id, fn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    }

    function setupUIEvents() {
        bindClick('screen-disclaimer', () => {
            initLampHum();
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
        });

        bindClick('btn-to-uniform', () => {
            initLampHum();
            state = 'UNIFORM';
            showScreen('screen-uniform');
            const menuPos = (window.Level0 && window.Level0.getMenuCameraPos)
                ? window.Level0.getMenuCameraPos()
                : new THREE.Vector3(0, 1.65, 4);
            camera.position.set(menuPos.x, 1.35, menuPos.z);
            camera.rotation.set(0, 0, 0);
            updateModelAttachment();
        });

        bindClick('btn-uniform-back', () => {
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
        });

        bindClick('btn-to-expedition', () => {
            initLampHum();
            showScreen('screen-expedition');
        });
        bindClick('btn-exp-back', () => showScreen('screen-menu'));

        bindClick('btn-select-story', () => {
            roomCode = String(Math.floor(1000 + Math.random() * 9000));
            const codeEl = document.getElementById('invite-code-val');
            if (codeEl) codeEl.textContent = roomCode;
            state = 'LOBBY';
            showScreen('screen-lobby');
            startMultiplayerSync();
        });

        bindClick('btn-join-code', () => {
            const inp = document.getElementById('join-code-input');
            if (inp && inp.value.trim().length === 4) {
                roomCode = inp.value.trim();
                const codeEl = document.getElementById('invite-code-val');
                if (codeEl) codeEl.textContent = roomCode;
            }
            state = 'LOBBY';
            showScreen('screen-lobby');
            startMultiplayerSync();
        });

        bindClick('btn-lobby-back', () => {
            state = 'MENU';
            showScreen('screen-expedition');
        });

        bindClick('btn-lobby-send', () => {
            const inp = document.getElementById('lobby-chat-input');
            const chat = document.getElementById('lobby-chat');
            if (inp && chat && inp.value.trim()) {
                sendNetworkChat(inp.value.trim());
                chat.innerHTML += `<br><b>${playerName}:</b> ${inp.value}`;
                inp.value = '';
                chat.scrollTop = chat.scrollHeight;
            }
        });

        bindClick('btn-start-game', () => {
            initLampHum();
            state = 'PLAYING';
            showScreen('screen-hud');
            updateModelAttachment();
            startMultiplayerSync();
            if (window.Level0 && window.Level0.startGameplay) {
                window.Level0.startGameplay();
            }
        });

        bindClick('btn-hud-menu', () => {
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
        });

        bindClick('btn-toggle-chat', () => {
            const row = document.getElementById('hud-chat-input-row');
            const log = document.getElementById('hud-chat-log');
            if (!row) return;
            const opened = row.style.display === 'flex';
            row.style.display = opened ? 'none' : 'flex';
            if (log) log.style.opacity = '1';
        });

        bindClick('btn-hud-chat-send', () => {
            const inp = document.getElementById('hud-chat-input');
            if (inp && inp.value.trim()) {
                sendNetworkChat(inp.value.trim());
                inp.value = '';
            }
        });

        const btnSprint = document.getElementById('btn-sprint');
        if (btnSprint) {
            btnSprint.addEventListener('touchstart', (e) => {
                e.preventDefault();
                isSprinting = true;
                btnSprint.classList.add('active');
            });
            btnSprint.addEventListener('touchend', () => {
                isSprinting = false;
                btnSprint.classList.remove('active');
            });
            btnSprint.addEventListener('mousedown', () => {
                isSprinting = !isSprinting;
                btnSprint.classList.toggle('active', isSprinting);
            });
        }

        const btnCrouch = document.getElementById('btn-crouch');
        if (btnCrouch) {
            btnCrouch.addEventListener('click', () => {
                isCrouching = !isCrouching;
                btnCrouch.classList.toggle('active', isCrouching);
            });
        }

        bindClick('btn-inv', () => {
            state = 'INVENTORY';
            renderInventoryUI();
            showScreen('screen-inventory');
        });

        bindClick('btn-close-inv', () => {
            state = 'PLAYING';
            showScreen('screen-hud');
        });

        bindClick('btn-equip-hand', () => {
            if (selectedSlotKey.startsWith('bag')) {
                const idx = parseInt(selectedSlotKey.replace('bag', ''), 10);
                const temp = inventory.hand;
                inventory.hand = inventory.bag[idx];
                inventory.bag[idx] = temp;
                selectedSlotKey = 'hand';
                renderInventoryUI();
            }
        });

        bindClick('btn-f', triggerInteraction);
        bindClick('btn-drink', drinkAlmondWater);
    }
    function triggerInteraction() {
        if (currentTarget && currentTarget.active) {
            currentTarget.onInteract();
            updateCrosshairTarget();
        }
    }

    function setupTouchControls() {
        const joyZone = document.getElementById('joystick-zone');
        const joyKnob = document.getElementById('joystick-knob');
        let joyTouchId = null;
        const maxDist = 38;

        if (joyZone && joyKnob) {
            joyZone.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (e.changedTouches.length > 0) {
                    const t = e.changedTouches;
                    joyTouchId = t.identifier;
                    updateJoystick(t);
                }
            });

            joyZone.addEventListener('touchmove', (e) => {
                e.preventDefault();
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches[i];
                    if (t.identifier === joyTouchId) updateJoystick(t);
                }
            });

            const endJoy = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    if (e.changedTouches[i].identifier === joyTouchId) {
                        joyTouchId = null;
                        moveVec.x = 0;
                        moveVec.z = 0;
                        joyKnob.style.transform = 'translate(0px, 0px)';
                    }
                }
            };
            joyZone.addEventListener('touchend', endJoy);
            joyZone.addEventListener('touchcancel', endJoy);
        }

        function updateJoystick(touch) {
            const rect = joyZone.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            let dx = touch.clientX - cx;
            let dy = touch.clientY - cy;
            const dist = Math.hypot(dx, dy);
            if (dist > maxDist) {
                dx = (dx / dist) * maxDist;
                dy = (dy / dist) * maxDist;
            }
            joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
            moveVec.x = dx / maxDist;
            moveVec.z = dy / maxDist;
        }

        let lookTouchId = null;
        let lastX = 0;
        let lastY = 0;
        const canvas = document.getElementById('game-canvas');

        canvas.addEventListener('touchstart', (e) => {
            if (e.changedTouches.length > 0) {
                const t = e.changedTouches;
                lookTouchId = t.identifier;
                lastX = t.clientX;
                lastY = t.clientY;
            }
        });

        canvas.addEventListener('touchmove', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === lookTouchId) {
                    const dx = t.clientX - lastX;
                    const dy = t.clientY - lastY;
                    lastX = t.clientX;
                    lastY = t.clientY;

                    if (state === 'UNIFORM' && playerModel) {
                        playerModel.rotation.y += dx * 0.012;
                    } else if (state === 'PLAYING') {
                        yaw -= dx * 0.0045;
                        pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * 0.0045));
                    }
                }
            }
        });

        canvas.addEventListener('touchend', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
            }
        });

        const keys = {};
        window.addEventListener('keydown', (e) => {
            keys[e.code] = true;
            if (e.code === 'ShiftLeft') isSprinting = true;
            if (e.code === 'KeyC') isCrouching = !isCrouching;
            if (e.code === 'KeyF' || e.code === 'KeyE') triggerInteraction();
            updateKeyboardMove();
        });
        window.addEventListener('keyup', (e) => {
            keys[e.code] = false;
            if (e.code === 'ShiftLeft') isSprinting = false;
            updateKeyboardMove();
        });

        function updateKeyboardMove() {
            moveVec.z = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
            moveVec.x = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
        }
    }

    function updateCrosshairTarget() {
        const crosshair = document.getElementById('crosshair');
        const btnF = document.getElementById('btn-f');

        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);

        let best = null;
        let bestDot = 0.92;

        for (let i = 0; i < interactables.length; i++) {
            const item = interactables[i];
            if (!item.active) continue;
            const toItem = item.pos.clone().sub(camera.position);
            const dist = toItem.length();
            if (dist > (item.radius || 3.2)) continue;

            toItem.normalize();
            const dot = camDir.dot(toItem);
            if (dot > bestDot) {
                bestDot = dot;
                best = item;
            }
        }

        currentTarget = best;
        updateWorldPromptSprite(best);

        if (crosshair && btnF) {
            if (best) {
                crosshair.classList.add('targeted');
                btnF.style.display = 'flex';
            } else {
                crosshair.classList.remove('targeted');
                btnF.style.display = 'none';
            }
        }
    }

    function startClimbAnimation(basePos, topPos, onGrabKey, onComplete) {
        state = 'CLIMBING';
        isSprinting = false;
        updateWorldPromptSprite(null);
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.classList.remove('targeted');

        climbData = {
            timer: 0,
            duration: 2.6,
            startPos: basePos.clone(),
            topPos: topPos.clone(),
            grabbed: false,
            onGrabKey,
            onComplete
        };
    }

    function updateClimbAnimation(dt) {
        if (!climbData) return;
        climbData.timer += dt;
        const p = Math.min(1, climbData.timer / climbData.duration);

        camera.rotation.order = 'YXZ';
        yaw += (0 - yaw) * 8 * dt;
        pitch += (-0.12 - pitch) * 8 * dt;
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;

        if (p < 0.45) {
            const t = p / 0.45;
            camera.position.lerpVectors(climbData.startPos, climbData.topPos, t);
            camera.position.x += Math.sin(t * Math.PI * 6) * 0.05;
            updateSprintHands(true, climbData.timer * 1.1);
        } else if (p < 0.65) {
            camera.position.copy(climbData.topPos);
            updateSprintHands(false, 0);
            if (!climbData.grabbed) {
                climbData.grabbed = true;
                if (climbData.onGrabKey) climbData.onGrabKey();
            }
        } else {
            const t = (p - 0.65) / 0.35;
            camera.position.lerpVectors(climbData.topPos, climbData.startPos, t);
            camera.position.x += Math.sin(t * Math.PI * 5) * 0.04;
            updateSprintHands(true, climbData.timer * 1.1);
        }

        if (p >= 1) {
            updateSprintHands(false, 0);
            const done = climbData.onComplete;
            climbData = null;
            state = 'PLAYING';
            if (done) done();
        }
    }
    function updatePlayerMovement(dt) {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;

        const targetH = isCrouching ? 0.85 : 1.68;
        playerHeight += (targetH - playerHeight) * 10 * dt;
        camera.position.y = playerHeight;

        const moving = Math.hypot(moveVec.x, moveVec.z) > 0.05;
        const canSprint = moving && isSprinting && !isCrouching && stamina > 2;
        if (canSprint) {
            stamina = Math.max(0, stamina - 16 * dt);
        } else {
            stamina = Math.min(100, stamina + 10 * dt);
        }

        const speed = (isCrouching ? 2.1 : (canSprint ? 6.4 : 3.5)) * dt;

        if (moving) {
            const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
            const step = new THREE.Vector3()
                .addScaledVector(forward, -moveVec.z * speed)
                .addScaledVector(right, moveVec.x * speed);

            const nextX = camera.position.clone();
            nextX.x += step.x;
            if (!checkCollision(nextX)) camera.position.x = nextX.x;

            const nextZ = camera.position.clone();
            nextZ.z += step.z;
            if (!checkCollision(nextZ)) camera.position.z = nextZ.z;
        }

        updateSprintHands(canSprint, clock.getElapsedTime());
        updateWaterHand(dt, clock.getElapsedTime());
        updateCrosshairTarget();
    }

    function updateSprintHands(activeSprint, t) {
        if (!playerModel || (state !== 'PLAYING' && state !== 'CLIMBING')) return;

        if (!activeSprint) {
            playerModel.visible = false;
            return;
        }

        playerModel.visible = true;
        const swing = Math.sin(t * 14);

        if (bones['LeftArm'] && bones['RightArm']) {
            playerModel.position.set(0, -1.28 + Math.abs(Math.cos(t * 14)) * 0.04, -0.22);
            bones['LeftArm'].rotation.set(-1.35 + swing * 0.45, 0.15, -0.2);
            bones['RightArm'].rotation.set(-1.35 - swing * 0.45, -0.15, 0.2);
            if (bones['LeftForeArm']) bones['LeftForeArm'].rotation.x = -0.7 + Math.max(0, swing) * 0.35;
            if (bones['RightForeArm']) bones['RightForeArm'].rotation.x = -0.7 + Math.max(0, -swing) * 0.35;
        } else {
            const lArm = playerModel.getObjectByName('leftArmFallback');
            const rArm = playerModel.getObjectByName('rightArmFallback');
            if (lArm && rArm) {
                lArm.position.z = -0.36 + swing * 0.14;
                lArm.position.y = -0.22 + Math.abs(swing) * 0.05;
                rArm.position.z = -0.36 - swing * 0.14;
                rArm.position.y = -0.22 + Math.abs(swing) * 0.05;
            }
        }
    }

    function triggerMonsterDeath(monsterObj) {
        if (state === 'DYING' || state === 'DEAD') return;
        state = 'DYING';
        killerMonster = monsterObj;
        deathTimer = 0;
        if (playerModel) playerModel.visible = false;
        if (waterHandGroup) waterHandGroup.visible = false;
        updateWorldPromptSprite(null);
        showScreen('screen-hud');
    }

    function updateDeathSequence(dt, elapsed) {
        deathTimer += dt;
        if (killerMonster) {
            const targetLook = killerMonster.position.clone().add(new THREE.Vector3(0, 1.55, 0));
            camera.lookAt(targetLook);
            camera.rotation.z = Math.sin(elapsed * 45) * 0.18;
            camera.position.y = 1.45 - Math.min(0.8, deathTimer * 0.45) + Math.sin(elapsed * 60) * 0.06;

            const toCam = camera.position.clone().sub(killerMonster.position).setY(0).normalize();
            killerMonster.position.addScaledVector(toCam, 1.2 * dt);
        }

        if (deathTimer >= 2.2) {
            state = 'DEAD';
            const timerEl = document.getElementById('vhs-timer');
            if (timerEl) {
                const sec = Math.floor(elapsed) % 60;
                const min = Math.floor(elapsed / 60) % 60;
                timerEl.textContent = `00:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            }
            showScreen('screen-meg-lost');
        }
    }

    function checkCollision(pos) {
        for (let i = 0; i < colliders.length; i++) {
            if (colliders[i].containsPoint(pos)) return true;
        }
        return false;
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.1);
        const elapsed = clock.getElapsedTime();

        if (state === 'DISCLAIMER' || state === 'MENU') {
            const menuPos = (window.Level0 && window.Level0.getMenuCameraPos)
                ? window.Level0.getMenuCameraPos()
                : new THREE.Vector3(0, 1.65, 4);

            camera.position.set(
                menuPos.x + Math.sin(elapsed * 0.55) * 0.16,
                menuPos.y + Math.sin(elapsed * 1.1) * 0.035,
                menuPos.z + Math.cos(elapsed * 0.45) * 0.14
            );
            camera.rotation.order = 'YXZ';
            camera.rotation.set(
                Math.sin(elapsed * 0.4) * 0.015,
                Math.sin(elapsed * 0.3) * 0.05,
                Math.sin(elapsed * 0.5) * 0.012
            );
        } else if (state === 'PLAYING') {
            updatePlayerMovement(dt);
            if (window.Level0 && window.Level0.update) {
                window.Level0.update(dt, elapsed, camera.position);
            }
        } else if (state === 'CLIMBING') {
            updateClimbAnimation(dt);
        } else if (state === 'DYING') {
            updateDeathSequence(dt, elapsed);
        }

        renderer.render(scene, camera);
    }

    window.addEventListener('DOMContentLoaded', init);

    return {
        getScene: () => scene,
        getCamera: () => camera,
        loadTexture,
        createCeilingTileTexture,
        addBox,
        colliders,
        interactables,
        addItem,
        hasItem,
        removeItem,
        addChatMessage,
        startClimbAnimation,
        triggerMonsterDeath,
        setPlayerPos: (x, y, z, newYaw = 0) => {
            camera.position.set(x, y, z);
            yaw = newYaw;
            pitch = 0;
        },
        isCrouching: () => isCrouching
    };
})();
