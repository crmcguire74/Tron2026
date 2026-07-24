import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const ui = {
  canvas: $('#scene'), menu: $('#menu'), hud: $('#hud'), briefing: $('#briefing'),
  briefingProtocol: $('#briefingProtocol'), briefingTitle: $('#briefingTitle'), briefingCopy: $('#briefingCopy'),
  enter: $('#enterButton'), settings: $('#settingsPanel'), exit: $('#exitButton'), toast: $('#toast'),
  objectiveLabel: $('#objectiveLabel'), objectiveValue: $('#objectiveValue'), objectiveSub: $('#objectiveSub'),
  modeName: $('#modeName'), score: $('#scoreValue'), healthLabel: $('#healthLabel'), healthValue: $('#healthValue'),
  healthMeter: $('#healthMeter'), energyLabel: $('#energyLabel'), energyValue: $('#energyValue'),
  energyMeter: $('#energyMeter'), abilityLabel: $('#abilityLabel'), abilityHint: $('#abilityHint'),
  reticle: $('#reticle'), hit: $('#hitMarker'), damage: $('.damage-vignette'), speedLines: $('#speedLines'),
  touch: $('#touchControls'), touchAction: $('#touchAction'), xrStatus: $('#xrStatus')
};

const state = {
  phase: 'menu', pendingMode: 'disc', elapsed: 0, score: 0, health: 100, energy: 0,
  wave: 1, enemiesLeft: 0, lap: 1, position: 1, audio: true, volume: .65,
  yaw: 0, pitch: 0, dodge: 0, invulnerable: 0, discReady: true, discCooldown: 0,
  cycleSpeed: 0, cycleBoost: 100, cycleHeat: 0, cycleAngle: 0, lane: 0,
  key: {}, touchX: 0, touchY: 0, lastSpawn: 0
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010507);
scene.fog = new THREE.FogExp2(0x020a0d, 0.025);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 250);
camera.position.set(0, 5.2, 14);

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .78;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .55, .34, .96);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
const world = new THREE.Group();
const combatWorld = new THREE.Group();
const cycleWorld = new THREE.Group();
const menuMachines = new THREE.Group();
scene.add(world, combatWorld, cycleWorld, menuMachines);

const enemies = [];
const discs = [];
const cycles = [];
const effects = [];
const wallSegments = [];

const C = { cyan: 0x5df4ff, cyanHot: 0xd5feff, orange: 0xff4e1a, orangeHot: 0xffa052, ink: 0x010507 };
const mats = {
  black: new THREE.MeshPhysicalMaterial({ color: 0x03080a, metalness: .82, roughness: .18, clearcoat: .65, clearcoatRoughness: .12 }),
  armor: new THREE.MeshPhysicalMaterial({ color: 0x101a1e, metalness: .74, roughness: .24, clearcoat: .8, clearcoatRoughness: .15 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x080c0e, metalness: .3, roughness: .68 }),
  cyan: new THREE.MeshBasicMaterial({ color: C.cyan, toneMapped: false }),
  cyanGlass: new THREE.MeshPhysicalMaterial({ color: C.cyan, emissive: C.cyan, emissiveIntensity: 1.35, transparent: true, opacity: .72, transmission: .08, roughness: .15 }),
  orange: new THREE.MeshBasicMaterial({ color: C.orange, toneMapped: false }),
  orangeGlass: new THREE.MeshPhysicalMaterial({ color: C.orange, emissive: C.orange, emissiveIntensity: 1.5, transparent: true, opacity: .76, roughness: .18 })
};

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 24, 16),
  ico: new THREE.IcosahedronGeometry(1, 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cone: new THREE.ConeGeometry(1, 1, 16)
};

function mesh(geometry, material, scale = [1, 1, 1], position = [0, 0, 0], rotation = [0, 0, 0]) {
  const m = new THREE.Mesh(geometry, material);
  m.scale.set(...scale); m.position.set(...position); m.rotation.set(...rotation);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function neonBar(parent, length, colorMat, position, rotation = [0, 0, 0], width = .035) {
  const bar = mesh(geo.box, colorMat, [width, width, length], position, rotation);
  parent.add(bar); return bar;
}

function createDisc(colorMat = mats.cyan, radius = .58) {
  const g = new THREE.Group();
  const outer = mesh(new THREE.TorusGeometry(radius, .055, 8, 48), colorMat);
  const body = mesh(new THREE.RingGeometry(radius * .49, radius * .88, 48), mats.black);
  const mid = mesh(new THREE.TorusGeometry(radius * .52, .018, 6, 40), colorMat, [1, 1, 1], [0, 0, .012]);
  g.add(outer, body, mid);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const plate = mesh(geo.box, mats.armor, [.1, .22, .025], [Math.cos(a) * radius * .71, Math.sin(a) * radius * .71, .02], [0, 0, a]);
    g.add(plate);
  }
  return g;
}

function createArmoredUnit(hostile = true, tier = 0) {
  const g = new THREE.Group();
  const glow = hostile ? mats.orangeGlass : mats.cyanGlass;
  const core = hostile ? mats.orange : mats.cyan;
  const root = new THREE.Group();
  g.add(root);

  const pelvis = mesh(geo.box, mats.black, [.47, .24, .32], [0, 1.18, 0]);
  const torso = new THREE.Group(); torso.position.y = 1.72;
  torso.add(mesh(geo.box, mats.armor, [.62, .6, .33]));
  torso.add(mesh(geo.box, mats.black, [.42, .43, .37], [0, .02, .03]));
  torso.add(mesh(geo.box, glow, [.055, .42, .035], [0, .02, .41]));
  torso.add(mesh(geo.box, glow, [.3, .045, .035], [0, .28, .41], [0, 0, .2]));
  const reactor = mesh(geo.sphere, core, [.11, .11, .06], [0, .02, .43]);
  torso.add(reactor);

  const head = new THREE.Group(); head.position.y = 2.58;
  head.add(mesh(geo.ico, mats.black, [.34, .4, .36]));
  head.add(mesh(geo.box, glow, [.25, .035, .04], [0, .03, .34]));
  head.add(mesh(geo.box, mats.armor, [.06, .28, .29], [.27, -.02, 0], [0, 0, -.18]));
  head.add(mesh(geo.box, mats.armor, [.06, .28, .29], [-.27, -.02, 0], [0, 0, .18]));
  const halo = mesh(new THREE.TorusGeometry(.42, .025, 6, 32), core, [1, 1, 1], [0, .08, -.14], [Math.PI / 2, 0, 0]);
  head.add(halo);

  const leftArm = limb(.62, .14, glow); leftArm.position.set(-.72, 2.05, 0); leftArm.rotation.z = .12;
  const rightArm = limb(.62, .14, glow); rightArm.position.set(.72, 2.05, 0); rightArm.rotation.z = -.12;
  const leftLeg = limb(.86, .18, glow); leftLeg.position.set(-.3, .92, 0);
  const rightLeg = limb(.86, .18, glow); rightLeg.position.set(.3, .92, 0);

  const shoulderL = mesh(geo.ico, mats.armor, [.32 + tier * .04, .23, .32], [-.72, 2.18, 0]);
  const shoulderR = mesh(geo.ico, mats.armor, [.32 + tier * .04, .23, .32], [.72, 2.18, 0]);
  shoulderL.add(mesh(geo.cone, mats.armor, [.09, .28, .09], [-.75, .15, 0], [0, 0, Math.PI / 2]));
  shoulderR.add(mesh(geo.cone, mats.armor, [.09, .28, .09], [.75, .15, 0], [0, 0, -Math.PI / 2]));

  root.add(pelvis, torso, head, leftArm, rightArm, leftLeg, rightLeg, shoulderL, shoulderR);
  const weapon = createDisc(core, .34); weapon.position.set(.86, 1.68, .1); weapon.rotation.y = Math.PI / 2; root.add(weapon);

  if (tier > 0) {
    const back = new THREE.Group(); back.position.set(0, 1.9, -.35);
    for (let i = -1; i <= 1; i += 2) {
      const fin = mesh(geo.box, mats.armor, [.1, .72, .28], [i * .42, .06, 0], [0, 0, -i * .2]);
      neonBar(fin, .85, glow, [i * .2, 0, .18], [0, 0, 0], .025); back.add(fin);
    }
    root.add(back);
  }

  g.userData = { root, torso, head, leftArm, rightArm, leftLeg, rightLeg, weapon, reactor, hostile, tier, health: 42 + tier * 34, phase: Math.random() * 6.28, speed: 1.4 + Math.random() * .8, attack: Math.random() * 2, dead: false };
  g.scale.setScalar(tier === 2 ? 1.32 : 1);
  return g;
}

function limb(length, radius, glow) {
  const pivot = new THREE.Group();
  const upper = mesh(geo.cyl, mats.rubber, [radius, length * .52, radius], [0, -length * .28, 0]);
  const armor = mesh(geo.box, mats.armor, [radius * 1.4, length * .27, radius * 1.6], [0, -length * .2, .02]);
  const stripe = mesh(geo.box, glow, [radius * .12, length * .42, radius * 1.7], [0, -length * .3, .03]);
  const joint = mesh(geo.sphere, mats.black, [radius * 1.25, radius * 1.25, radius * 1.25], [0, -length * .55, 0]);
  const lower = mesh(geo.cyl, mats.rubber, [radius * .85, length * .45, radius * .85], [0, -length * .76, 0], [0, 0, .05]);
  pivot.add(upper, armor, stripe, joint, lower); return pivot;
}

function createCycle(color = 'cyan', rider = true) {
  const glow = color === 'orange' ? mats.orangeGlass : mats.cyanGlass;
  const core = color === 'orange' ? mats.orange : mats.cyan;
  const g = new THREE.Group();
  const machine = new THREE.Group(); g.add(machine);
  const wheels = [];
  for (const z of [-1.55, 1.55]) {
    const assembly = new THREE.Group(); assembly.position.set(0, .83, z);
    const tire = mesh(new THREE.TorusGeometry(.77, .18, 12, 40), mats.rubber);
    const ring = mesh(new THREE.TorusGeometry(.76, .045, 8, 40), core);
    const hub = mesh(new THREE.CylinderGeometry(.16, .16, .16, 20), mats.armor, [1, 1, 1], [0, 0, 0], [Math.PI / 2, 0, 0]);
    assembly.add(tire, ring, hub);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const vane = mesh(geo.box, mats.armor, [.05, .48, .06], [Math.cos(a) * .35, Math.sin(a) * .35, 0], [0, 0, -a]);
      assembly.add(vane);
    }
    wheels.push(assembly); machine.add(assembly);
  }
  const spine = mesh(geo.box, mats.armor, [.38, .18, 1.45], [0, .82, 0]);
  spine.geometry = new THREE.BoxGeometry(1, 1, 1);
  machine.add(spine);
  const nose = mesh(geo.ico, mats.black, [.52, .42, 1.12], [0, 1.02, -1.16], [0, 0, 0]);
  const tail = mesh(geo.cone, mats.armor, [.47, 1.2, .47], [0, 1.05, 1.25], [Math.PI / 2, 0, 0]);
  machine.add(nose, tail);
  neonBar(machine, 2.7, glow, [.42, 1.08, 0], [0, 0, 0], .04);
  neonBar(machine, 2.7, glow, [-.42, 1.08, 0], [0, 0, 0], .04);
  for (const side of [-1, 1]) {
    const suspension = mesh(geo.box, mats.black, [.08, .08, .74], [side * .42, .67, 0], [0, 0, side * .05]);
    machine.add(suspension);
  }
  const engine = mesh(geo.cyl, mats.armor, [.31, .54, .31], [0, .86, .25], [Math.PI / 2, 0, 0]);
  const engineGlow = mesh(new THREE.TorusGeometry(.29, .035, 8, 32), core, [1, 1, 1], [0, .86, .58]);
  machine.add(engine, engineGlow);

  let pilot = null;
  if (rider) {
    pilot = createArmoredUnit(color === 'orange', 0);
    pilot.scale.setScalar(.55); pilot.position.set(0, 1.18, .25); pilot.rotation.x = -.66;
    pilot.userData.leftArm.rotation.x = -1.25; pilot.userData.rightArm.rotation.x = -1.25;
    machine.add(pilot);
  }
  g.userData = { machine, wheels, pilot, color, speed: 0, angle: 0, lane: 0, targetLane: 0, wallTimer: 0, assembled: 0 };
  return g;
}

function createCombatEnvironment() {
  combatWorld.clear();
  const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x02090c, metalness: .8, roughness: .16, clearcoat: 1, clearcoatRoughness: .1 });
  const floor = mesh(new THREE.CylinderGeometry(20, 21, .35, 64), floorMat, [1, 1, 1], [0, -.22, 0]);
  combatWorld.add(floor);
  const grid = new THREE.GridHelper(42, 42, C.cyan, 0x12363a); grid.position.y = .01; grid.material.opacity = .26; grid.material.transparent = true; combatWorld.add(grid);
  for (let r = 4; r <= 20; r += 4) {
    const ring = mesh(new THREE.TorusGeometry(r, .018, 4, 96), mats.cyan, [1, 1, 1], [0, .025, 0], [Math.PI / 2, 0, 0]);
    ring.material = r % 8 === 0 ? mats.cyan : mats.cyanGlass; combatWorld.add(ring);
  }

  const core = new THREE.Group(); core.position.set(0, 4.8, -16);
  for (let i = 0; i < 5; i++) {
    const r = 3.6 + i * .85;
    const ring = mesh(new THREE.TorusGeometry(r, .1 + i * .02, 8, 64), i % 2 ? mats.armor : mats.cyanGlass, [1, 1, 1], [0, 0, i * -.22]);
    ring.userData.spin = (i % 2 ? -1 : 1) * (.08 + i * .025); core.add(ring);
  }
  const orb = mesh(geo.ico, mats.cyanGlass, [1.8, 1.8, 1.8]); core.add(orb); combatWorld.add(core);
  combatWorld.userData.core = core;

  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const radius = i % 2 ? 18 : 15.5;
    const tower = new THREE.Group(); tower.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius); tower.rotation.y = a;
    const height = 4.5 + (i % 4) * 1.3;
    tower.add(mesh(geo.box, mats.black, [1.1, height / 2, 1.4], [0, height / 2, 0]));
    tower.add(mesh(geo.box, mats.armor, [1.35, .13, 1.62], [0, height, 0]));
    neonBar(tower, height * .8, i % 5 === 0 ? mats.orangeGlass : mats.cyanGlass, [.7, height * .5, 1.45], [Math.PI / 2, 0, 0], .03);
    for (let y = 1; y < height; y += 1.1) tower.add(mesh(geo.box, mats.armor, [1.25, .04, 1.55], [0, y, 0]));
    combatWorld.add(tower);
  }

  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + .2;
    const arch = new THREE.Group(); arch.position.set(Math.sin(a) * 11, 0, Math.cos(a) * 11); arch.rotation.y = a;
    arch.add(mesh(geo.box, mats.armor, [.45, 2.4, .65], [-1.55, 2.4, 0]));
    arch.add(mesh(geo.box, mats.armor, [.45, 2.4, .65], [1.55, 2.4, 0]));
    arch.add(mesh(geo.box, mats.black, [2, .35, .72], [0, 4.8, 0]));
    neonBar(arch, 3.0, mats.cyanGlass, [0, 4.48, .74], [0, Math.PI / 2, 0], .035);
    combatWorld.add(arch);
  }
}

function createCycleEnvironment() {
  cycleWorld.clear(); cycles.length = 0; wallSegments.length = 0;
  const floor = mesh(new THREE.CylinderGeometry(44, 46, .4, 96), mats.black, [1, 1, 1], [0, -.35, 0]); cycleWorld.add(floor);
  const grid = new THREE.GridHelper(100, 50, C.orange, 0x173239); grid.material.transparent = true; grid.material.opacity = .2; cycleWorld.add(grid);
  for (const radius of [18, 22, 26, 30]) {
    const mat = radius === 22 || radius === 26 ? mats.orangeGlass : mats.cyanGlass;
    cycleWorld.add(mesh(new THREE.TorusGeometry(radius, .04, 6, 128), mat, [1, 1, 1], [0, .02, 0], [Math.PI / 2, 0, 0]));
  }
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    const radius = 34 + (i % 3) * 3;
    const pylon = new THREE.Group(); pylon.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius); pylon.rotation.y = a;
    const h = 5 + (i % 6) * 1.4;
    pylon.add(mesh(geo.box, mats.black, [1.5, h / 2, 2.1], [0, h / 2, 0]));
    pylon.add(mesh(geo.box, mats.armor, [1.72, .18, 2.3], [0, h, 0]));
    neonBar(pylon, h * .8, i % 2 ? mats.orangeGlass : mats.cyanGlass, [.95, h / 2, 2.12], [Math.PI / 2, 0, 0], .04);
    cycleWorld.add(pylon);
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const gate = new THREE.Group(); gate.position.set(Math.sin(a) * 24, 0, Math.cos(a) * 24); gate.rotation.y = a;
    gate.add(mesh(geo.box, mats.armor, [.35, 3.3, .5], [-4, 3.3, 0]));
    gate.add(mesh(geo.box, mats.armor, [.35, 3.3, .5], [4, 3.3, 0]));
    gate.add(mesh(geo.box, mats.black, [4.35, .3, .6], [0, 6.6, 0]));
    for (let x = -3.4; x <= 3.4; x += .8) gate.add(mesh(geo.box, mats.orangeGlass, [.02, .28, .07], [x, 6.25, .62]));
    cycleWorld.add(gate);
  }

  for (let i = 0; i < 6; i++) {
    const c = createCycle(i === 0 ? 'cyan' : 'orange');
    c.userData.angle = i * -.085;
    c.userData.lane = (i - 2.5) * .72;
    c.userData.speed = i === 0 ? 0 : .19 + Math.random() * .025;
    c.userData.ai = i !== 0;
    cycles.push(c); cycleWorld.add(c);
  }
}

function createAtmosphere() {
  scene.add(new THREE.HemisphereLight(0x41808a, 0x010204, .34));
  const key = new THREE.DirectionalLight(0xaafaff, 1.8); key.position.set(7, 13, 8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const red = new THREE.PointLight(C.orange, 14, 38, 2); red.position.set(-10, 5, -8); scene.add(red);
  const blue = new THREE.PointLight(C.cyan, 12, 42, 2); blue.position.set(12, 6, 3); scene.add(blue);

  const particles = new THREE.BufferGeometry();
  const points = new Float32Array(1200 * 3);
  for (let i = 0; i < points.length; i += 3) {
    points[i] = (Math.random() - .5) * 90; points[i + 1] = Math.random() * 28; points[i + 2] = (Math.random() - .5) * 90;
  }
  particles.setAttribute('position', new THREE.BufferAttribute(points, 3));
  const p = new THREE.Points(particles, new THREE.PointsMaterial({ color: C.cyan, size: .035, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(p); world.userData.particles = p;
}

function createMenuMachines() {
  const unit = createArmoredUnit(false, 1); unit.scale.setScalar(1.55); unit.position.set(-5.1, -.65, -1.2); unit.rotation.y = .35; menuMachines.add(unit);
  const cycle = createCycle('orange'); cycle.scale.setScalar(1.65); cycle.position.set(5.35, -.35, -2.5); cycle.rotation.y = -.55; menuMachines.add(cycle);
  const cyanRim = new THREE.PointLight(C.cyan, 22, 15, 1.8); cyanRim.position.set(-4.5, 3.2, 3.5);
  const orangeRim = new THREE.PointLight(C.orange, 24, 16, 1.8); orangeRim.position.set(5.7, 2.2, 2.8);
  menuMachines.add(cyanRim, orangeRim);
  menuMachines.userData = { unit, cycle };
}

function spawnWave() {
  enemies.forEach(e => combatWorld.remove(e)); enemies.length = 0;
  const count = Math.min(3 + state.wave, 9);
  for (let i = 0; i < count; i++) {
    const tier = state.wave === 5 && i === count - 1 ? 2 : (state.wave >= 3 && i % 3 === 0 ? 1 : 0);
    const e = createArmoredUnit(true, tier);
    const a = i / count * Math.PI * 2 + Math.random() * .4;
    e.position.set(Math.sin(a) * (10 + Math.random() * 4), 0, Math.cos(a) * (10 + Math.random() * 4));
    e.userData.spawnScale = 0; e.scale.multiplyScalar(.01); enemies.push(e); combatWorld.add(e);
  }
  state.enemiesLeft = count;
  updateHud();
  showToast(state.wave === 5 ? 'WARDEN SIGNAL DETECTED' : `WAVE ${String(state.wave).padStart(2, '0')} MATERIALIZED`);
}

function launchMode(mode) {
  state.pendingMode = mode;
  ui.menu.classList.add('hidden');
  ui.settings.classList.remove('open');
  ui.briefing.classList.add('visible'); ui.briefing.setAttribute('aria-hidden', 'false');
  if (mode === 'disc') {
    ui.briefingProtocol.textContent = 'COMBAT PROTOCOL 01'; ui.briefingTitle.textContent = 'SHATTERED CORE';
    ui.briefingCopy.textContent = 'WASD MOVE · MOUSE AIM · CLICK THROW · RIGHT CLICK RECALL · SPACE DODGE';
    ui.enter.textContent = 'CLICK TO ENGAGE';
  } else {
    ui.briefingProtocol.textContent = 'VELOCITY PROTOCOL 02'; ui.briefingTitle.textContent = 'VECTOR RUN';
    ui.briefingCopy.textContent = 'WASD STEER · SHIFT DRIFT · CLICK BOOST · RIGHT CLICK DEPLOY WALL';
    ui.enter.textContent = 'INITIALIZE MACHINE';
  }
  sound('select');
}

function enterMode() {
  const mode = state.pendingMode;
  state.phase = mode; state.score = 0; state.health = 100; state.energy = 0; state.wave = 1; state.lap = 1;
  state.yaw = 0; state.pitch = 0; state.cycleAngle = 0; state.cycleSpeed = 0; state.cycleBoost = 100; state.cycleHeat = 0;
  ui.briefing.classList.remove('visible'); ui.briefing.setAttribute('aria-hidden', 'true');
  ui.hud.classList.add('visible'); ui.hud.setAttribute('aria-hidden', 'false');
  ui.exit.classList.add('visible'); ui.exit.setAttribute('aria-hidden', 'false');
  if (matchMedia('(pointer: coarse)').matches) ui.touch.classList.add('visible');
  menuMachines.visible = false;
  combatWorld.visible = mode === 'disc'; cycleWorld.visible = mode === 'cycle';
  if (mode === 'disc') {
    camera.position.set(0, 1.75, 7); spawnWave();
    ui.objectiveLabel.textContent = 'WAVE'; ui.modeName.textContent = 'SHATTERED CORE';
    ui.healthLabel.textContent = 'CORE INTEGRITY'; ui.energyLabel.textContent = 'OVERDRIVE';
    ui.abilityLabel.textContent = 'DISC READY'; ui.abilityHint.textContent = 'LMB THROW · RMB RECALL'; ui.touchAction.textContent = 'THROW';
    if (!matchMedia('(pointer: coarse)').matches) ui.canvas.requestPointerLock?.();
  } else {
    ui.objectiveLabel.textContent = 'LAP'; ui.modeName.textContent = 'VECTOR RUN';
    ui.healthLabel.textContent = 'ARMOR INTEGRITY'; ui.energyLabel.textContent = 'BOOST';
    ui.abilityLabel.textContent = 'WALL READY'; ui.abilityHint.textContent = 'LMB BOOST · RMB WALL'; ui.touchAction.textContent = 'BOOST';
    ui.speedLines.classList.add('show');
  }
  updateHud(); startAmbient(); showToast('SYSTEM LINK ESTABLISHED');
}

function exitMode() {
  document.exitPointerLock?.();
  state.phase = 'menu'; ui.menu.classList.remove('hidden'); ui.hud.classList.remove('visible'); ui.exit.classList.remove('visible');
  ui.touch.classList.remove('visible'); ui.speedLines.classList.remove('show'); menuMachines.visible = true; combatWorld.visible = false; cycleWorld.visible = false;
  enemies.forEach(e => combatWorld.remove(e)); enemies.length = 0; discs.forEach(d => scene.remove(d)); discs.length = 0;
  stopAmbient(); sound('select');
}

function throwDisc() {
  if (state.phase !== 'disc' || !state.discReady) return;
  state.discReady = false; state.discCooldown = .35;
  const d = createDisc(mats.cyan, .46); d.position.copy(camera.position);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  d.position.addScaledVector(dir, .7); d.userData = { dir, speed: 27, age: 0, returning: false, hit: new Set() };
  discs.push(d); scene.add(d); ui.abilityLabel.textContent = 'DISC IN FLIGHT'; sound('throw');
}

function recallDisc() {
  for (const d of discs) d.userData.returning = true;
  if (discs.length) { ui.abilityLabel.textContent = 'RECALLING'; sound('recall'); }
}

function updateDiscs(dt) {
  for (let i = discs.length - 1; i >= 0; i--) {
    const d = discs[i], data = d.userData; data.age += dt; d.rotation.z += dt * 18; d.rotation.x = Math.sin(data.age * 12) * .22;
    if (data.age > .85) data.returning = true;
    if (data.returning) data.dir.lerp(new THREE.Vector3().subVectors(camera.position, d.position).normalize(), Math.min(1, dt * 8)).normalize();
    d.position.addScaledVector(data.dir, data.speed * dt);
    const trail = mesh(geo.sphere, mats.cyan, [.055, .055, .055], d.position.toArray()); trail.userData.life = .22; trail.material = mats.cyan; scene.add(trail); effects.push(trail);
    for (const e of enemies) {
      if (e.userData.dead || data.hit.has(e)) continue;
      if (d.position.distanceTo(e.position.clone().add(new THREE.Vector3(0, 1.6, 0))) < 1.2 * e.scale.x) {
        data.hit.add(e); e.userData.health -= data.returning ? 30 : 24; e.userData.flash = .15; state.score += e.userData.tier === 2 ? 500 : 100;
        state.energy = Math.min(100, state.energy + 12); hitFeedback(); sound('hit');
        if (e.userData.health <= 0) destroyEnemy(e);
      }
    }
    if ((data.returning && d.position.distanceTo(camera.position) < .9) || data.age > 3) {
      scene.remove(d); discs.splice(i, 1); state.discReady = true; ui.abilityLabel.textContent = 'DISC READY'; sound('catch');
    }
  }
}

function destroyEnemy(e) {
  if (e.userData.dead) return; e.userData.dead = true; state.enemiesLeft--; state.score += 250 * (e.userData.tier + 1);
  for (let i = 0; i < 18; i++) {
    const shard = mesh(i % 3 ? geo.box : geo.ico, i % 4 ? mats.armor : mats.orange, [.06 + Math.random() * .12, .05 + Math.random() * .18, .05 + Math.random() * .12]);
    shard.position.copy(e.position).add(new THREE.Vector3((Math.random() - .5) * 1.5, .5 + Math.random() * 2.2, (Math.random() - .5) * 1.5));
    shard.userData.life = 1 + Math.random(); shard.userData.velocity = new THREE.Vector3((Math.random() - .5) * 5, 2 + Math.random() * 6, (Math.random() - .5) * 5);
    combatWorld.add(shard); effects.push(shard);
  }
  sound('destroy'); updateHud();
  if (state.enemiesLeft === 0) {
    if (state.wave < 5) { state.wave++; setTimeout(() => state.phase === 'disc' && spawnWave(), 1600); }
    else showToast('CORE STABILIZED · RUN COMPLETE');
  }
}

function updateEnemies(dt, time) {
  for (const e of enemies) {
    const d = e.userData;
    if (d.spawnScale < 1) { d.spawnScale = Math.min(1, d.spawnScale + dt * 1.8); const base = d.tier === 2 ? 1.32 : 1; e.scale.setScalar(Math.max(.01, d.spawnScale * base)); }
    if (d.dead) { e.rotation.z += dt * 3; e.position.y -= dt * 2; e.scale.multiplyScalar(1 - dt * 2.5); if (e.scale.x < .02) e.visible = false; continue; }
    const player = camera.position.clone(); player.y = 0; const toPlayer = player.sub(e.position); const distance = toPlayer.length();
    e.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    if (distance > 3.1) e.position.addScaledVector(toPlayer.normalize(), d.speed * dt);
    d.phase += dt * (4 + d.speed);
    d.leftLeg.rotation.x = Math.sin(d.phase) * .48; d.rightLeg.rotation.x = -Math.sin(d.phase) * .48;
    d.leftArm.rotation.x = -Math.sin(d.phase) * .26; d.rightArm.rotation.x = Math.sin(d.phase) * .26;
    d.torso.rotation.y = Math.sin(d.phase * .5) * .07; d.head.rotation.y = Math.sin(time * 1.6 + d.phase) * .14;
    d.weapon.rotation.z += dt * (distance < 5 ? 12 : 3);
    if (d.flash > 0) { d.flash -= dt; d.reactor.scale.setScalar(1.8); } else d.reactor.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 10);
    d.attack -= dt;
    if (distance < 3.4 && d.attack <= 0) {
      d.attack = 1.5 + Math.random(); d.rightArm.rotation.x = -1.8; damagePlayer(8 + d.tier * 5);
    }
  }
}

function damagePlayer(amount) {
  if (state.invulnerable > 0) return;
  state.health = Math.max(0, state.health - amount); ui.damage.classList.add('show'); setTimeout(() => ui.damage.classList.remove('show'), 180); sound('damage'); updateHud();
  if (state.health <= 0) { state.health = 100; state.score = Math.max(0, state.score - 500); camera.position.set(0, 1.75, 7); showToast('SYSTEM FAILURE · RECONSTITUTING'); }
}

function updateCombat(dt, time) {
  const speed = state.dodge > 0 ? 14 : 6.2;
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const right = new THREE.Vector3(Math.cos(state.yaw), 0, Math.sin(state.yaw));
  const move = new THREE.Vector3();
  if (state.key.KeyW) move.add(forward); if (state.key.KeyS) move.sub(forward); if (state.key.KeyD) move.add(right); if (state.key.KeyA) move.sub(right);
  move.x += state.touchX; move.z += state.touchY;
  if (move.lengthSq()) camera.position.addScaledVector(move.normalize(), speed * dt);
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -17, 17); camera.position.z = THREE.MathUtils.clamp(camera.position.z, -17, 17); camera.position.y = 1.72 + Math.sin(time * 7) * (move.lengthSq() ? .035 : .008);
  camera.rotation.order = 'YXZ'; camera.rotation.y = state.yaw; camera.rotation.x = state.pitch;
  if (state.dodge > 0) state.dodge -= dt; if (state.invulnerable > 0) state.invulnerable -= dt;
  if (state.discCooldown > 0) state.discCooldown -= dt;
  updateEnemies(dt, time); updateDiscs(dt);
  const core = combatWorld.userData.core; if (core) for (const child of core.children) if (child.userData.spin) child.rotation.z += dt * child.userData.spin;
}

function updateCycles(dt, time) {
  const player = cycles[0]; if (!player) return;
  const accelerating = state.key.KeyW || state.touchY < -.25;
  const braking = state.key.KeyS || state.key.ShiftLeft;
  state.cycleSpeed += (accelerating ? .16 : .04) * dt;
  state.cycleSpeed -= (braking ? .22 : .055) * dt;
  state.cycleSpeed = THREE.MathUtils.clamp(state.cycleSpeed, .035, .24);
  if (state.key.KeyA) state.lane -= dt * 5; if (state.key.KeyD) state.lane += dt * 5;
  state.lane += state.touchX * dt * 3.5; state.lane = THREE.MathUtils.clamp(state.lane, -3.2, 3.2);
  state.cycleAngle += state.cycleSpeed * dt * 2.7;
  player.userData.angle = state.cycleAngle; player.userData.lane = THREE.MathUtils.lerp(player.userData.lane, state.lane, dt * 5); player.userData.speed = state.cycleSpeed;
  if (state.cycleAngle > Math.PI * 2) { state.cycleAngle -= Math.PI * 2; state.lap = Math.min(3, state.lap + 1); showToast(state.lap === 3 ? 'FINAL LAP' : `LAP ${state.lap}`); }

  let ahead = 0;
  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i], d = c.userData;
    if (d.ai) {
      d.speed += (0.195 + Math.sin(time * .6 + i) * .012 - d.speed) * dt;
      d.angle += d.speed * dt * 2.7;
      d.targetLane = Math.sin(time * .24 + i * 1.7) * 2.4; d.lane = THREE.MathUtils.lerp(d.lane, d.targetLane, dt * .45);
      if ((d.angle % (Math.PI * 2)) > (state.cycleAngle % (Math.PI * 2))) ahead++;
    }
    placeCycle(c, time, i);
  }
  state.position = Math.min(6, ahead + 1);

  const radius = 24 + player.userData.lane;
  const a = player.userData.angle;
  const pos = new THREE.Vector3(Math.sin(a) * radius, 1.2, Math.cos(a) * radius);
  const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).normalize();
  const desired = pos.clone().addScaledVector(tangent, -7.8).add(new THREE.Vector3(0, 3.8, 0));
  camera.position.lerp(desired, 1 - Math.pow(.002, dt));
  const look = pos.clone().addScaledVector(tangent, 6).add(new THREE.Vector3(0, 1, 0)); camera.lookAt(look);
  state.energy = state.cycleBoost;
  updateWalls(dt);
}

function placeCycle(c, time, index) {
  const d = c.userData, r = 24 + d.lane, a = d.angle;
  c.position.set(Math.sin(a) * r, .02, Math.cos(a) * r); c.rotation.y = a + Math.PI / 2;
  c.rotation.z = -THREE.MathUtils.clamp((d.targetLane - d.lane) * .08, -.18, .18);
  for (const w of d.wheels) w.rotation.z -= d.speed * 18;
  d.machine.position.y = Math.sin(time * 12 + index) * .025;
  if (d.pilot) { d.pilot.userData.head.rotation.x = Math.sin(time * 2 + index) * .03; d.pilot.userData.torso.rotation.z = c.rotation.z * 1.8; }
}

function boostCycle() {
  if (state.phase !== 'cycle' || state.cycleBoost < 8 || state.cycleHeat > 92) return;
  state.cycleSpeed = Math.min(.34, state.cycleSpeed + .055); state.cycleBoost = Math.max(0, state.cycleBoost - 8); state.cycleHeat = Math.min(100, state.cycleHeat + 16);
  sound('boost'); ui.speedLines.classList.add('show');
}

function deployWall() {
  if (state.phase !== 'cycle' || !cycles[0]) return;
  const c = cycles[0], d = c.userData, r = 24 + d.lane, a = d.angle;
  const wall = mesh(geo.box, mats.cyanGlass, [.05, 1.35, 1.3], [Math.sin(a) * r, 1.35, Math.cos(a) * r], [0, a, 0]);
  wall.userData.life = 4.5; cycleWorld.add(wall); wallSegments.push(wall); sound('wall'); ui.abilityLabel.textContent = 'WALL DEPLOYED'; setTimeout(() => state.phase === 'cycle' && (ui.abilityLabel.textContent = 'WALL READY'), 700);
}

function updateWalls(dt) {
  for (let i = wallSegments.length - 1; i >= 0; i--) {
    const w = wallSegments[i]; w.userData.life -= dt; w.material.opacity = Math.min(.8, w.userData.life * .35);
    if (w.userData.life <= 0) { cycleWorld.remove(w); wallSegments.splice(i, 1); }
  }
  state.cycleBoost = Math.min(100, state.cycleBoost + dt * 5); state.cycleHeat = Math.max(0, state.cycleHeat - dt * 10);
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.userData.life -= dt;
    if (e.userData.velocity) { e.userData.velocity.y -= dt * 7; e.position.addScaledVector(e.userData.velocity, dt); e.rotation.x += dt * 5; e.rotation.z += dt * 4; }
    e.scale.multiplyScalar(Math.max(.1, 1 - dt * 2));
    if (e.userData.life <= 0) { e.parent?.remove(e); effects.splice(i, 1); }
  }
}

function updateMenu(dt, time) {
  const target = new THREE.Vector3(Math.sin(time * .09) * 2.2, 4.7 + Math.sin(time * .2) * .25, 14 + Math.cos(time * .11));
  camera.position.lerp(target, dt * .4); camera.lookAt(0, 1.8, -1.2);
  const { unit, cycle } = menuMachines.userData;
  if (unit) {
    unit.userData.head.rotation.y = Math.sin(time * .45) * .3; unit.userData.torso.rotation.y = Math.sin(time * .3) * .06; unit.userData.weapon.rotation.z += dt * .45;
  }
  if (cycle) {
    cycle.position.y = -.8 + Math.sin(time * 1.4) * .04;
    cycle.userData.wheels.forEach(w => w.rotation.z -= dt * .5);
    cycle.userData.machine.rotation.z = Math.sin(time * .55) * .015;
  }
}

function updateHud() {
  ui.score.textContent = String(Math.round(state.score)).padStart(6, '0');
  ui.healthValue.textContent = String(Math.round(state.health)); ui.healthMeter.style.width = `${state.health}%`;
  if (state.phase === 'cycle') {
    ui.objectiveValue.textContent = `${state.lap} / 3`; ui.objectiveSub.textContent = `POSITION ${state.position} / 6`;
    ui.energyValue.textContent = `${Math.round(state.cycleBoost)}%`; ui.energyMeter.style.width = `${state.cycleBoost}%`;
  } else {
    ui.objectiveValue.textContent = String(state.wave).padStart(2, '0'); ui.objectiveSub.textContent = `HOSTILES ${String(state.enemiesLeft).padStart(2, '0')}`;
    ui.energyValue.textContent = `${Math.round(state.energy)}%`; ui.energyMeter.style.width = `${state.energy}%`;
  }
}

function hitFeedback() {
  ui.hit.classList.add('show'); ui.reticle.classList.add('hit'); setTimeout(() => { ui.hit.classList.remove('show'); ui.reticle.classList.remove('hit'); }, 110);
}

let toastTimer;
function showToast(text) { ui.toast.textContent = text; ui.toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 1800); }

let audioContext, ambient;
function sound(type) {
  if (!state.audio) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const ctx = audioContext; const osc = ctx.createOscillator(); const gain = ctx.createGain(); const now = ctx.currentTime;
  const profiles = { select: [260, 520, .08, 'sine'], throw: [180, 760, .18, 'sawtooth'], recall: [620, 170, .2, 'triangle'], catch: [400, 980, .07, 'sine'], hit: [110, 55, .12, 'square'], destroy: [90, 28, .36, 'sawtooth'], damage: [70, 38, .22, 'square'], boost: [120, 520, .28, 'sawtooth'], wall: [520, 140, .18, 'triangle'] };
  const p = profiles[type] || profiles.select; osc.type = p[3]; osc.frequency.setValueAtTime(p[0], now); osc.frequency.exponentialRampToValueAtTime(Math.max(20, p[1]), now + p[2]);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.055 * state.volume, now + .012); gain.gain.exponentialRampToValueAtTime(.0001, now + p[2]);
  osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(now + p[2] + .02);
}

function startAmbient() {
  if (!state.audio || ambient) return; audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); const ctx = audioContext;
  const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter(); osc.type = 'sawtooth'; osc.frequency.value = state.phase === 'cycle' ? 48 : 36; filter.type = 'lowpass'; filter.frequency.value = 130; gain.gain.value = .018 * state.volume;
  osc.connect(filter).connect(gain).connect(ctx.destination); osc.start(); ambient = { osc, gain };
}
function stopAmbient() { if (ambient) { ambient.gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .12); ambient.osc.stop(audioContext.currentTime + .15); ambient = null; } }

function handlePrimary() { if (state.phase === 'disc') throwDisc(); else if (state.phase === 'cycle') boostCycle(); }
function handleSecondary() { if (state.phase === 'disc') recallDisc(); else if (state.phase === 'cycle') deployWall(); }

function bindUi() {
  document.querySelectorAll('.mode-card').forEach(card => card.addEventListener('mouseenter', () => {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active')); card.classList.add('active'); sound('select');
  }));
  document.querySelectorAll('[data-launch]').forEach(btn => btn.addEventListener('click', () => launchMode(btn.dataset.launch)));
  ui.enter.addEventListener('click', enterMode); ui.exit.addEventListener('click', exitMode); $('#homeButton').addEventListener('click', exitMode);
  $('#settingsButton').addEventListener('click', () => ui.settings.classList.add('open')); $('#settingsClose').addEventListener('click', () => ui.settings.classList.remove('open'));
  $('#audioToggle').addEventListener('click', (e) => { state.audio = !state.audio; e.currentTarget.textContent = `AUDIO: ${state.audio ? 'ON' : 'OFF'}`; if (!state.audio) stopAmbient(); else if (state.phase !== 'menu') startAmbient(); });
  $('#fullscreenButton').addEventListener('click', () => document.documentElement.requestFullscreen?.());
  $('#bloomRange').addEventListener('input', e => bloom.strength = Number(e.target.value));
  $('#volumeRange').addEventListener('input', e => { state.volume = Number(e.target.value); if (ambient) ambient.gain.gain.value = .018 * state.volume; });
  $('#qualitySelect').addEventListener('change', e => {
    const q = e.target.value; renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 1.8 : q === 'balanced' ? 1.25 : 1)); renderer.shadowMap.enabled = q !== 'performance'; bloom.enabled = q !== 'performance'; showToast(`${q.toUpperCase()} PROFILE ACTIVE`);
  });
  ui.canvas.addEventListener('mousedown', e => { if (state.phase === 'menu') return; if (e.button === 0) handlePrimary(); if (e.button === 2) handleSecondary(); });
  ui.canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('mousemove', e => { if (state.phase === 'disc' && document.pointerLockElement === ui.canvas) { state.yaw -= e.movementX * .0022; state.pitch = THREE.MathUtils.clamp(state.pitch - e.movementY * .0018, -1.25, 1.25); } });
  document.addEventListener('keydown', e => {
    state.key[e.code] = true;
    if (e.code === 'Escape' && state.phase !== 'menu') exitMode();
    if (e.code === 'Space' && state.phase === 'disc' && state.dodge <= 0) { state.dodge = .22; state.invulnerable = .3; sound('boost'); }
    if (e.code === 'KeyM') $('#audioToggle').click();
    if (e.code === 'KeyF') document.documentElement.requestFullscreen?.();
  });
  document.addEventListener('keyup', e => state.key[e.code] = false);
  ui.touchAction.addEventListener('pointerdown', e => { e.preventDefault(); handlePrimary(); }); $('#touchDodge').addEventListener('pointerdown', () => { state.dodge = .22; state.invulnerable = .3; });
  bindTouchStick();
}

function bindTouchStick() {
  const stick = $('#touchStick'), nub = stick.querySelector('i'); let active = false;
  const move = e => { if (!active) return; const r = stick.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2), len = Math.min(36, Math.hypot(x, y)), a = Math.atan2(y, x); state.touchX = Math.cos(a) * len / 36; state.touchY = Math.sin(a) * len / 36; nub.style.transform = `translate(${state.touchX * 32}px,${state.touchY * 32}px)`; };
  stick.addEventListener('pointerdown', e => { active = true; stick.setPointerCapture(e.pointerId); move(e); }); stick.addEventListener('pointermove', move);
  stick.addEventListener('pointerup', () => { active = false; state.touchX = state.touchY = 0; nub.style.transform = ''; });
}

function setupXR() {
  if (!navigator.xr) { ui.xrStatus.textContent = 'NOT AVAILABLE'; return; }
  navigator.xr.isSessionSupported('immersive-vr').then(supported => {
    ui.xrStatus.textContent = supported ? 'VR READY' : 'INLINE ONLY';
    if (supported) { const button = VRButton.createButton(renderer); button.style.cssText += ';position:fixed;bottom:22px;right:22px;z-index:50;background:#061014;border:1px solid #5df4ff;color:#5df4ff;border-radius:0;font:600 10px Rajdhani;letter-spacing:.14em;'; document.body.appendChild(button); }
  });
}

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth, innerHeight);
}

function animate() {
  const dt = Math.min(clock.getDelta(), .033), time = clock.elapsedTime; state.elapsed = time;
  if (world.userData.particles) { world.userData.particles.rotation.y += dt * .006; world.userData.particles.position.y = Math.sin(time * .1) * .3; }
  if (state.phase === 'menu') updateMenu(dt, time);
  else if (state.phase === 'disc') updateCombat(dt, time);
  else if (state.phase === 'cycle') updateCycles(dt, time);
  updateEffects(dt); updateHud();
  if (renderer.xr.isPresenting) renderer.render(scene, camera); else composer.render();
}

createAtmosphere(); createCombatEnvironment(); createCycleEnvironment(); createMenuMachines();
combatWorld.visible = false; cycleWorld.visible = false;
bindUi(); setupXR(); addEventListener('resize', onResize);
renderer.setAnimationLoop(animate);

// Useful for automated captures and direct mode links: ?mode=disc or ?mode=cycle.
const directMode = new URLSearchParams(location.search).get('mode');
if (directMode === 'disc' || directMode === 'cycle') {
  setTimeout(() => { launchMode(directMode); enterMode(); }, 250);
}
