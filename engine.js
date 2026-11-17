window.BackroomsEngine = (function () {
    let state = 'DISCLAIMER'; // DISCLAIMER, MENU, UNIFORM, PLAYING, INVENTORY
    let scene, camera, renderer, clock;
    let playerModel = null;
    const bones = {};
    let isSprinting = false;
    let isCrouching = false;
    let playerHeight = 1.68;

    // Движение и обзор
    const moveVec = { x: 0, z: 0 };
    let yaw = 0;
    let pitch = 0;

    // Физика и интерактив
    const colliders = [];
    const interactables = [];

    // Тактический инвентарь (hand, pocket0, pocket1, bag[0..8])
    const inventory = {
        hand: null,
        pocket0: null,
        pocket1: null,
        bag: new Array(9).fill(null)
    };
    let selectedSlotKey = 'hand';

    function init() {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) {
            console.error('Не найден <canvas id="game-canvas"> в index.html');
            return;
        }

        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: false,
            powerPreference: 'high-performance'
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a170b);
        scene.fog = new THREE.FogExp2(0x1a170b, 0.085);

        camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 75);
        scene.add(camera);

        clock = new THREE.Clock();

        // Базовое освещение
        const ambLight = new THREE.AmbientLight(0xfff3c4, 0.48);
        scene.add(ambLight);

        // Загрузка вашей модели из Escape The Backrooms
        loadPlayerGLB('./backrooms_hazmat.glb');

        setupUIEvents();
        setupTouchControls();
        renderInventoryUI();

        window.addEventListener('resize', onResize);
        animate();
    }
    function loadPlayerGLB(url) {
        if (typeof THREE.GLTFLoader === 'undefined') {
            console.warn('GLTFLoader.js не подключен, созданы временные руки');
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
                        if (obj.material) {
                            obj.material.side = THREE.DoubleSide;
                        }
                    }
                    if (obj.isBone) {
                        bones[obj.name] = obj;
                    }
                });
                scene.add(playerModel);
                updateModelAttachment();
                console.log('Модель успешно загружена:', url);
            },
            undefined,
            (err) => {
                console.warn('Ошибка загрузки модели (проверьте путь):', url, err);
                createFallbackHands();
            }
        );
    }

    function createFallbackHands() {
        const group = new THREE.Group();
        const sleeveMat = new THREE.MeshStandardMaterial({ color: 0xd4b128, roughness: 0.6 });
        const gloveMat = new THREE.MeshStandardMaterial({ color: 0x1f2428, roughness: 0.8 });

        ['left', 'right'].forEach((side, idx) => {
            const arm = new THREE.Group();
            const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.45), sleeveMat);
            const glove = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.16), gloveMat);
            glove.position.z = -0.28;
            arm.add(sleeve, glove);
            arm.position.set(idx === 0 ? -0.26 : 0.26, -0.28, -0.35);
            arm.name = side + 'ArmFallback';
            group.add(arm);
        });

        playerModel = group;
        playerModel.visible = false;
        camera.add(playerModel);
    }

    function updateModelAttachment() {
        if (!playerModel) return;

        if (state === 'UNIFORM') {
            camera.remove(playerModel);
            scene.add(playerModel);
            playerModel.visible = true;
            playerModel.position.set(0, 0, 1.8);
            playerModel.rotation.set(0, 0, 0);
            if (bones['Head']) bones['Head'].scale.set(1, 1, 1);
            if (bones['LeftArm']) bones['LeftArm'].rotation.set(0, 0, 0);
            if (bones['RightArm']) bones['RightArm'].rotation.set(0, 0, 0);
        } else {
            scene.remove(playerModel);
            camera.add(playerModel);
            playerModel.position.set(0, -1.52, 0.18);
            playerModel.rotation.set(0, Math.PI, 0);
            if (bones['Head']) bones['Head'].scale.set(0.001, 0.001, 0.001);
            playerModel.visible = false;
        }
    }

    function loadTexture(path, rx, ry) {
        const loader = new THREE.TextureLoader();
        const tex = loader.load(
            path,
            () => console.log('Текстура загружена:', path),
            undefined,
            () => console.warn('Не найдена текстура:', path)
        );
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
        if (descEl) descEl.textContent = currentItem ? currentItem.desc : 'Выберите ячейку для осмотра.';
    }
    function showScreen(id) {
        const screens = [
            'screen-disclaimer',
            'screen-menu',
            'screen-uniform',
            'screen-expedition',
            'screen-lobby',
            'screen-hud',
            'screen-inventory'
        ];
        screens.forEach((s) => {
            const el = document.getElementById(s);
            if (el) el.style.display = 'none';
        });

        const target = document.getElementById(id);
        if (target) {
            const flexScreens = ['screen-expedition', 'screen-lobby', 'screen-inventory', 'screen-disclaimer'];
            target.style.display = flexScreens.includes(id) ? 'flex' : 'block';
        }
    }

    function bindClick(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    function setupUIEvents() {
        bindClick('screen-disclaimer', () => {
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
        });

        bindClick('btn-to-uniform', () => {
            state = 'UNIFORM';
            showScreen('screen-uniform');
            camera.position.set(0, 1.35, 3.8);
            camera.rotation.set(0, 0, 0);
            updateModelAttachment();
        });

        bindClick('btn-uniform-back', () => {
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
        });

        bindClick('btn-to-expedition', () => showScreen('screen-expedition'));
        bindClick('btn-exp-back', () => showScreen('screen-menu'));

        bindClick('btn-select-story', () => {
            const codeEl = document.getElementById('invite-code-val');
            if (codeEl) codeEl.textContent = Math.floor(1000 + Math.random() * 9000);
            showScreen('screen-lobby');
        });

        bindClick('btn-join-code', () => showScreen('screen-lobby'));
        bindClick('btn-lobby-back', () => showScreen('screen-expedition'));

        bindClick('btn-lobby-send', () => {
            const inp = document.getElementById('lobby-chat-input');
            const chat = document.getElementById('lobby-chat');
            if (inp && chat && inp.value.trim()) {
                chat.innerHTML += `<br><b>Agent_01:</b> ${inp.value}`;
                inp.value = '';
                chat.scrollTop = chat.scrollHeight;
            }
        });

        bindClick('btn-start-game', () => {
            state = 'PLAYING';
            showScreen('screen-hud');
            updateModelAttachment();
            if (window.Level0 && window.Level0.startGameplay) {
                window.Level0.startGameplay();
            }
        });

        bindClick('btn-hud-menu', () => {
            state = 'MENU';
            showScreen('screen-menu');
            updateModelAttachment();
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

        bindClick('btn-use', triggerInteraction);
        bindClick('interact-prompt', triggerInteraction);
    }

    function triggerInteraction() {
        for (let i = interactables.length - 1; i >= 0; i--) {
            const item = interactables[i];
            if (item.active && camera.position.distanceTo(item.pos) < (item.radius || 2.6)) {
                item.onInteract();
                break;
            }
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
                const t = e.changedTouches[0];
                joyTouchId = t.identifier;
                updateJoystick(t);
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
                    const t = e.changedTouches[i];
                    if (t.identifier === joyTouchId) {
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
            const t = e.changedTouches[0];
            lookTouchId = t.identifier;
            lastX = t.clientX;
            lastY = t.clientY;
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
            if (e.code === 'KeyE' || e.code === 'KeyF') triggerInteraction();
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
    function updatePlayerMovement(dt) {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;

        const targetH = isCrouching ? 0.85 : 1.68;
        playerHeight += (targetH - playerHeight) * 10 * dt;
        camera.position.y = playerHeight;

        const moving = Math.hypot(moveVec.x, moveVec.z) > 0.05;
        const speed = (isCrouching ? 2.0 : (isSprinting ? 6.2 : 3.4)) * dt;

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

        // Руки видны ТОЛЬКО при беге
        updateSprintHands(moving && isSprinting && !isCrouching, clock.getElapsedTime());

        // Подсказка взаимодействия
        let nearPrompt = null;
        for (let item of interactables) {
            if (item.active && camera.position.distanceTo(item.pos) < (item.radius || 2.6)) {
                nearPrompt = item.prompt;
                break;
            }
        }
        const promptEl = document.getElementById('interact-prompt');
        if (promptEl) {
            if (nearPrompt) {
                promptEl.style.display = 'block';
                promptEl.textContent = nearPrompt;
            } else {
                promptEl.style.display = 'none';
            }
        }
    }

    function updateSprintHands(activeSprint, t) {
        if (!playerModel || state !== 'PLAYING') return;

        if (!activeSprint) {
            playerModel.visible = false;
            return;
        }

        playerModel.visible = true;
        const swing = Math.sin(t * 13);

        if (bones['LeftArm'] && bones['RightArm']) {
            bones['LeftArm'].rotation.x = -1.1 + swing * 0.45;
            bones['RightArm'].rotation.x = -1.1 - swing * 0.45;
            if (bones['LeftForeArm']) bones['LeftForeArm'].rotation.x = -0.6 + Math.max(0, swing) * 0.3;
            if (bones['RightForeArm']) bones['RightForeArm'].rotation.x = -0.6 + Math.max(0, -swing) * 0.3;
            playerModel.position.y = -1.42 + Math.abs(Math.cos(t * 13)) * 0.04;
        } else {
            const lArm = playerModel.getObjectByName('leftArmFallback');
            const rArm = playerModel.getObjectByName('rightArmFallback');
            if (lArm && rArm) {
                lArm.position.z = -0.35 + swing * 0.12;
                lArm.position.y = -0.25 + Math.abs(swing) * 0.05;
                rArm.position.z = -0.35 - swing * 0.12;
                rArm.position.y = -0.25 + Math.abs(swing) * 0.05;
            }
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
            // Плавное покачивание камеры в главном меню на фоне Уровня 0
            camera.position.set(
                Math.sin(elapsed * 0.65) * 0.18,
                1.65 + Math.sin(elapsed * 1.3) * 0.04,
                4 + Math.cos(elapsed * 0.5) * 0.15
            );
            camera.rotation.set(
                Math.sin(elapsed * 0.5) * 0.02,
                Math.sin(elapsed * 0.35) * 0.06,
                Math.sin(elapsed * 0.55) * 0.015
            );
        } else if (state === 'PLAYING') {
            updatePlayerMovement(dt);
            if (window.Level0 && window.Level0.update) {
                window.Level0.update(dt, elapsed, camera.position);
            }
        }

        renderer.render(scene, camera);
    }

    window.addEventListener('DOMContentLoaded', init);

    return {
        getScene: () => scene,
        getCamera: () => camera,
        loadTexture,
        addBox,
        colliders,
        interactables,
        addItem,
        hasItem,
        removeItem,
        setPlayerPos: (x, y, z, newYaw = 0) => {
            camera.position.set(x, y, z);
            yaw = newYaw;
            pitch = 0;
        },
        isCrouching: () => isCrouching,
        setObjective: (text) => {
            const objEl = document.getElementById('hud-objective');
            if (objEl) objEl.textContent = 'ЗАДАЧА: ' + text;
        }
    };
})();
