const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('nav-menu');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
}));

const MAX_SPEED = 450;
const CRASH_SPEED = 500;
const TURN_SPEED = 1.5;
const GRAVITY = 20.0;

let scene, camera, renderer, clock;
let planeGroup, terrainMesh;
let simplex = new SimplexNoise();
let particles = [];

let isGameOver = false;
let crashState = {
    active: false,
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3()
};

const inputs = { w:0, s:0, a:0, d:0, q:0, e:0, shift:0, space:0 };

const physics = {
    pos: new THREE.Vector3(0, 500, 0),
    quat: new THREE.Quaternion(),
    speed: 0,
    throttle: 0,
    rotVel: { x:0, y:0, z:0 }
};

function init() {
    const container = document.getElementById('fsim-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.00025);

    camera = new THREE.PerspectiveCamera(75, container.offsetWidth/container.offsetHeight, 1, 50000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(100, 2000, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.far = 5000;
    sun.shadow.camera.top = 2000;
    sun.shadow.camera.bottom = -2000;
    sun.shadow.camera.left = -2000;
    sun.shadow.camera.right = 2000;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x404040, 0.6));

    createStaticTerrain();
    createOriginalPlane();

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', e => onKey(e, 1));
    document.addEventListener('keyup', e => onKey(e, 0));

    animate();
}

function createOriginalPlane() {
    planeGroup = new THREE.Group();
    const s = 2;

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5*s, 1*s, 8*s, 16),
        new THREE.MeshStandardMaterial({ color: 0x1E90FF })
    );

    body.rotation.x = Math.PI/2;
    body.castShadow = true;
    planeGroup.add(body);

    const wings = new THREE.Mesh(
        new THREE.BoxGeometry(12*s, 0.2*s, 2*s),
        new THREE.MeshStandardMaterial({ color: 0x1E90FF })
    );

    wings.castShadow = true;
    planeGroup.add(wings);

    const vTail = new THREE.Mesh(
        new THREE.BoxGeometry(0.2*s, 3*s, 1.5*s),
        new THREE.MeshStandardMaterial({ color: 0x1E90FF })
    );

    vTail.position.set(0, 1.5*s, 3.5*s);
    planeGroup.add(vTail);

    const hTail = new THREE.Mesh(
        new THREE.BoxGeometry(4*s, 0.2*s, 1.5*s),
        new THREE.MeshStandardMaterial({ color: 0x1E90FF })
    );

    hTail.position.set(0, 0.5*s, 3.5*s);
    planeGroup.add(hTail);

    const prop = new THREE.Mesh(
        new THREE.BoxGeometry(0.2*s, 3.5*s, 0.2*s),
        new THREE.MeshStandardMaterial({ color: 0xFFD700 })
    );

    prop.position.set(0, 0, -4*s);
    planeGroup.add(prop);

    scene.add(planeGroup);
}

function createStaticTerrain() {
    const size = 50000;
    const segs = 250;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI/2);
    const colors = [];
    const pos = geo.attributes.position;

    for(let i=0; i<pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        let h = simplex.noise2D(x*0.0002, z*0.0002) * 800;
        h += simplex.noise2D(x*0.001, z*0.001) * 100;
        h += simplex.noise2D(x*0.01, z*0.01) * 10;

        if (h < -100) h = -100;

        pos.setY(i, h);

        if (h < -20) {
            colors.push(0.1, 0.3, 0.8);
        } else if (h < 150) {
            colors.push(0.1, 0.5, 0.1);
        } else if (h < 500) {
            colors.push(0.4, 0.3, 0.2);
        } else {
            colors.push(1, 1, 1);
        }
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        flatShading: true
    });

    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
}

function onKey(e, v) {
    const k = e.key.toLowerCase();
    if(k==='w') inputs.w = v;
    if(k==='s') inputs.s = v;
    if(k==='a') inputs.a = v;
    if(k==='d') inputs.d = v;
    if(k==='q') inputs.q = v;
    if(k==='e') inputs.e = v;
    if(k==='shift') inputs.shift = v;
    if(k===' ') inputs.space = v;
    if(v && k==='v') resetGame();

    if([' ', 'arrowup', 'arrowdown'].includes(k)) {
        e.preventDefault();
    }
}

function resetGame() {
    isGameOver = false;
    crashState.active = false;
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('alert-box').style.display = 'none';
    document.getElementById('left-bar').classList.remove('danger');

    physics.pos.set(0, 1500, 0);
    physics.quat.identity();
    physics.throttle = 0.5;
    physics.speed = 300;
    physics.rotVel = {x:0, y:0, z:0};
    planeGroup.position.copy(physics.pos);
    planeGroup.rotation.set(0,0,0);

    particles.forEach(p => scene.remove(p));
    particles = [];
}

function getTerrainHeight(x, z) {
    let h = simplex.noise2D(x*0.0002, z*0.0002) * 800;
    h += simplex.noise2D(x*0.001, z*0.001) * 100;
    h += simplex.noise2D(x*0.01, z*0.01) * 10;
    
    if (h < -100) h = -100;
    return h;
}

function triggerCrash(reason) {
    if (crashState.active) return;
    isGameOver = true;
    crashState.active = true;

    document.querySelector('#game-over p').innerText = reason;
    document.getElementById('game-over').style.display = 'flex';

    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(physics.quat);
    crashState.velocity = fwd.multiplyScalar(physics.speed);
    crashState.spin.set(
        Math.random()-0.5,
        Math.random()-0.5,
        Math.random()-0.5
    ).multiplyScalar(5);

    spawnExplosion(physics.pos);
}

function spawnExplosion(pos) {
    const geo = new THREE.DodecahedronGeometry(10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    for (let i=0; i<10; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(pos);
        const vel = new THREE.Vector3(
            (Math.random()-0.5)*100,
            (Math.random()-0.5)*100,
            (Math.random()-0.5)*100
        );
        scene.add(m);
        particles.push({ mesh: m, vel: vel, life: 2.0 });
    }
}

function updateParticles(dt) {
    for(let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
        p.mesh.rotation.x += dt * 5;
        p.mesh.scale.multiplyScalar(0.95);

        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
}

function updatePhysics(dt) {
    if(crashState.active) {
        crashState.velocity.y -= GRAVITY * 5 * dt;
        crashState.velocity.multiplyScalar(0.99);

        planeGroup.position.add(crashState.velocity.clone().multiplyScalar(dt));

        planeGroup.rotation.x += crashState.spin.x * dt;
        planeGroup.rotation.y += crashState.spin.y * dt;
        planeGroup.rotation.z += crashState.spin.z * dt;

        const h = getTerrainHeight(planeGroup.position.x, planeGroup.position.z);

        if(planeGroup.position.y < h + 5) {
            planeGroup.position.y = h + 5;
            crashState.velocity.y *= -0.5;
            crashState.velocity.multiplyScalar(0.6);
            spawnExplosion(planeGroup.position);
        }
        return;
    }

    if(inputs.shift) physics.throttle += 0.3 * dt;
    if(inputs.space) physics.throttle -= 0.3 * dt;
    physics.throttle = Math.max(0, Math.min(1, physics.throttle));

    const targetSpeed = physics.throttle * MAX_SPEED * 1.2;
    physics.speed += (targetSpeed - physics.speed) * 0.5 * dt;

    const forward = new THREE.Vector3(0,0,-1).applyQuaternion(physics.quat);
    physics.speed -= forward.y * GRAVITY * 3 * dt;

    const hud = document.getElementById('left-bar');
    const alert = document.getElementById('alert-box');
    if(physics.speed > MAX_SPEED) {
        hud.classList.add('danger');
        alert.style.display = 'block';
        if(physics.speed > CRASH_SPEED) triggerCrash("STRUCTUWAL OVERWOAD :C");
    } else {
        hud.classList.remove('danger');
        alert.style.display = 'none';
    }

    const pitch = inputs.s - inputs.w;
    const roll = inputs.a - inputs.d;
    const yaw = inputs.q - inputs.e;

    physics.rotVel.x += pitch * TURN_SPEED * dt;
    physics.rotVel.z += roll * TURN_SPEED * 2.0 * dt;
    physics.rotVel.y += yaw * TURN_SPEED * 0.5 * dt;
    
    physics.rotVel.y += physics.rotVel.z * 0.5 * dt;

    physics.rotVel.x *= 0.95;
    physics.rotVel.z *= 0.95;
    physics.rotVel.y *= 0.95;

    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), physics.rotVel.x * dt);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), physics.rotVel.y * dt);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), physics.rotVel.z * dt);
    physics.quat.multiply(qx).multiply(qz).premultiply(qy);

    const move = forward.clone().multiplyScalar(physics.speed * dt);
    
    const lift = Math.min(physics.speed / 200, 1.0);
    const drop = new THREE.Vector3(0, -GRAVITY * (1-lift) * 5 * dt, 0);
    
    physics.pos.add(move).add(drop);

    const h = getTerrainHeight(physics.pos.x, physics.pos.z);
    if(physics.pos.y < h + 5) {
        triggerCrash("YOU CWASHED :C");
    }

    planeGroup.position.copy(physics.pos);
    planeGroup.quaternion.copy(physics.quat);

    planeGroup.children[4].rotation.y += physics.throttle + 0.2;
}

function updateHUD() {
    if(crashState.active) return;

    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(physics.quat);
    const euler = new THREE.Euler().setFromQuaternion(physics.quat);

    let hdg = Math.round(THREE.MathUtils.radToDeg(-euler.y));
    if(hdg < 0) hdg += 360;

    document.getElementById('hud-hdg').innerText = hdg.toString().padStart(3, '0');
    document.getElementById('hud-spd').innerText = Math.round(physics.speed);
    document.getElementById('hud-alt').innerText = Math.round(physics.pos.y);
    document.getElementById('hud-thr').innerText = Math.round(physics.throttle * 100) + "%";
    document.getElementById('hud-vs').innerText = Math.round(fwd.y * physics.speed);
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    
    updatePhysics(dt);
    updateParticles(dt);
    updateHUD();

    if (!crashState.active) {
        const offset = new THREE.Vector3(0, 10, 30).applyQuaternion(physics.quat);
        const target = physics.pos.clone().add(offset);
        camera.position.lerp(target, 0.1);
        camera.lookAt(physics.pos);
    } else {
        camera.lookAt(planeGroup.position);
    }

    renderer.render(scene, camera);
}

function onResize() {
    const container = document.getElementById('fsim-container');
    camera.aspect = container.offsetWidth / container.offsetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.offsetWidth, container.offsetHeight);
}

init();