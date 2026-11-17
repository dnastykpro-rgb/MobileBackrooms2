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

    function buildLevel() {
        engine = window.BackroomsEngine;
        scene = engine.getScene();

        const carpetTex = engine.loadTexture('./carpet_0.png', 24, 24);
        const wallTex = engine.loadTexture('./wall_0.png', 4, 1);

        carpetMat = new THREE.MeshStandardMaterial({ map: carpetTex, color: 0xd9cf8f, roughness: 0.95 });
        wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xe8de9a, roughness: 0.85 });
        ceilingMat = new THREE.MeshStandardMaterial({ color: 0x9c9466, roughness: 0.9 });

        // Пол и потолок Уровня 0
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), carpetMat);
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);

        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), ceilingMat);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 3.2;
        scene.add(ceiling);

        // Лампы на потолке
        const lampCoords = [[0, 1], [0, -5], [-8, -10], [8, -10], [0, -18], [0, -26], [-10, -22]];
        lampCoords.forEach(([lx, lz]) => {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffe2 }));
            panel.position.set(lx, 3.16, lz);
            scene.add(panel);

            const light = new THREE.PointLight(0xfff0aa, 1.0, 14);
            light.position.set(lx, 2.7, lz);
            scene.add(light);
        });

        // Внешние стены и стартовый коридор (фон главного меню)
        engine.addBox(0, 1.6, 8, 28, 3.2, 0.5, wallMat);
        engine.addBox(-14, 1.6, -12, 0.5, 3.2, 40, wallMat);
        engine.addBox(14, 1.6, -12, 0.5, 3.2, 40, wallMat);

        // Колонны в кадре меню и стартовой зоне
        engine.addBox(-3.5, 1.6, 0, 1.2, 3.2, 1.2, wallMat);
        engine.addBox(3.5, 1.6, 0, 1.2, 3.2, 1.2, wallMat);
        engine.addBox(-3.5, 1.6, -6, 1.2, 3.2, 1.2, wallMat);
        engine.addBox(3.5, 1.6, -6, 1.2, 3.2, 1.2, wallMat);

        // Перегородки лабиринта
        engine.addBox(-8, 1.6, -4, 5, 3.2, 0.4, wallMat);
        engine.addBox(8, 1.6, -4, 5, 3.2, 0.4, wallMat);
        engine.addBox(-7, 1.6, -12, 0.4, 3.2, 8, wallMat);
        engine.addBox(7, 1.6, -12, 0.4, 3.2, 8, wallMat);

        // Сбор лестницы (3 части по лабиринту)
        const partPositions = [
            new THREE.Vector3(-10, 0.3, 2),
            new THREE.Vector3(10, 0.3, -1),
            new THREE.Vector3(-10, 0.3, -14)
        ];
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c5328, roughness: 0.8 });

        partPositions.forEach((pos, idx) => {
            const partMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 1.4), woodMat);
            partMesh.position.copy(pos);
            partMesh.rotation.y = 0.5 + idx;
            scene.add(partMesh);

            engine.interactables.push({
                pos: pos,
                radius: 2.5,
                active: true,
                prompt: '[ ВЗЯТЬ ЧАСТЬ ЛЕСТНИЦЫ ]',
                onInteract: function () {
                    this.active = false;
                    partMesh.visible = false;
                    ladderPartsCollected++;
                    engine.addItem({
                        id: 'ladder_part',
                        name: 'ЧАСТЬ ЛЕСТНИЦЫ',
                        icon: '🪜',
                        desc: 'Деревянная секция приставной лестницы.'
                    });
                    if (ladderPartsCollected < 3) {
                        engine.setObjective(`Соберите части лестницы (${ladderPartsCollected}/3) и найдите ключ в стене.`);
                    } else {
                        engine.setObjective('Все части собраны! Найдите квадратную дыру в стене с ключом.');
                    }
                }
            });
        });
        // Стена с квадратной дырой на высоте и ключом
        engine.addBox(-3, 1.6, -14, 4.8, 3.2, 0.5, wallMat);
        engine.addBox(3, 1.6, -14, 4.8, 3.2, 0.5, wallMat);
        engine.addBox(0, 0.9, -14, 1.2, 1.8, 0.5, wallMat);
        engine.addBox(0, 2.9, -14, 1.2, 0.6, 0.5, wallMat);

        // Ключ внутри квадратной дыры на высоте 2.05м
        const keyMesh = new THREE.Mesh(
            new THREE.TorusGeometry(0.14, 0.04, 8, 16),
            new THREE.MeshBasicMaterial({ color: 0xfacc15 })
        );
        keyMesh.position.set(0, 2.05, -13.9);
        scene.add(keyMesh);

        // Собранная лестница (изначально скрыта)
        const woodMatLadder = new THREE.MeshStandardMaterial({ color: 0x7c5328, roughness: 0.8 });
        const fullLadder = new THREE.Group();
        const railL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.08), woodMatLadder);
        railL.position.set(-0.3, 1.15, 0);
        const railR = railL.clone();
        railR.position.x = 0.3;
        fullLadder.add(railL, railR);

        for (let s = 0.3; s <= 2.0; s += 0.35) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.08), woodMatLadder);
            step.position.set(0, s, 0);
            fullLadder.add(step);
        }
        fullLadder.position.set(0, 0, -13.3);
        fullLadder.rotation.x = -0.22;
        fullLadder.visible = false;
        scene.add(fullLadder);

        engine.interactables.push({
            pos: new THREE.Vector3(0, 1.5, -13.0),
            radius: 2.6,
            active: true,
            prompt: '[ ОСМОТРЕТЬ КВАДРАТНУЮ ДЫРУ ]',
            onInteract: function () {
                if (!ladderPlaced) {
                    if (ladderPartsCollected >= 3) {
                        ladderPlaced = true;
                        fullLadder.visible = true;
                        engine.removeItem('ladder_part');
                        engine.removeItem('ladder_part');
                        engine.removeItem('ladder_part');
                        this.prompt = '[ ВЗЯТЬ КЛЮЧ ИЗ НИШИ ]';
                        engine.setObjective('Лестница установлена! Заберите ключ из квадратной дыры.');
                    } else {
                        engine.setObjective(`Слишком высоко! Собрано частей лестницы: ${ladderPartsCollected}/3.`);
                    }
                } else if (!keyCollected) {
                    keyCollected = true;
                    keyMesh.visible = false;
                    this.active = false;
                    engine.addItem({
                        id: 'level0_key',
                        name: 'КЛЮЧ СЕКТОРА 0',
                        icon: '🔑',
                        desc: 'Тяжелый металлический ключ от двери в сектор ям.'
                    });
                    engine.setObjective('Ключ получен! Найдите запертую дверь в глубине лабиринта.');
                }
            }
        });

        // Запертая дверь и комната с квадратными ямами (Pitfalls)
        engine.addBox(-5, 1.6, -20, 8, 3.2, 0.5, wallMat);
        engine.addBox(5, 1.6, -20, 8, 3.2, 0.5, wallMat);

        const doorMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6 });
        doorMesh = engine.addBox(0, 1.6, -20, 2.0, 3.2, 0.3, doorMat, true);
        doorCollider = engine.colliders[engine.colliders.length - 1];

        engine.interactables.push({
            pos: new THREE.Vector3(0, 1.5, -19.5),
            radius: 2.6,
            active: true,
            prompt: '[ ОТКРЫТЬ ДВЕРЬ ]',
            onInteract: function () {
                if (doorOpened) return;
                if (engine.hasItem('level0_key')) {
                    doorOpened = true;
                    this.active = false;
                    doorMesh.visible = false;
                    const idx = engine.colliders.indexOf(doorCollider);
                    if (idx !== -1) engine.colliders.splice(idx, 1);
                    engine.setObjective('Дверь открыта. Осторожно: впереди квадратные ямы!');
                } else {
                    engine.setObjective('Дверь заперта. Нужен ключ из ниши в стене.');
                }
            }
        });

        // Черные квадратные ямы за дверью
        const pitMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        const pitCoords = [[-2.5, -24], [2.5, -24], [0, -27], [-3, -30], [3, -30]];
        pitCoords.forEach(([px, pz]) => {
            const pit = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), pitMat);
            pit.rotation.x = -Math.PI / 2;
            pit.position.set(px, 0.02, pz);
            scene.add(pit);
        });

        buildSubLevelAndHouse();
    }
    function buildSubLevelAndHouse() {
        const subFloor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), carpetMat);
        subFloor.rotation.x = -Math.PI / 2;
        subFloor.position.set(100, 0, 0);
        scene.add(subFloor);

        const subCeil = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), ceilingMat);
        subCeil.rotation.x = Math.PI / 2;
        subCeil.position.set(100, 3.4, 0);
        scene.add(subCeil);

        // Коридоры нижнего яруса (x вокруг 100)
        engine.addBox(96, 1.7, -15, 0.5, 3.4, 40, wallMat);
        engine.addBox(104, 1.7, -15, 0.5, 3.4, 40, wallMat);
        engine.addBox(100, 1.7, 5, 8.5, 3.4, 0.5, wallMat);

        // Стрелочки на стенах
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        [-4, -12, -20, -28].forEach((az) => {
            const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 1.2), arrowMat);
            arrow.position.set(96.3, 1.5, az);
            scene.add(arrow);

            const l = new THREE.PointLight(0xffe89e, 0.8, 12);
            l.position.set(100, 2.9, az);
            scene.add(l);
        });

        // Сущность Бактерия
        const bacGroup = new THREE.Group();
        const bacMat = new THREE.MeshBasicMaterial({ color: 0x080808 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.6, 6), bacMat);
        body.position.y = 1.3;
        const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), bacMat);
        arm1.position.set(-0.4, 1.8, 0);
        arm1.rotation.z = 0.4;
        const arm2 = arm1.clone();
        arm2.position.x = 0.4;
        arm2.rotation.z = -0.4;
        bacGroup.add(body, arm1, arm2);
        bacGroup.position.set(100, 0, 3);
        bacGroup.visible = false;
        scene.add(bacGroup);
        bacteriaMesh = bacGroup;

        // Интерьер двухэтажного дома в конце коридора
        const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xc2b89b, roughness: 0.9 });
        const woodFloorMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.85 });

        engine.addBox(92, 2.5, -42, 0.5, 5, 14, houseWallMat);
        engine.addBox(108, 2.5, -42, 0.5, 5, 14, houseWallMat);
        engine.addBox(100, 2.5, -49, 16, 5, 0.5, houseWallMat);

        // Второй этаж дома (перекрытие на высоте 2.4м)
        engine.addBox(100, 2.4, -44, 15.5, 0.25, 9, woodFloorMat);

        // Узкая лестница на второй этаж
        for (let i = 0; i < 8; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.6), woodFloorMat);
            step.position.set(106, 0.15 + i * 0.3, -36 - i * 0.5);
            scene.add(step);
        }

        // Вентиляционный проход на втором этаже (требует приседа)
        const ventMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.6, roughness: 0.4 });
        engine.addBox(100, 3.8, -48.5, 2.2, 0.4, 1.2, ventMat);

        engine.interactables.push({
            pos: new THREE.Vector3(100, 3.2, -47.5),
            radius: 2.5,
            active: true,
            prompt: '[ ЗАПОЛЗТИ В ВЕНТИЛЯЦИЮ (НУЖЕН ПРИСЕД) ]',
            onInteract: function () {
                if (engine.isCrouching()) {
                    bacteriaActive = false;
                    alert('ВЫ ПРОШЛИ УРОВЕНЬ 0! Переход на Уровень 1 (Обитаемая зона)...');
                    location.reload();
                } else {
                    engine.setObjective('Вентиляция слишком низкая! Нажмите ПРИСЕД, чтобы залезть.');
                }
            }
        });
    }

    function update(dt, elapsed, playerPos) {
        // Провал в яму на нижний ярус
        if (!inSubLevel && doorOpened && playerPos.z < -22.8) {
            inSubLevel = true;
            bacteriaActive = true;
            bacteriaMesh.visible = true;
            engine.setPlayerPos(100, 1.68, 0, 0);
            bacteriaMesh.position.set(100, 0, 4.2);
            engine.setObjective('ВЫ УПАЛИ В ЯМУ! Бегите по стрелочкам на стенах — сзади Бактерия!');
        }

        // Подъем по узкой лестнице на 2-й этаж дома
        if (inSubLevel && playerPos.x > 104.5 && playerPos.z < -35 && playerPos.z > -41) {
            const climbProgress = Math.min(1, Math.max(0, (-35.5 - playerPos.z) / 4.2));
            const floorOffset = climbProgress * 2.5;
            playerPos.y = (engine.isCrouching() ? 0.85 : 1.68) + floorOffset;
        } else if (inSubLevel && playerPos.z <= -40 && playerPos.y > 2.6) {
            playerPos.y = (engine.isCrouching() ? 0.85 : 1.68) + 2.5;
        }

        // Погоня Бактерии
        if (bacteriaActive && bacteriaMesh) {
            const target = new THREE.Vector3(playerPos.x, 0, playerPos.z);
            const dir = target.sub(bacteriaMesh.position);
            const dist = dir.length();

            if (dist > 0.9) {
                dir.normalize();
                bacteriaMesh.position.addScaledVector(dir, 5.1 * dt);
                bacteriaMesh.lookAt(playerPos.x, 0, playerPos.z);
            } else {
                bacteriaActive = false;
                alert('БАКТЕРИЯ ДОГНАЛА ВАС! Попробуйте снова.');
                engine.setPlayerPos(100, 1.68, 0, 0);
                bacteriaMesh.position.set(100, 0, 4.5);
                bacteriaActive = true;
            }
        }
    }

    function startGameplay() {
        engine.setPlayerPos(0, 1.68, 4, 0);
        engine.setObjective('Соберите части лестницы (0/3) и найдите ключ в стене.');
    }

    window.addEventListener('DOMContentLoaded', buildLevel);

    return {
        startGameplay,
        update
    };
})();
