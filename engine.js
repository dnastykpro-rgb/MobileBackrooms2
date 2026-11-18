window.BackroomsEngine = (function () {
    let state = 'DISCLAIMER';
    let platform = 'ANDROID';
    let gfxQuality = 'MED';
    let camSensitivity = 1.0;
    let humVolume = 0.04;

    let scene, camera, renderer, clock;
    let playerModel = null;
    let playerMixer = null;
    let runAction = null;
    let firstPersonHands = null;
    const bones = {};

    let isSprinting = false;
    let isCrouching = false;
    let playerHeight = 1.68;
    let stamina = 100;
    let isExhausted = false;
    let breathTimer = 0;
    let climbData = null;

    let audioCtx = null;
    let humGain = null;
    let lastStepSign = 1;

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

    const DB_URL = ['https://vrgamep-79dc0-default-rtdb.firebaseio.com/'].join('/').replace('firebaseio', '.firebaseio');
    const playerId = 'agent_' + Math.floor(1000 + Math.random() * 9000);
    const playerName = 'Agent_' + playerId.slice(-2);
    let roomCode = '3953';
    const remotePlayers = {};
    let syncInterval = null;
    let chatHideTimeout = null;
    let lastChatTs = Date.now();

    let worldPromptSprite = null;
    let worldPromptCanvas = null;
    let lastPromptTitle = '';

    function init() {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;

        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        applyGraphicsSettings('MED');

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x262211);
        scene.fog = new THREE.FogExp2(0x262211, 0.044);

        camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 95);
        scene.add(camera);

        clock = new THREE.Clock();

        const hemiLight = new THREE.HemisphereLight(0xfff5cc, 0x8a7d4b, 0.92);
        scene.add(hemiLight);

        const ambLight = new THREE.AmbientLight(0xfff2bd, 0.35);
        scene.add(ambLight);

        const nameTag = document.getElementById('menu-agent-name');
        if (nameTag) nameTag.textContent = playerName;

        loadPlayerGLB('./backrooms_hazmat.glb');
        createFirstPersonHands();
        setupUIEvents();
        setupControls();
        renderInventoryUI();

        window.addEventListener('resize', onResize);
        animate();
    }
    function applyGraphicsSettings(level) {
        gfxQuality = level;
        if (!renderer) return;
        if (level === 'LOW') {
            renderer.setPixelRatio(0.85);
            renderer.toneMapping = THREE.NoToneMapping;
        } else if (level === 'MED') {
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
            renderer.toneMapping = THREE.LinearToneMapping;
            renderer.toneMappingExposure = 1.05;
        } else if (level === 'HIGH') {
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.15;
        }
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function setPlatformMode(mode) {
        platform = mode;
        const joy = document.getElementById('joystick-zone');
        const btnSprint = document.getElementById('btn-sprint');
        const btnCrouch = document.getElementById('btn-crouch');
        const btnInv = document.getElementById('btn-inv');
        const btnF = document.getElementById('btn-f');
        const topRight = document.getElementById('hud-top-right');
        const chatWrap = document.getElementById('hud-chat-wrap');
        const chatLog = document.getElementById('hud-chat-log');

        if (mode === 'PC') {
            if (joy) joy.style.display = 'none';
            if (btnSprint) btnSprint.style.display = 'none';
            if (btnCrouch) btnCrouch.style.display = 'none';
            if (btnInv) btnInv.style.display = 'none';
            if (btnF) btnF.style.display = 'none';
            if (topRight) topRight.style.display = 'none';

            if (chatWrap) {
                chatWrap.style.top = 'auto';
                chatWrap.style.bottom = '22px';
                chatWrap.style.left = '22px';
                chatWrap.style.width = '380px';
            }
            if (chatLog) {
                chatLog.style.maxHeight = '165px';
                chatLog.style.fontSize = '13px';
                chatLog.style.padding = '12px';
                chatLog.style.borderRadius = '0px';
            }
        } else {
            if (joy) joy.style.display = 'block';
            if (btnSprint) btnSprint.style.display = 'flex';
            if (btnCrouch) btnCrouch.style.display = 'flex';
            if (btnInv) btnInv.style.display = 'flex';
            if (topRight) topRight.style.display = 'flex';

            if (chatWrap) {
                chatWrap.style.bottom = 'auto';
                chatWrap.style.top = '14px';
                chatWrap.style.left = '14px';
                chatWrap.style.width = '260px';
            }
            if (chatLog) {
                chatLog.style.maxHeight = '95px';
                chatLog.style.fontSize = '11px';
                chatLog.style.padding = '8px';
                chatLog.style.borderRadius = '0px';
            }
        }
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

            humGain.gain.value = humVolume;
            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(humGain);
            humGain.connect(audioCtx.destination);

            osc1.start();
            osc2.start();
        } catch (e) {}
    }

    function playFootstep(isRun, isCrouchMode) {
        if (!audioCtx) return;
        try {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const heelGain = audioCtx.createGain();
            osc.type = 'sine';
            const pitchJitter = 0.92 + Math.random() * 0.16;
            osc.frequency.setValueAtTime(145 * pitchJitter, now);
            osc.frequency.exponentialRampToValueAtTime(48, now + 0.065);

            const vol = isCrouchMode ? 0.015 : (isRun ? 0.075 : 0.042);
            heelGain.gain.setValueAtTime(vol, now);
            heelGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

            osc.connect(heelGain);
            heelGain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.075);

            const bufSize = Math.floor(audioCtx.sampleRate * 0.06);
            const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
            }

            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 650 * pitchJitter;
            filter.Q.value = 1.4;

            const carpetGain = audioCtx.createGain();
            carpetGain.gain.setValueAtTime(vol * 0.65, now);
            carpetGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

            noise.connect(filter);
            filter.connect(carpetGain);
            carpetGain.connect(audioCtx.destination);
            noise.start(now);
        } catch (e) {}
    }

    function playExhaustedBreath() {
        if (!audioCtx) return;
        try {
            const now = audioCtx.currentTime;
            const duration = 0.75;
            const bufSize = Math.floor(audioCtx.sampleRate * duration);
            const buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);

            for (let i = 0; i < bufSize; i++) {
                const env = Math.sin((i / bufSize) * Math.PI);
                data[i] = (Math.random() * 2 - 1) * env;
            }

            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(420, now);
            filter.frequency.exponentialRampToValueAtTime(240, now + duration);
            filter.Q.value = 1.8;

            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.09, now + 0.16);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start(now);
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
        if (typeof THREE.GLTFLoader === 'undefined') return;
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

                if (gltf.animations && gltf.animations.length > 0) {
                    playerMixer = new THREE.AnimationMixer(playerModel);
                    const runClip = gltf.animations.find(a => /run|sprint|walk/i.test(a.name)) || gltf.animations[0];
                    if (runClip) {
                        runAction = playerMixer.clipAction(runClip);
                        runAction.play();
                    }
                }

                scene.add(playerModel);
                updateModelAttachment();
            },
            undefined,
            () => {}
        );
    }

    function createFirstPersonHands() {
        firstPersonHands = new THREE.Group();
        const sleeveMat = new THREE.MeshLambertMaterial({ color: 0xe3b924 });
        const cuffMat = new THREE.MeshLambertMaterial({ color: 0x22262b });
        const gloveMat = new THREE.MeshLambertMaterial({ color: 0x14171a });

        ['left', 'right'].forEach((side, idx) => {
            const armGroup = new THREE.Group();
            const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.46), sleeveMat);
            sleeve.position.z = 0.05;
            const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.115, 0.05), cuffMat);
            cuff.position.z = -0.19;
            const glove = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.085, 0.16), gloveMat);
            glove.position.z = -0.29;

            armGroup.add(sleeve, cuff, glove);
            armGroup.position.set(idx === 0 ? -0.26 : 0.26, -0.25, -0.35);
            armGroup.name = side + 'FP';
            firstPersonHands.add(armGroup);
        });

        firstPersonHands.visible = false;
        camera.add(firstPersonHands);
    }

    function updateModelAttachment() {
        if (!playerModel) return;
        if (state === 'UNIFORM') {
            playerModel.visible = true;
            const menuPos = (window.Level0 && window.Level0.getMenuCameraPos)
                ? window.Level0.getMenuCameraPos()
                : new THREE.Vector3(-18, 1.68, -22);
            playerModel.position.set(menuPos.x, 0, menuPos.z - 2.3);
            playerModel.rotation.set(0, 0, 0);
        } else {
            playerModel.visible = false;
        }
    }

    function loadTexture(path, rx, ry) {
        const loader = new THREE.TextureLoader();
        const tex = loader.load(path);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(rx, ry);
        if (renderer && gfxQuality === 'HIGH') {
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
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
            return;
        }
        if (inventory.pocket0 && inventory.pocket0.id === id) {
            inventory.pocket0 = null;
            renderInventoryUI();
            return;
        }
        if (inventory.pocket1 && inventory.pocket1.id === id) {
            inventory.pocket1 = null;
            renderInventoryUI();
            return;
        }
        const idx = inventory.bag.findIndex(it => it && it.id === id);
        if (idx !== -1) {
            inventory.bag[idx] = null;
            renderInventoryUI();
        }
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
                log.style.opacity = '0.35';
            }
        }, 6500);
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
        sprite.scale.set(1.4, 0.35, 1);
        sprite.position.y = 2.05;
        return sprite;
    }

    function updateWorldPromptSprite(targetItem) {
        if (!worldPromptSprite) {
            worldPromptCanvas = document.createElement('canvas');
            worldPromptCanvas.width = 512;
            worldPromptCanvas.height = 160;
            const tex = new THREE.CanvasTexture(worldPromptCanvas);
            const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
            worldPromptSprite = new THREE.Sprite(mat);
            worldPromptSprite.scale.set(0.62, 0.20, 1);
            worldPromptSprite.renderOrder = 999;
            scene.add(worldPromptSprite);
        }

        if (!targetItem) {
            worldPromptSprite.visible = false;
            lastPromptTitle = '';
            return;
        }

        worldPromptSprite.visible = true;
        worldPromptSprite.position.copy(targetItem.pos).add(new THREE.Vector3(0, 0.18, 0));

        if (lastPromptTitle !== targetItem.name) {
            lastPromptTitle = targetItem.name;
            const ctx = worldPromptCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 512, 160);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 8;
            ctx.strokeRect(4, 4, 504, 152);

            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 40px sans-serif';
            ctx.fillText(targetItem.name, 256, 56);

            ctx.font = '700 32px sans-serif';
            ctx.fillText('Нажмите F', 256, 114);

            worldPromptSprite.material.map.needsUpdate = true;
        }
    }
    function startMultiplayerSync() {
        if (syncInterval) clearInterval(syncInterval);
        const statusEl = document.getElementById('net-status-text');

        const syncTick = async () => {
            if (state !== 'LOBBY' && state !== 'PLAYING' && state !== 'INVENTORY' && state !== 'CLIMBING') return;
            try {
                const putRes = await fetch(`${DB_URL}/rooms/${roomCode}/players/${playerId}.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: playerName,
                        state: state,
                        x: Number(camera.position.x.toFixed(2)),
                        y: Number(camera.position.y.toFixed(2)),
                        z: Number(camera.position.z.toFixed(2)),
                        yaw: Number(yaw.toFixed(2)),
                        pitch: Number(pitch.toFixed(2)),
                        ts: Date.now()
                    })
                });

                if (statusEl) {
                    statusEl.textContent = putRes.ok
                        ? 'Сервер М.Е.Г.: Подключено'
                        : 'Ошибка доступа к базе (проверьте Rules в Firebase)';
                }

                const res = await fetch(`${DB_URL}/rooms/${roomCode}/players.json`);
                const data = await res.json();
                if (data) {
                    const activePlayers = [];
                    Object.keys(data).forEach((id) => {
                        const p = data[id];
                        if (!p || Date.now() - p.ts > 15000) {
                            if (remotePlayers[id]) {
                                scene.remove(remotePlayers[id].root);
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
            } catch (e) {
                if (statusEl) statusEl.textContent = 'Нет связи с сервером Firebase';
            }
        };

        syncTick();
        syncInterval = setInterval(syncTick, 650);
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
            const root = new THREE.Group();
            const suitMat = new THREE.MeshLambertMaterial({ color: 0xeab308 });
            const visorMat = new THREE.MeshLambertMaterial({ color: 0x111827 });

            const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), suitMat);
            legL.position.set(-0.13, 0.39, 0);
            const legR = legL.clone();
            legR.position.x = 0.13;

            const torsoPivot = new THREE.Group();
            torsoPivot.position.set(0, 0.78, 0);

            const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), suitMat);
            chest.position.y = 0.31;

            const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), suitMat);
            head.position.y = 0.8;
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.1), visorMat);
            visor.position.set(0, 0.81, 0.19);

            const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.56, 0.12), suitMat);
            armL.position.set(-0.31, 0.34, 0);
            const armR = armL.clone();
            armR.position.x = 0.31;

            torsoPivot.add(chest, head, visor, armL, armR);

            const nameSprite = createNameTagSprite(p.name || 'Agent');
            root.add(legL, legR, torsoPivot, nameSprite);

            scene.add(root);
            remotePlayers[id] = {
                root, torsoPivot, legL, legR, armL, armR,
                prevPos: new THREE.Vector3(p.x, p.y - 1.68, p.z),
                animPhase: 0
            };
        }

        const rp = remotePlayers[id];
        const targetPos = new THREE.Vector3(p.x, p.y - 1.68, p.z);
        const moveStep = targetPos.distanceTo(rp.prevPos);
        rp.prevPos.copy(targetPos);

        rp.root.position.lerp(targetPos, 0.45);
        rp.root.rotation.y = p.yaw + Math.PI;

        const tNow = clock.getElapsedTime();

        if (moveStep > 0.015) {
            const strideSpeed = moveStep > 0.18 ? 14 : 9;
            const strideAmp = moveStep > 0.18 ? 0.65 : 0.4;
            rp.animPhase += 0.016 * strideSpeed;
            const swing = Math.sin(rp.animPhase) * strideAmp;

            rp.legL.rotation.x = swing;
            rp.legR.rotation.x = -swing;
            rp.legL.position.z = Math.sin(rp.animPhase) * 0.14;
            rp.legR.position.z = -Math.sin(rp.animPhase) * 0.14;
            rp.torsoPivot.position.y = 0.78 + Math.abs(Math.cos(rp.animPhase)) * 0.035;
            rp.torsoPivot.rotation.z = 0;
        } else {
            rp.legL.rotation.x *= 0.8;
            rp.legR.rotation.x *= 0.8;
            rp.legL.position.z *= 0.8;
            rp.legR.position.z *= 0.8;
            const idleY = 0.78 + Math.sin(tNow * 2.0) * 0.014;
            rp.torsoPivot.position.y += (idleY - rp.torsoPivot.position.y) * 0.2;
            rp.torsoPivot.rotation.z = Math.sin(tNow * 1.15) * 0.025;
        }

        if ((p.pitch || 0) > 0.55) {
            rp.torsoPivot.rotation.x += (-Math.PI / 2 - rp.torsoPivot.rotation.x) * 0.25;
            rp.armL.rotation.x = 0;
            rp.armR.rotation.x = 0;
            rp.armL.rotation.z = 2.4 + Math.sin(tNow * 14) * 0.55;
            rp.armR.rotation.z = -2.4 - Math.sin(tNow * 14) * 0.55;
        } else {
            rp.torsoPivot.rotation.x += (0 - rp.torsoPivot.rotation.x) * 0.25;
            rp.armL.rotation.z = 0.08;
            rp.armR.rotation.z = -0.08;
            const armSwing = moveStep > 0.015 ? -Math.sin(rp.animPhase) * (moveStep > 0.18 ? 0.55 : 0.3) : 0;
            rp.armL.rotation.x = armSwing;
            rp.armR.rotation.x = -armSwing;
        }
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
            'screen-disclaimer', 'screen-platform', 'screen-menu',
            'screen-settings', 'screen-uniform', 'screen-expedition',
            'screen-lobby', 'screen-hud', 'screen-inventory', 'screen-meg-lost'
        ];
        screens.forEach((s) => {
            const el = document.getElementById(s);
            if (el) el.style.display = 'none';
        });
        const target = document.getElementById(id);
        if (target) {
            const flexList = [
                'screen-platform', 'screen-settings', 'screen-expedition',
                'screen-lobby', 'screen-inventory', 'screen-disclaimer', 'screen-meg-lost'
            ];
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
            state = 'PLATFORM';
            showScreen('screen-platform');
        });

        bindClick('choose-android', () => {
            setPlatformMode('ANDROID');
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
        });

        bindClick('choose-pc', () => {
            setPlatformMode('PC');
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
        });

        bindClick('btn-to-settings', () => {
            state = 'SETTINGS';
            showScreen('screen-settings');
        });
        bindClick('btn-settings-back', () => {
            state = 'MENU';
            showScreen('screen-menu');
        });

        bindClick('set-plat-android', () => setPlatformMode('ANDROID'));
        bindClick('set-plat-pc', () => setPlatformMode('PC'));

        const gfxBtns = ['set-gfx-low', 'set-gfx-med', 'set-gfx-high'];
        const gfxMap = { 'set-gfx-low': 'LOW', 'set-gfx-med': 'MED', 'set-gfx-high': 'HIGH' };
        gfxBtns.forEach((id) => {
            bindClick(id, () => {
                gfxBtns.forEach(b => document.getElementById(b)?.classList.remove('selected-opt'));
                document.getElementById(id)?.classList.add('selected-opt');
                applyGraphicsSettings(gfxMap[id]);
            });
        });

        const sensSlider = document.getElementById('set-sens');
        if (sensSlider) {
            sensSlider.addEventListener('input', (e) => {
                camSensitivity = Number(e.target.value) / 5;
            });
        }

        const humSlider = document.getElementById('set-hum');
        if (humSlider) {
            humSlider.addEventListener('input', (e) => {
                humVolume = (Number(e.target.value) / 10) * 0.1;
                if (humGain) humGain.gain.value = humVolume;
            });
        }

        bindClick('btn-to-uniform', () => {
            initLampHum();
            state = 'UNIFORM';
            showScreen('screen-uniform');
            const menuPos = (window.Level0 && window.Level0.getMenuCameraPos)
                ? window.Level0.getMenuCameraPos()
                : new THREE.Vector3(-18, 1.68, -22);
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
            setPlatformMode(platform);
            updateModelAttachment();
            startMultiplayerSync();
            if (window.Level0 && window.Level0.startGameplay) {
                window.Level0.startGameplay();
            }
            if (platform === 'PC') {
                document.getElementById('game-canvas')?.requestPointerLock?.();
            }
        });

        bindClick('btn-hud-menu', () => {
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
        });

        bindClick('btn-toggle-chat', () => toggleHudChat());

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
            setPlatformMode(platform);
            if (platform === 'PC') {
                document.getElementById('game-canvas')?.requestPointerLock?.();
            }
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
    }

    function toggleHudChat() {
        const row = document.getElementById('hud-chat-input-row');
        const log = document.getElementById('hud-chat-log');
        const inp = document.getElementById('hud-chat-input');
        if (!row) return;
        const opened = row.style.display === 'flex';
        row.style.display = opened ? 'none' : 'flex';
        if (log) log.style.opacity = '1';
        if (!opened && inp) {
            document.exitPointerLock?.();
            setTimeout(() => inp.focus(), 30);
        } else if (platform === 'PC') {
            document.getElementById('game-canvas')?.requestPointerLock?.();
        }
    }
    function triggerInteraction() {
        if (currentTarget && currentTarget.active) {
            currentTarget.onInteract();
            updateCrosshairTarget();
        }
    }

    function setupControls() {
        const joyZone = document.getElementById('joystick-zone');
        const joyKnob = document.getElementById('joystick-knob');
        let joyTouchId = null;
        const maxDist = 38;

        if (joyZone && joyKnob) {
            joyZone.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const t = e.changedTouches.item(0);
                if (t) {
                    joyTouchId = t.identifier;
                    updateJoystick(t);
                }
            });

            joyZone.addEventListener('touchmove', (e) => {
                e.preventDefault();
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches.item(i);
                    if (t && t.identifier === joyTouchId) updateJoystick(t);
                }
            });

            const endJoy = (e) => {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches.item(i);
                    if (t && t.identifier === joyTouchId) {
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
            const t = e.changedTouches.item(0);
            if (t) {
                lookTouchId = t.identifier;
                lastX = t.clientX;
                lastY = t.clientY;
            }
        });

        canvas.addEventListener('touchmove', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches.item(i);
                if (t && t.identifier === lookTouchId) {
                    const dx = t.clientX - lastX;
                    const dy = t.clientY - lastY;
                    lastX = t.clientX;
                    lastY = t.clientY;

                    if (state === 'UNIFORM' && playerModel) {
                        playerModel.rotation.y += dx * 0.012;
                    } else if (state === 'PLAYING') {
                        yaw -= dx * 0.0045 * camSensitivity;
                        pitch = Math.max(-1.35, Math.min(1.35, pitch - dy * 0.0045 * camSensitivity));
                    }
                }
            }
        });

        canvas.addEventListener('touchend', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches.item(i);
                if (t && t.identifier === lookTouchId) lookTouchId = null;
            }
        });

        canvas.addEventListener('click', () => {
            if (platform === 'PC' && state === 'PLAYING') {
                canvas.requestPointerLock?.();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (state === 'PLAYING' && document.pointerLockElement === canvas) {
                yaw -= e.movementX * 0.0024 * camSensitivity;
                pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * 0.0024 * camSensitivity));
            }
        });

        const keys = {};
        window.addEventListener('keydown', (e) => {
            const chatInp = document.getElementById('hud-chat-input');
            if (document.activeElement === chatInp) {
                if (e.code === 'Enter') {
                    if (chatInp.value.trim()) {
                        sendNetworkChat(chatInp.value.trim());
                        chatInp.value = '';
                    }
                    toggleHudChat();
                }
                return;
            }

            keys[e.code] = true;
            if (e.code === 'ShiftLeft') isSprinting = true;
            if (e.code === 'KeyC') isCrouching = !isCrouching;
            if (e.code === 'KeyF' || e.code === 'KeyE') triggerInteraction();
            if (e.code === 'KeyT' || e.code === 'Enter') {
                if (state === 'PLAYING') {
                    e.preventDefault();
                    toggleHudChat();
                }
            }
            if (e.code === 'Tab' || e.code === 'KeyI') {
                if (state === 'PLAYING' || state === 'INVENTORY') {
                    e.preventDefault();
                    if (state === 'PLAYING') {
                        state = 'INVENTORY';
                        renderInventoryUI();
                        showScreen('screen-inventory');
                        document.exitPointerLock?.();
                    } else {
                        state = 'PLAYING';
                        showScreen('screen-hud');
                        setPlatformMode(platform);
                        if (platform === 'PC') canvas.requestPointerLock?.();
                    }
                }
            }
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

        if (crosshair) {
            crosshair.classList.toggle('targeted', Boolean(best));
        }
        if (btnF && platform === 'ANDROID') {
            btnF.style.display = best ? 'flex' : 'none';
        }
    }
    function startClimbAnimation(basePos, topPos, onGrabKey, onComplete) {
        state = 'CLIMBING';
        isSprinting = false;
        updateWorldPromptSprite(null);
        document.getElementById('crosshair')?.classList.remove('targeted');

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
            updateEscapeRunHands(true, climbData.timer * 1.1);
        } else if (p < 0.65) {
            camera.position.copy(climbData.topPos);
            updateEscapeRunHands(false, 0);
            if (!climbData.grabbed) {
                climbData.grabbed = true;
                if (climbData.onGrabKey) climbData.onGrabKey();
            }
        } else {
            const t = (p - 0.65) / 0.35;
            camera.position.lerpVectors(climbData.topPos, climbData.startPos, t);
            camera.position.x += Math.sin(t * Math.PI * 5) * 0.04;
            updateEscapeRunHands(true, climbData.timer * 1.1);
        }

        if (p >= 1) {
            updateEscapeRunHands(false, 0);
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

        if (isExhausted) {
            stamina = Math.min(100, stamina + 11 * dt);
            breathTimer += dt;
            if (breathTimer >= 1.15) {
                breathTimer = 0;
                playExhaustedBreath();
            }
            if (stamina >= 45) {
                isExhausted = false;
            }
        }

        const canSprint = moving && isSprinting && !isCrouching && !isExhausted && stamina > 0;

        if (canSprint) {
            stamina = Math.max(0, stamina - 18 * dt);
            if (stamina <= 0.5) {
                isExhausted = true;
                isSprinting = false;
                breathTimer = 0;
                playExhaustedBreath();
                document.getElementById('btn-sprint')?.classList.remove('active');
            }
        } else if (!isExhausted) {
            stamina = Math.min(100, stamina + 13 * dt);
        }

        const baseSpeed = isCrouching ? 2.0 : (canSprint ? 4.8 : (isExhausted ? 2.7 : 3.3));
        const speed = baseSpeed * dt;

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

        const t = clock.getElapsedTime();

        if (moving) {
            const bobFreq = canSprint ? 13.0 : (isCrouching ? 6.5 : 8.8);
            const bobAmpY = canSprint ? 0.042 : (isCrouching ? 0.015 : 0.024);
            const bobAmpZ = canSprint ? 0.016 : 0.008;

            const wave = Math.sin(t * bobFreq);
            const sign = wave >= 0 ? 1 : -1;
            if (sign !== lastStepSign) {
                lastStepSign = sign;
                playFootstep(canSprint, isCrouching);
            }

            camera.position.y += Math.abs(wave) * bobAmpY;
            camera.rotation.z += (wave * bobAmpZ - camera.rotation.z) * 12 * dt;
        } else if (isExhausted) {
            camera.position.y += Math.sin(t * 5.2) * 0.018;
            camera.rotation.z += (0 - camera.rotation.z) * 8 * dt;
        } else {
            camera.position.y += Math.sin(t * 1.9) * 0.011;
            const idleRoll = Math.sin(t * 1.1) * 0.0045;
            camera.rotation.z += (idleRoll - camera.rotation.z) * 6 * dt;
            camera.rotation.x += Math.cos(t * 1.9) * 0.0025;
        }

        updateEscapeRunHands(canSprint, t);
        updateCrosshairTarget();
    }
    let runBlend = 0;
    function updateEscapeRunHands(activeSprint, t) {
        if (!firstPersonHands) return;
        const targetBlend = (activeSprint && (state === 'PLAYING' || state === 'CLIMBING')) ? 1 : 0;
        runBlend += (targetBlend - runBlend) * 0.22;

        if (runBlend < 0.03) {
            firstPersonHands.visible = false;
            return;
        }

        firstPersonHands.visible = true;
        firstPersonHands.position.y = -0.18 * (1 - runBlend);

        const lArm = firstPersonHands.getObjectByName('leftFP');
        const rArm = firstPersonHands.getObjectByName('rightFP');
        const phase = t * 13.5;

        if (lArm && rArm) {
            const lSwing = Math.sin(phase);
            const rSwing = Math.sin(phase + Math.PI);

            lArm.position.set(
                -0.25 + Math.max(0, lSwing) * 0.06,
                -0.23 + lSwing * 0.075,
                -0.34 - lSwing * 0.11
            );
            lArm.rotation.set(
                0.35 + lSwing * 0.42,
                -0.38 - lSwing * 0.18,
                -0.25
            );

            rArm.position.set(
                0.25 - Math.max(0, rSwing) * 0.06,
                -0.23 + rSwing * 0.075,
                -0.34 - rSwing * 0.11
            );
            rArm.rotation.set(
                0.35 + rSwing * 0.42,
                0.38 + rSwing * 0.18,
                0.25
            );
        }
    }

    function triggerMonsterDeath(monsterObj) {
        if (state === 'DYING' || state === 'DEAD') return;
        state = 'DYING';
        killerMonster = monsterObj;
        deathTimer = 0;
        if (firstPersonHands) firstPersonHands.visible = false;
        updateWorldPromptSprite(null);
        document.exitPointerLock?.();
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

        if (playerMixer) playerMixer.update(dt);

        if (state === 'DISCLAIMER' || state === 'PLATFORM' || state === 'MENU' || state === 'SETTINGS') {
            const menuPos = (window.Level0 && window.Level0.getMenuCameraPos)
                ? window.Level0.getMenuCameraPos()
                : new THREE.Vector3(-18, 1.68, -22);

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
