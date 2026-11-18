window.Level0 = (function () {
    let engine, scene;
    let wallMat, carpetMat, ceilingMat;
    let ladderPartsCollected = 0;
    let ladderPlaced = false;
    let keyCollected = false;
    let doorOpened = false;
    let inSubLevel = false;
    let bacteriaActive = false;
    let bacteriaMesh = null;
    let doorMesh = null;
    let doorCollider = null;

    // Отдельный красивый ракурс в глубине лабиринта для Главного меню
    const MENU_CAM_POS = new THREE.Vector3(-18, 1.68, -22);

    function addCeilingLamp(x, z) {
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.08, 0.75),
            new THREE.MeshBasicMaterial({ color: 0xffffea })
        );
        frame.position.set(x, 3.26, z);
        scene.add(frame);

        if (Math.abs(x) % 24 === 8 && Math.abs(z) % 24 === 8) {
            const light = new THREE.PointLight(0xfff1b8, 0.55, 16);
            light.position.set(x, 2.8, z);
            scene.add(light);
        }
    }

    function buildLevel() {
        engine = window.BackroomsEngine;
        scene = engine.getScene();

        const carpetTex = engine.loadTexture('./carpet_0.png', 45, 45);
        const wallTex = engine.loadTexture('./wall_0.png', 4, 1);
        const ceilTex = engine.createCeilingTileTexture(45, 45);

        carpetMat = new THREE.MeshLambertMaterial({ map: carpetTex, color: 0xe3d896 });
        wallMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xede3a1 });
        ceilingMat = new THREE.MeshLambertMaterial({ map: ceilTex, color: 0xd4cc9a });

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), carpetMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(-10, 0, -22);
        scene.add(floor);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(-10, 3.3, -22);
        scene.add(ceiling);

        for (let lx = -32; lx <= 32; lx += 12) {
            for (let lz = 16; lz >= -56; lz -= 12) {
                addCeilingLamp(lx, lz);
            }
        }

        // Внешний периметр основного зала (x: -36..36, z: -38..22)
        engine.addBox(0, 1.65, 22, 72, 3.3, 0.6, wallMat);      // Юг
        engine.addBox(36, 1.65, -8, 0.6, 3.3, 60, wallMat);    // Восток

        // Западная стена с проемом под дверь «ВОТ ДВЕРЬ» (x = -36, проем на z = -18)
        engine.addBox(-36, 1.65, 3, 0.6, 3.3, 38, wallMat);
        engine.addBox(-36, 1.65, -29, 0.6, 3.3, 18, wallMat);

        // Северная стена основного блока с выходом в верхний северный коридор к лестнице (x = 0, z = -38)
        engine.addBox(-20, 1.65, -38, 32, 3.3, 0.6, wallMat);
        engine.addBox(20, 1.65, -38, 32, 3.3, 0.6, wallMat);

        // 1. Нижняя правая секция: Спавн с сеткой колонн (x: 0..36, z: -8..22)
        engine.addBox(-2, 1.65, 14, 0.5, 3.3, 14, wallMat);
        engine.addBox(-2, 1.65, -2, 0.5, 3.3, 10, wallMat);

        for (let cx = 4; cx <= 30; cx += 6.5) {
            for (let cz = 16; cz >= -4; cz -= 6.5) {
                engine.addBox(cx, 1.65, cz, 1.5, 3.3, 1.5, wallMat);
            }
        }

        // 2. Нижняя левая секция: Плотный лабиринт
        engine.addBox(-18, 1.65, 16, 24, 3.3, 0.5, wallMat);
        engine.addBox(-28, 1.65, 10, 0.5, 3.3, 12, wallMat);
        engine.addBox(-12, 1.65, 10, 14, 3.3, 0.5, wallMat);
        engine.addBox(-20, 1.65, 4, 0.5, 3.3, 12, wallMat);
        engine.addBox(-10, 1.65, 2, 12, 3.3, 0.5, wallMat);
        engine.addBox(-28, 1.65, -3, 12, 3.3, 0.5, wallMat);

        // Горизонтальная перегородка между нижней и центральной секциями
        engine.addBox(-26, 1.65, -8, 18, 3.3, 0.5, wallMat);
        engine.addBox(-6, 1.65, -8, 12, 3.3, 0.5, wallMat);
        engine.addBox(12, 1.65, -8, 14, 3.3, 0.5, wallMat);
        engine.addBox(30, 1.65, -8, 10, 3.3, 0.5, wallMat);
        // 3. Центральный лабиринт и галерея меню
        engine.addBox(-22, 1.65, -24, 1.4, 3.3, 1.4, wallMat);
        engine.addBox(-14, 1.65, -24, 1.4, 3.3, 1.4, wallMat);
        engine.addBox(-22, 1.65, -31, 1.4, 3.3, 1.4, wallMat);
        engine.addBox(-14, 1.65, -31, 1.4, 3.3, 1.4, wallMat);
        engine.addBox(-26, 1.65, -28, 0.5, 3.3, 16, wallMat);

        engine.addBox(-8, 1.65, -18, 0.5, 3.3, 14, wallMat);
        engine.addBox(6, 1.65, -16, 18, 3.3, 0.5, wallMat);
        engine.addBox(16, 1.65, -22, 0.5, 3.3, 12, wallMat);
        engine.addBox(26, 1.65, -18, 12, 3.3, 0.5, wallMat);
        engine.addBox(24, 1.65, -28, 0.5, 3.3, 14, wallMat);
        engine.addBox(10, 1.65, -30, 16, 3.3, 0.5, wallMat);

        // Сбор 3 частей лестницы в разных углах карты
        const woodMat = new THREE.MeshLambertMaterial({ color: 0x7c5328 });
        const partSpots = [
            new THREE.Vector3(-31, 0.25, 18),
            new THREE.Vector3(29, 0.25, -23),
            new THREE.Vector3(-29, 0.25, -33)
        ];

        partSpots.forEach((pos, idx) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 1.5), woodMat);
            mesh.position.copy(pos);
            mesh.rotation.y = 0.6 + idx;
            scene.add(mesh);

            engine.interactables.push({
                name: 'ЧАСТЬ ЛЕСТНИЦЫ',
                pos: pos,
                radius: 2.8,
                active: true,
                onInteract: function () {
                    this.active = false;
                    mesh.visible = false;
                    ladderPartsCollected++;
                    engine.addItem({
                        id: 'ladder_part',
                        name: 'ЧАСТЬ ЛЕСТНИЦЫ',
                        icon: '🪜',
                        desc: 'Деревянная секция приставной лестницы.'
                    });
                }
            });
        });

        // Миндальная вода
        const waterPos = new THREE.Vector3(18, 0.35, 12);
        const bottleMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.36, 10),
            new THREE.MeshLambertMaterial({ color: 0x38bdf8 })
        );
        bottleMesh.position.copy(waterPos);
        scene.add(bottleMesh);

        engine.interactables.push({
            name: 'МИНДАЛЬНАЯ ВОДА',
            pos: waterPos,
            radius: 2.6,
            active: true,
            onInteract: function () {
                this.active = false;
                bottleMesh.visible = false;
                engine.addItem({
                    id: 'almond_water',
                    name: 'МИНДАЛЬНАЯ ВОДА',
                    icon: '🧴',
                    desc: 'Сладковатая вода из Закулисья.'
                });
            }
        });

        // 4. ДАЛЕКИЙ СЕВЕРНЫЙ ТУПИК «ВОТ ЛЕСТНИЦА» (x: -12..12, z: -38..-58)
        engine.addBox(-12, 1.65, -48, 0.6, 3.3, 20, wallMat);
        engine.addBox(12, 1.65, -48, 0.6, 3.3, 20, wallMat);
        engine.addBox(-6, 1.65, -46, 1.4, 3.3, 1.4, wallMat);
        engine.addBox(6, 1.65, -46, 1.4, 3.3, 1.4, wallMat);

        // ГЛУБОКАЯ КВАДРАТНАЯ НИША-ПОЛКА В ТОРЦЕ (z = -58, как на 1-м фото)
        engine.addBox(-6.6, 1.65, -58, 11.2, 3.3, 0.6, wallMat); // Левая стена
        engine.addBox(6.6, 1.65, -58, 11.2, 3.3, 0.6, wallMat);  // Правая стена
        engine.addBox(0, 0.95, -58.8, 2.0, 1.9, 2.2, wallMat);    // Нижний массивный блок-полка (верх на y=1.9)
        engine.addBox(0, 3.05, -58.8, 2.0, 0.5, 2.2, wallMat);    // Потолок ниши
        engine.addBox(0, 1.65, -60.1, 2.4, 3.3, 0.5, wallMat);    // Задняя стенка глубокой полки

        // Ключ ЛЕЖИТ ПЛАШМЯ НА ГОРИЗОНТАЛЬНОЙ ПОЛКЕ (y = 1.93)
        const keyGroup = new THREE.Group();
        const keyRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.09, 0.025, 8, 16),
            new THREE.MeshBasicMaterial({ color: 0xfacc15 })
        );
        keyRing.rotation.x = Math.PI / 2;
        const keyBlade = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.02, 0.18),
            new THREE.MeshBasicMaterial({ color: 0xfacc15 })
        );
        keyBlade.position.z = -0.14;
        keyGroup.add(keyRing, keyBlade);
        keyGroup.position.set(0, 1.93, -58.3);
        scene.add(keyGroup);

        // Наклонная деревянная лестница (как на 1-м фото, приставляется к краю полки)
        const fullLadder = new THREE.Group();
        const railL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.25, 0.08), woodMat);
        railL.position.set(-0.32, 1.12, 0);
        const railR = railL.clone();
        railR.position.x = 0.32;
        fullLadder.add(railL, railR);
        for (let s = 0.28; s <= 1.95; s += 0.32) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.06, 0.08), woodMat);
            step.position.set(0, s, 0);
            fullLadder.add(step);
        }
        fullLadder.position.set(0, 0, -56.9);
        fullLadder.rotation.x = -0.34;
        fullLadder.visible = false;
        scene.add(fullLadder);

        engine.interactables.push({
            name: 'КВАДРАТНАЯ НИША',
            pos: new THREE.Vector3(0, 1.6, -57.2),
            radius: 3.0,
            active: true,
            onInteract: function () {
                if (!ladderPlaced) {
                    if (ladderPartsCollected >= 3) {
                        ladderPlaced = true;
                        fullLadder.visible = true;
                        engine.removeItem('ladder_part');
                        engine.removeItem('ladder_part');
                        engine.removeItem('ladder_part');
                        this.name = 'ЗАБРАТЬСЯ ПО ЛЕСТНИЦЕ';
                    }
                } else if (!keyCollected) {
                    this.active = false;
                    // Анимация подъема по лестнице -> взятие ключа с полки -> спуск
                    engine.startClimbAnimation(
                        new THREE.Vector3(0, 1.68, -55.8),
                        new THREE.Vector3(0, 2.55, -57.1),
                        () => {
                            keyCollected = true;
                            keyGroup.visible = false;
                            engine.addItem({
                                id: 'level0_key',
                                name: 'КЛЮЧ СЕКТОРА 0',
                                icon: '🔑',
                                desc: 'Ключ от западной двери к сетке ям.'
                            });
                        },
                        () => {}
                    );
                }
            }
        });

        // 5. ДАЛЕКАЯ ЗАПАДНАЯ ДВЕРЬ «ВОТ ДВЕРЬ» И ПРИСТРОЙКА С СЕТКОЙ ЯМ (x: -36..-62, z: -10..-26)
        const doorMat = new THREE.MeshLambertMaterial({ color: 0x4b5563 });
        doorMesh = engine.addBox(-36, 1.65, -18, 0.4, 3.3, 4.0, doorMat, true);
        doorCollider = engine.colliders[engine.colliders.length - 1];

        engine.interactables.push({
            name: 'ЗАПЕРТАЯ ДВЕРЬ',
            pos: new THREE.Vector3(-35.2, 1.5, -18),
            radius: 3.0,
            active: true,
            onInteract: function () {
                if (doorOpened) return;
                if (engine.hasItem('level0_key')) {
                    doorOpened = true;
                    this.active = false;
                    doorMesh.visible = false;
                    const idx = engine.colliders.indexOf(doorCollider);
                    if (idx !== -1) engine.colliders.splice(idx, 1);
                }
            }
        });

        // Стены левой пристройки с сеткой квадратных ям (Pitfalls)
        engine.addBox(-49, 1.65, -10, 26, 3.3, 0.6, wallMat);
        engine.addBox(-49, 1.65, -26, 26, 3.3, 0.6, wallMat);
        engine.addBox(-62, 1.65, -18, 0.6, 3.3, 16, wallMat);

        // Сетка квадратных ям слева за дверью (как на твоей карте)
        const pitMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        for (let px = -42; px >= -58; px -= 4.5) {
            for (let pz = -13; pz >= -23; pz -= 4.5) {
                const pit = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), pitMat);
                pit.rotation.x = -Math.PI / 2;
                pit.position.set(px, 0.02, pz);
                scene.add(pit);
            }
        }

        buildSubLevelMazeAndHouse();
    }
    function addWallArrow(x, y, z, rotY) {
        const arrowGroup = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.06), mat);
        const head1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.06), mat);
        head1.position.set(0.32, 0.14, 0);
        head1.rotation.z = -0.65;
        const head2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.06), mat);
        head2.position.set(0.32, -0.14, 0);
        head2.rotation.z = 0.65;
        arrowGroup.add(shaft, head1, head2);
        arrowGroup.position.set(x, y, z);
        arrowGroup.rotation.y = rotY;
        scene.add(arrowGroup);
    }

    function buildSubLevelMazeAndHouse() {
        const subFloor = new THREE.Mesh(new THREE.PlaneGeometry(90, 110), carpetMat);
        subFloor.rotation.x = -Math.PI / 2;
        subFloor.position.set(120, 0, -20);
        scene.add(subFloor);

        const subCeil = new THREE.Mesh(new THREE.PlaneGeometry(90, 110), ceilingMat);
        subCeil.rotation.x = Math.PI / 2;
        subCeil.position.set(120, 3.4, -20);
        scene.add(subCeil);

        engine.addBox(120, 1.7, 30, 48, 3.4, 0.6, wallMat);
        engine.addBox(96, 1.7, -12, 0.6, 3.4, 84, wallMat);
        engine.addBox(144, 1.7, -12, 0.6, 3.4, 84, wallMat);

        engine.addBox(112, 1.7, 14, 0.5, 3.4, 24, wallMat);
        engine.addBox(128, 1.7, 10, 0.5, 3.4, 26, wallMat);
        engine.addBox(104, 1.7, 2, 16, 3.4, 0.5, wallMat);
        engine.addBox(120, 1.7, -4, 16, 3.4, 0.5, wallMat);
        engine.addBox(136, 1.7, -12, 16, 3.4, 0.5, wallMat);
        engine.addBox(110, 1.7, -18, 0.5, 3.4, 20, wallMat);
        engine.addBox(126, 1.7, -24, 0.5, 3.4, 22, wallMat);
        engine.addBox(104, 1.7, -34, 16, 3.4, 0.5, wallMat);
        engine.addBox(134, 1.7, -38, 20, 3.4, 0.5, wallMat);

        for (let lz = 22; lz >= -48; lz -= 14) {
            const l = new THREE.PointLight(0xffe9a6, 0.55, 16);
            l.position.set(120, 3.0, lz);
            scene.add(l);
        }

        addWallArrow(112.35, 1.55, 8, Math.PI / 2);
        addWallArrow(120, 1.55, -3.65, 0);
        addWallArrow(128.35, 1.55, -10, Math.PI / 2);
        addWallArrow(125.65, 1.55, -24, Math.PI / 2);
        addWallArrow(116, 1.55, -34.35, Math.PI / 2);

        const bacGroup = new THREE.Group();
        const bacMat = new THREE.MeshLambertMaterial({ color: 0x060606 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.75, 7), bacMat);
        body.position.y = 1.38;
        const headLoop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12), bacMat);
        headLoop.position.y = 2.65;
        const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), bacMat);
        armL.position.set(-0.42, 1.85, 0);
        armL.rotation.z = 0.38;
        const armR = armL.clone();
        armR.position.x = 0.42;
        armR.rotation.z = -0.38;
        bacGroup.add(body, headLoop, armL, armR);
        bacGroup.position.set(120, 0, 27);
        bacGroup.visible = false;
        scene.add(bacGroup);
        bacteriaMesh = bacGroup;
        const houseWallMat = new THREE.MeshLambertMaterial({ color: 0xc4ba9d });
        const woodFloorMat = new THREE.MeshLambertMaterial({ color: 0x5c3d24 });

        engine.addBox(110, 2.6, -60, 0.6, 5.2, 18, houseWallMat);
        engine.addBox(130, 2.6, -60, 0.6, 5.2, 18, houseWallMat);
        engine.addBox(120, 2.6, -69, 20, 5.2, 0.6, houseWallMat);
        engine.addBox(120, 2.4, -62, 19.4, 0.25, 11, woodFloorMat);

        for (let i = 0; i < 8; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.65), woodFloorMat);
            step.position.set(128.2, 0.15 + i * 0.3, -52.5 - i * 0.55);
            scene.add(step);
        }

        const ventMat = new THREE.MeshLambertMaterial({ color: 0x374151 });
        engine.addBox(120, 3.85, -68.2, 2.4, 0.4, 1.4, ventMat);

        engine.interactables.push({
            name: 'ВЕНТИЛЯЦИОННЫЙ ПРОХОД',
            pos: new THREE.Vector3(120, 3.2, -67.2),
            radius: 2.8,
            active: true,
            onInteract: function () {
                if (engine.isCrouching()) {
                    bacteriaActive = false;
                    alert('СЕКТОР 0 ПРОЙДЕН!');
                    location.reload();
                }
            }
        });
    }

    function update(dt, elapsed, playerPos) {
        // Провал в западные ямы за дверью (x < -41)
        if (!inSubLevel && doorOpened && playerPos.x < -41.0) {
            inSubLevel = true;
            bacteriaActive = true;
            bacteriaMesh.visible = true;
            engine.setPlayerPos(120, 1.68, 10, 0);
            bacteriaMesh.position.set(120, 0, 27);
        }

        // Подъем на 2-й этаж дома
        if (inSubLevel && playerPos.x > 126.8 && playerPos.z < -51.5 && playerPos.z > -58) {
            const climbProgress = Math.min(1, Math.max(0, (-52 - playerPos.z) / 4.6));
            const floorOffset = climbProgress * 2.5;
            playerPos.y = (engine.isCrouching() ? 0.85 : 1.68) + floorOffset;
        } else if (inSubLevel && playerPos.z <= -57 && playerPos.y > 2.6) {
            playerPos.y = (engine.isCrouching() ? 0.85 : 1.68) + 2.5;
        }

        // Погоня Бактерии
        if (bacteriaActive && bacteriaMesh) {
            const target = new THREE.Vector3(playerPos.x, 0, playerPos.z);
            const dir = target.sub(bacteriaMesh.position);
            const dist = dir.length();

            if (dist > 1.15) {
                dir.normalize();
                bacteriaMesh.position.addScaledVector(dir, 4.9 * dt);
                bacteriaMesh.lookAt(playerPos.x, 0, playerPos.z);
            } else {
                bacteriaActive = false;
                engine.triggerMonsterDeath(bacteriaMesh);
            }
        }
    }

    function startGameplay() {
        engine.setPlayerPos(18, 1.68, 14, 0);
    }

    window.addEventListener('DOMContentLoaded', buildLevel);

    return {
        getMenuCameraPos: () => MENU_CAM_POS,
        startGameplay,
        update
    };
})();
