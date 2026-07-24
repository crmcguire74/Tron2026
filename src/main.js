import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
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
  touch: $('#touchControls'), touchAction: $('#touchAction'), xrStatus: $('#xrStatus'),
  minimap: $('#minimap'), mapCoords: $('#mapCoords'), mapCanvas: $('#mapCanvas'),
  cycleGuide: $('#cycleGuide'), speedValue: $('#speedValue')
};

const state = {
  phase: 'menu', pendingMode: 'disc', elapsed: 0, score: 0, health: 100, energy: 0,
  wave: 1, enemiesLeft: 0, lap: 1, position: 1, audio: true, volume: .65,
  yaw: 0, pitch: 0, dodge: 0, invulnerable: 0, discReady: true, discCooldown: 0,
  cycleSpeed: 0, cycleBoost: 100, cycleHeat: 0, cycleAngle: 0, lane: 0,
  cycleX: 0, cycleZ: 28, cycleDir: 0, cycleTurnCooldown: 0,
  playerY: 1.82, playerVelocityY: 0, grounded: true,
  xrMode: null,
  requestedPlatform: 'desktop', xrAvailable: { vr: false, ar: false },
  cycleResetting: false,
  key: {}, touchX: 0, touchY: 0, lastSpawn: 0
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010507);
scene.fog = new THREE.FogExp2(0x020a0d, 0.025);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 250);
camera.position.set(0, 5.2, 14);

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, powerPreference: 'high-performance', alpha: true });
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
const hostileDiscs = [];
const combatPlatforms = [];
let sentinelTemplate = null;
let sentinelAnimations = [];
let sentinelLoadPromise = Promise.resolve(false);

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
  const body = mesh(new THREE.CylinderGeometry(radius * .95, radius, .085, 64, 2), mats.black);
  const upperDeck = mesh(new THREE.CylinderGeometry(radius * .72, radius * .9, .035, 64), mats.armor, [1, 1, 1], [0, .058, 0]);
  const lowerDeck = mesh(new THREE.CylinderGeometry(radius * .9, radius * .72, .035, 64), mats.armor, [1, 1, 1], [0, -.058, 0]);
  const outer = mesh(new THREE.TorusGeometry(radius, .052, 8, 64), colorMat, [1, 1, 1], [0, 0, 0], [Math.PI / 2, 0, 0]);
  const inner = mesh(new THREE.TorusGeometry(radius * .47, .022, 6, 48), colorMat, [1, 1, 1], [0, .082, 0], [Math.PI / 2, 0, 0]);
  const hub = mesh(new THREE.CylinderGeometry(radius * .17, radius * .2, .055, 32), mats.black, [1, 1, 1], [0, .085, 0]);
  g.add(body, upperDeck, lowerDeck, outer, inner, hub);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const plate = mesh(geo.box, mats.armor, [.075, .018, .18], [Math.cos(a) * radius * .68, .095, Math.sin(a) * radius * .68], [0, -a, 0]);
    const vent = mesh(geo.box, colorMat, [.014, .012, .1], [Math.cos(a) * radius * .68, .118, Math.sin(a) * radius * .68], [0, -a, 0]);
    g.add(plate, vent);
  }
  g.userData.isFlyingDisc = true;
  return g;
}

function createArmoredUnit(hostile = true, tier = 0) {
  if (hostile && sentinelTemplate) return createImportedSentinel(tier);
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
  const weapon = createDisc(core, .34); weapon.position.set(.86, 1.68, .1); weapon.rotation.z = Math.PI / 2; root.add(weapon);

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

function loadSentinelModel() {
  const url = new URL('../sentinel-soldier.glb', import.meta.url).href;
  return new Promise(resolve => new GLTFLoader().load(url, (gltf) => {
    sentinelTemplate = gltf.scene; sentinelAnimations = gltf.animations;
    sentinelTemplate.traverse(obj => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });
    showToast(`SENTINEL RUN RIG ONLINE · ${sentinelAnimations.length} CLIPS`); resolve(true);
  }, undefined, error => { console.warn('Sentinel model fallback active', error); resolve(false); }));
}

function createImportedSentinel(tier = 0) {
  const g = new THREE.Group();
  const model = cloneSkeleton(sentinelTemplate);
  // This GLB already carries its Blender-to-meter conversion on the Character node.
  // Skinned bind-pose bounds are not reliable for normalization, so preserve authored scale.
  model.scale.setScalar(18);
  model.position.y = 0;
  model.traverse(obj => {
    if (!obj.isMesh) return;
    obj.material = obj.material.clone();
    obj.material.metalness = Math.max(.55, obj.material.metalness || 0);
    obj.material.roughness = .24;
    obj.material.emissive = new THREE.Color(C.orange);
    obj.material.emissiveIntensity = obj.name.toLowerCase().includes('visor') ? 1.8 : .08;
    obj.castShadow = true; obj.receiveShadow = true;
  });
  g.add(model);

  // Additional modular plates and circuit rails elevate the supplied base asset.
  const armorRig = new THREE.Group();
  armorRig.add(mesh(geo.box, mats.armor, [.42, .08, .28], [0, 2.18, -.08]));
  armorRig.add(mesh(geo.ico, mats.armor, [.26, .14, .25], [-.48, 2.18, 0]));
  armorRig.add(mesh(geo.ico, mats.armor, [.26, .14, .25], [.48, 2.18, 0]));
  neonBar(armorRig, .72, mats.orangeGlass, [0, 1.88, .28], [0, 0, 0], .028);
  neonBar(armorRig, .42, mats.orangeGlass, [-.5, 1.94, .02], [0, 0, 0], .022);
  neonBar(armorRig, .42, mats.orangeGlass, [.5, 1.94, .02], [0, 0, 0], .022);
  g.add(armorRig);

  const weapon = createDisc(mats.orange, .34); weapon.position.set(.72, 1.55, .12); weapon.rotation.z = Math.PI / 2; g.add(weapon);
  const mixer = new THREE.AnimationMixer(model);
  const run = sentinelAnimations.find(a => /run/i.test(a.name)) || sentinelAnimations.find(a => /walk/i.test(a.name)) || sentinelAnimations[0];
  const action = run ? mixer.clipAction(run) : null; if (action) { action.timeScale = .82; action.play(); }
  const head = model.getObjectByName('mixamorig:Head');
  g.userData = { imported: true, model, armorRig, mixer, action, head, weapon, hostile: true, tier, health: 52 + tier * 38, phase: Math.random() * 6.28, speed: 1.25, attack: 1, dead: false };
  g.scale.setScalar(tier === 2 ? 1.24 : 1);
  return g;
}

function limb(length, radius, glow) {
  const pivot = new THREE.Group();
  const upper = mesh(geo.cyl, mats.rubber, [radius, length * .52, radius], [0, -length * .28, 0]);
  const armor = mesh(geo.box, mats.armor, [radius * 1.4, length * .27, radius * 1.6], [0, -length * .2, .02]);
  const stripe = mesh(geo.box, glow, [radius * .12, length * .42, radius * 1.7], [0, -length * .3, .03]);
  const lowerPivot = new THREE.Group(); lowerPivot.position.y = -length * .55;
  const joint = mesh(geo.sphere, mats.black, [radius * 1.25, radius * 1.25, radius * 1.25]);
  const jointGlow = mesh(new THREE.TorusGeometry(radius * 1.24, radius * .12, 5, 18), glow, [1, 1, 1], [0, 0, radius * 1.03]);
  const lower = mesh(geo.cyl, mats.rubber, [radius * .85, length * .45, radius * .85], [0, -length * .23, 0]);
  const lowerArmor = mesh(geo.box, mats.armor, [radius * 1.05, length * .2, radius * 1.3], [0, -length * .18, .02]);
  lowerPivot.add(joint, jointGlow, lower, lowerArmor);
  pivot.add(upper, armor, stripe, lowerPivot);
  pivot.userData.lowerPivot = lowerPivot;
  return pivot;
}

function createCycle(color = 'cyan', rider = true) {
  const style = cycleStyle(color), glow = style.glow, core = style.core;
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
  const monocoque = mesh(new THREE.CapsuleGeometry(.5, 2.25, 8, 18), mats.armor, [.92, 1, 1], [0, 1.04, 0], [Math.PI / 2, 0, 0]);
  const belly = mesh(geo.box, mats.black, [.52, .25, 1.32], [0, .65, 0]);
  const canopy = mesh(new THREE.SphereGeometry(.68, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mats.black, [.78, .62, 1.2], [0, 1.36, .18]);
  machine.add(monocoque, belly, canopy);
  const nose = mesh(geo.ico, mats.black, [.52, .42, 1.12], [0, 1.02, -1.16], [0, 0, 0]);
  const tail = mesh(geo.cone, mats.armor, [.47, 1.2, .47], [0, 1.05, 1.25], [Math.PI / 2, 0, 0]);
  machine.add(nose, tail);
  neonBar(machine, 2.7, glow, [.42, 1.08, 0], [0, 0, 0], .04);
  neonBar(machine, 2.7, glow, [-.42, 1.08, 0], [0, 0, 0], .04);
  for (const side of [-1, 1]) {
    const suspension = mesh(geo.box, mats.black, [.08, .08, .74], [side * .42, .67, 0], [0, 0, side * .05]);
    const sideArmor = mesh(geo.box, mats.armor, [.12, .32, .86], [side * .5, .92, 0], [0, 0, side * .05]);
    const sideGlow = mesh(geo.box, glow, [.018, .045, .78], [side * .625, 1.05, 0]);
    machine.add(suspension, sideArmor, sideGlow);
  }
  const engine = mesh(geo.cyl, mats.armor, [.31, .54, .31], [0, .86, .25], [Math.PI / 2, 0, 0]);
  const engineGlow = mesh(new THREE.TorusGeometry(.29, .035, 8, 32), core, [1, 1, 1], [0, .86, .58]);
  machine.add(engine, engineGlow);
  const underglow = new THREE.PointLight(core.color, color === 'cyan' ? 10 : 7, 8, 2);
  underglow.position.set(0, .55, 0); machine.add(underglow);

  let pilot = null;
  if (rider) {
    pilot = createCycleRider(glow);
    pilot.position.set(0, 1.12, .28); pilot.rotation.x = -.42;
    machine.add(pilot);
  }
  g.scale.setScalar(color === 'cyan' ? 1.3 : 1.14);
  g.userData = { machine, wheels, pilot, color, glow, core, wall: style.wall, speed: 0, pos: new THREE.Vector3(), spawn: new THREE.Vector3(), lastTrailPoint: null, dir: 0, turnCooldown: 0, trailTimer: 0, wallTimer: 0, assembled: 0 };
  return g;
}

function createCycleRider(glow) {
  const rider = new THREE.Group();
  const torso = new THREE.Group(); torso.position.y = .62;
  torso.add(mesh(new THREE.CapsuleGeometry(.28, .55, 6, 14), mats.armor, [.9, 1, .78]));
  torso.add(mesh(geo.box, glow, [.035, .35, .025], [0, 0, .24]));
  const head = new THREE.Group(); head.position.y = 1.35;
  head.add(mesh(geo.ico, mats.black, [.3, .34, .32]));
  head.add(mesh(geo.box, glow, [.23, .025, .035], [0, .02, .3]));
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .34, .88, .02); arm.rotation.set(-1.05, 0, side * -.14);
    arm.add(mesh(geo.cyl, mats.rubber, [.075, .37, .075], [0, -.32, 0]));
    arm.add(mesh(geo.box, glow, [.018, .27, .08], [side * .07, -.3, 0])); rider.add(arm);
  }
  rider.add(torso, head);
  rider.userData = { head, torso };
  return rider;
}

const generatedCycleStyles = new Map();
function cycleStyle(color) {
  const colors = { cyan: C.cyan, orange: C.orange, magenta: 0xff3bd4, lime: 0x8dff42, violet: 0x8c5cff, gold: 0xffce3a };
  const hex = colors[color] || colors.violet;
  if (!generatedCycleStyles.has(color)) generatedCycleStyles.set(color, {
    glow: color === 'cyan' ? mats.cyanGlass : color === 'orange' ? mats.orangeGlass : new THREE.MeshPhysicalMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.45, transparent: true, opacity: .76, roughness: .18 }),
    core: color === 'cyan' ? mats.cyan : color === 'orange' ? mats.orange : new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }),
    wall: new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: .76, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  });
  return generatedCycleStyles.get(color);
}

function createCombatEnvironment() {
  combatWorld.clear(); combatPlatforms.length = 0;
  const placements = [
    [0, 0, 10], [0, .35, 0], [-8, 0, 2], [8, 0, 2],
    [-8, .65, -8], [0, 1, -10], [8, .65, -8], [-4, 1.3, -18], [4, 1.3, -18]
  ];
  placements.forEach((p, index) => {
    const platform = new THREE.Group(); platform.position.set(p[0], p[1], p[2]);
    const deck = mesh(new THREE.CylinderGeometry(3.45, 3.15, .38, 64), index === 0 ? mats.armor : mats.black, [1, 1, 1], [0, -.12, 0]);
    const outerRing = mesh(new THREE.TorusGeometry(3.3, .075, 8, 64), index === 0 ? mats.cyanGlass : mats.orangeGlass, [1, 1, 1], [0, .09, 0], [Math.PI / 2, 0, 0]);
    const innerRing = mesh(new THREE.TorusGeometry(2.22, .035, 6, 48), index === 0 ? mats.cyan : mats.orange, [1, 1, 1], [0, .11, 0], [Math.PI / 2, 0, 0]);
    const hub = mesh(new THREE.CylinderGeometry(.72, 1.25, .22, 32), mats.armor, [1, 1, 1], [0, .11, 0]);
    const support = mesh(new THREE.CylinderGeometry(.12, .12, 5 + p[1], 12), mats.cyanGlass, [1, 1, 1], [0, -2.7 - p[1] / 2, 0]);
    platform.add(deck, outerRing, innerRing, hub, support); platform.visible = index <= 1; combatWorld.add(platform);
    combatPlatforms.push({ center: new THREE.Vector3(p[0], p[1], p[2]), radius: 3.2, group: platform, enemy: index > 0 });
  });

  const abyssGrid = new THREE.GridHelper(60, 30, C.cyan, 0x071b20); abyssGrid.position.y = -5.2; abyssGrid.material.opacity = .16; abyssGrid.material.transparent = true; combatWorld.add(abyssGrid);

  const core = new THREE.Group(); core.position.set(0, 7.2, -23); core.scale.setScalar(.68);
  for (let i = 0; i < 5; i++) {
    const r = 3.6 + i * .85;
    const ring = mesh(new THREE.TorusGeometry(r, .1 + i * .02, 8, 64), i % 2 ? mats.armor : mats.cyanGlass, [1, 1, 1], [0, 0, i * -.22]);
    ring.userData.spin = (i % 2 ? -1 : 1) * (.08 + i * .025); core.add(ring);
  }
  const orb = mesh(geo.ico, mats.cyanGlass, [1.8, 1.8, 1.8]); core.add(orb); combatWorld.add(core);
  combatWorld.userData.core = core;

  for (let i = 0; i < 12; i++) {
    const a = i / 16 * Math.PI * 2;
    const radius = i % 2 ? 27 : 23;
    const tower = new THREE.Group(); tower.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius); tower.rotation.y = a;
    const height = 4.5 + (i % 4) * 1.3;
    tower.add(mesh(geo.box, mats.black, [1.1, height / 2, 1.4], [0, height / 2, 0]));
    tower.add(mesh(geo.box, mats.armor, [1.35, .13, 1.62], [0, height, 0]));
    neonBar(tower, height * .8, i % 5 === 0 ? mats.orangeGlass : mats.cyanGlass, [.7, height * .5, 1.45], [Math.PI / 2, 0, 0], .03);
    for (let y = 1; y < height; y += 1.1) tower.add(mesh(geo.box, mats.armor, [1.25, .04, 1.55], [0, y, 0]));
    combatWorld.add(tower);
  }

  combatWorld.userData.platforms = combatPlatforms;
}

function createCycleEnvironment() {
  cycleWorld.clear(); cycles.length = 0; wallSegments.length = 0;
  const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x07161b, emissive: 0x02090b, emissiveIntensity: .4, metalness: .72, roughness: .26, clearcoat: 1, clearcoatRoughness: .08 });
  cycleWorld.add(mesh(geo.box, floorMat, [40, .2, 40], [0, -.22, 0]));
  for (let x = -36; x <= 36; x += 8) for (let z = -36; z <= 36; z += 8) {
    const alt = Math.abs(Math.round((x + z) / 8)) % 2;
    const tileMat = new THREE.MeshPhysicalMaterial({ color: alt ? 0x17424d : 0x0d3039, emissive: alt ? 0x061a20 : 0x041219, emissiveIntensity: .62, metalness: .52, roughness: .42, clearcoat: .52 });
    const tile = mesh(geo.box, tileMat, [3.82, .035, 3.82], [x, .025, z]); tile.receiveShadow = true; cycleWorld.add(tile);
  }
  const grid = new THREE.GridHelper(80, 40, C.cyanHot, 0x3a9199); grid.material.transparent = true; grid.material.opacity = .82; grid.position.y = .08; cycleWorld.add(grid);
  const arenaFill = new THREE.HemisphereLight(0x62dce6, 0x061116, 1.15); cycleWorld.add(arenaFill);
  const centerLight = new THREE.PointLight(C.cyan, 25, 55, 2); centerLight.position.set(0, 10, 0); cycleWorld.add(centerLight);

  // Square armored perimeter with four clearly legible corners.
  const wallSpecs = [
    [0, 1.3, -40, 40, 1.3, .3, 0], [0, 1.3, 40, 40, 1.3, .3, 0],
    [-40, 1.3, 0, .3, 1.3, 40, Math.PI / 2], [40, 1.3, 0, .3, 1.3, 40, Math.PI / 2]
  ];
  wallSpecs.forEach((w, i) => {
    const wall = mesh(geo.box, mats.armor, [w[3], w[4], w[5]], [w[0], w[1], w[2]]); cycleWorld.add(wall);
    const strip = mesh(geo.box, i % 2 ? mats.orangeGlass : mats.cyanGlass, [w[3], .035, w[5] + .04], [w[0], 2.63, w[2]]); cycleWorld.add(strip);
  });

  for (const x of [-40, 40]) for (const z of [-40, 40]) {
    const corner = new THREE.Group(); corner.position.set(x, 0, z);
    corner.add(mesh(geo.box, mats.black, [1.8, 5, 1.8], [0, 5, 0]));
    corner.add(mesh(geo.box, mats.armor, [2.2, .22, 2.2], [0, 10, 0]));
    neonBar(corner, 8, x === z ? mats.cyanGlass : mats.orangeGlass, [0, 5, 1.85], [Math.PI / 2, 0, 0], .06);
    cycleWorld.add(corner);
  }
  for (let i = -2; i <= 2; i++) {
    const obstacle = new THREE.Group(); obstacle.position.set(i * 10, 0, i % 2 ? 7 : -7);
    obstacle.add(mesh(geo.box, mats.black, [1.3, 1.15, 3.4], [0, 1.15, 0]));
    obstacle.add(mesh(geo.box, mats.armor, [1.5, .12, 3.65], [0, 2.3, 0]));
    neonBar(obstacle, 5.8, i % 2 ? mats.orangeGlass : mats.cyanGlass, [1.52, 1.5, 0], [0, 0, 0], .035);
    cycleWorld.add(obstacle);
  }
  const roster = ['cyan', 'orange', 'magenta', 'lime', 'violet'];
  const spawns = [[0, 28], [-12, 22], [-4, 28], [4, 22], [12, 28]];
  for (let i = 0; i < roster.length; i++) {
    const c = createCycle(roster[i]);
    c.userData.pos.set(spawns[i][0], 0, spawns[i][1]);
    c.userData.spawn.copy(c.userData.pos);
    c.userData.lastTrailPoint = c.userData.pos.clone();
    c.userData.dir = 0;
    c.userData.speed = i === 0 ? 8 : 10.5 + Math.random() * 2.5;
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
  hostileDiscs.forEach(d => scene.remove(d)); hostileDiscs.length = 0;
  const count = Math.min(1 + (state.wave - 1) * 2, combatPlatforms.length - 1);
  combatPlatforms.forEach((platform, index) => {
    const active = index === 0 || index <= count;
    if (active && !platform.group.visible) { platform.group.visible = true; platform.group.scale.setScalar(.02); }
    if (!active) platform.group.visible = false;
  });
  for (let i = 0; i < count; i++) {
    const tier = state.wave === 5 && i === count - 1 ? 2 : (state.wave >= 3 && i % 3 === 0 ? 1 : 0);
    const e = createArmoredUnit(true, tier);
    const platform = combatPlatforms[i + 1];
    e.position.copy(platform.center).add(new THREE.Vector3(0, .22, 0));
    e.userData.platform = platform; e.userData.rangedAttack = .8 + Math.random() * 1.4;
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
    camera.fov = 58; camera.updateProjectionMatrix();
    ui.briefingProtocol.textContent = 'COMBAT PROTOCOL 01'; ui.briefingTitle.textContent = 'SHATTERED CORE';
    ui.briefingCopy.textContent = 'WASD MOVE · SPACE JUMP BETWEEN DISCS · CLICK THROW · RIGHT CLICK RECALL';
    ui.enter.textContent = 'CLICK TO ENGAGE';
  } else {
    camera.fov = 68; camera.updateProjectionMatrix();
    ui.briefingProtocol.textContent = 'VELOCITY PROTOCOL 02'; ui.briefingTitle.textContent = 'VECTOR RUN';
    ui.briefingCopy.textContent = 'W ACCELERATE · S BRAKE · A / D TURN EXACTLY 90° · AVOID EVERY LIGHT WALL';
    ui.enter.textContent = 'INITIALIZE MACHINE';
  }
  sound('select');
}

async function enterMode() {
  const mode = state.pendingMode;
  if (mode === 'disc' && !sentinelTemplate) {
    ui.enter.disabled = true; ui.enter.textContent = 'LOADING ANIMATED SENTINEL...';
    await sentinelLoadPromise;
    ui.enter.disabled = false; ui.enter.textContent = 'ENTER DISC COMBAT';
  }
  state.phase = mode; state.score = 0; state.health = 100; state.energy = 0; state.wave = 1; state.lap = 1;
  state.yaw = 0; state.pitch = 0; state.cycleAngle = 0; state.cycleSpeed = 8; state.cycleBoost = 100; state.cycleHeat = 0;
  state.cycleX = 0; state.cycleZ = 28; state.cycleDir = 0; state.cycleTurnCooldown = 0;
  ui.briefing.classList.remove('visible'); ui.briefing.setAttribute('aria-hidden', 'true');
  ui.hud.classList.add('visible'); ui.hud.setAttribute('aria-hidden', 'false');
  ui.exit.classList.add('visible'); ui.exit.setAttribute('aria-hidden', 'false');
  if (matchMedia('(pointer: coarse)').matches) ui.touch.classList.add('visible');
  menuMachines.visible = false;
  combatWorld.visible = mode === 'disc'; cycleWorld.visible = mode === 'cycle';
  if (mode === 'disc') {
    const start = combatPlatforms[0].center;
    camera.position.set(start.x, start.y + 1.82, start.z); state.playerY = camera.position.y; state.playerVelocityY = 0; state.grounded = true; spawnWave();
    ui.objectiveLabel.textContent = 'WAVE'; ui.modeName.textContent = 'SHATTERED CORE';
    ui.healthLabel.textContent = 'CORE INTEGRITY'; ui.energyLabel.textContent = 'OVERDRIVE';
    ui.abilityLabel.textContent = 'DISC READY'; ui.abilityHint.textContent = 'LMB THROW · RMB RECALL · SPACE JUMP'; ui.touchAction.textContent = 'THROW';
    if (!matchMedia('(pointer: coarse)').matches && !renderer.xr.isPresenting) ui.canvas.requestPointerLock?.();
  } else {
    createCycleEnvironment();
    ui.objectiveLabel.textContent = 'ROUND'; ui.modeName.textContent = 'VECTOR RUN';
    ui.healthLabel.textContent = 'ARMOR INTEGRITY'; ui.energyLabel.textContent = 'BOOST';
    ui.abilityLabel.textContent = 'WALL READY'; ui.abilityHint.textContent = 'LMB BOOST · RMB WALL'; ui.touchAction.textContent = 'BOOST';
    ui.speedLines.classList.add('show');
    ui.minimap.classList.add('visible'); ui.minimap.setAttribute('aria-hidden', 'false');
    ui.cycleGuide.classList.add('visible'); ui.cycleGuide.setAttribute('aria-hidden', 'false');
  }
  updateHud(); startAmbient(); showToast('SYSTEM LINK ESTABLISHED');
}

function exitMode() {
  document.exitPointerLock?.();
  state.phase = 'menu'; ui.menu.classList.remove('hidden'); ui.hud.classList.remove('visible'); ui.exit.classList.remove('visible');
  ui.touch.classList.remove('visible'); ui.speedLines.classList.remove('show'); menuMachines.visible = false; combatWorld.visible = false; cycleWorld.visible = false;
  ui.minimap.classList.remove('visible'); ui.minimap.setAttribute('aria-hidden', 'true');
  ui.cycleGuide.classList.remove('visible'); ui.cycleGuide.setAttribute('aria-hidden', 'true');
  enemies.forEach(e => combatWorld.remove(e)); enemies.length = 0; discs.forEach(d => scene.remove(d)); discs.length = 0;
  stopAmbient(); sound('select');
  camera.fov = 58; camera.updateProjectionMatrix();
}

function throwDisc() {
  if (state.phase !== 'disc' || !state.discReady) return;
  state.discReady = false; state.discCooldown = .35;
  const d = createDisc(mats.cyan, .46); d.position.copy(camera.position);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  d.position.addScaledVector(dir, .7);
  // Stable world-up flight attitude. Only Y-axis spin is applied in the loop.
  d.rotation.set(0, 0, 0);
  d.userData = { ...d.userData, dir, speed: 27, age: 0, returning: false, hit: new Set(), xrOwned: false };
  discs.push(d); scene.add(d); ui.abilityLabel.textContent = 'DISC IN FLIGHT'; sound('throw');
}

function throwDiscFromController(controller) {
  if (state.phase !== 'disc' || !state.discReady) return;
  state.discReady = false; state.discCooldown = .35;
  const d = createDisc(mats.cyan, .46);
  const origin = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  controller.getWorldPosition(origin); controller.getWorldQuaternion(quaternion);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
  d.position.copy(origin).addScaledVector(dir, .22); d.rotation.set(0, 0, 0);
  d.userData = { ...d.userData, dir, speed: 27, age: 0, returning: false, hit: new Set(), xrOwned: true };
  discs.push(d); scene.add(d); ui.abilityLabel.textContent = 'DISC IN FLIGHT'; sound('throw');
}

function recallDisc() {
  for (const d of discs) d.userData.returning = true;
  if (discs.length) { ui.abilityLabel.textContent = 'RECALLING'; sound('recall'); }
}

function throwEnemyDisc(enemy) {
  const d = createDisc(mats.orange, .38);
  d.position.copy(enemy.position).add(new THREE.Vector3(0, 1.55, 0));
  const target = camera.position.clone().add(new THREE.Vector3(0, -.12, 0));
  const dir = target.sub(d.position).normalize();
  d.rotation.set(0, 0, 0);
  d.userData = { ...d.userData, dir, speed: 13 + enemy.userData.tier * 2, age: 0, owner: enemy };
  scene.add(d); hostileDiscs.push(d); sound('throw');
}

function updateHostileDiscs(dt) {
  for (let i = hostileDiscs.length - 1; i >= 0; i--) {
    const d = hostileDiscs[i]; d.userData.age += dt; d.rotation.y += dt * 18; d.position.addScaledVector(d.userData.dir, d.userData.speed * dt);
    if (d.position.distanceTo(camera.position) < .7) { damagePlayer(12); scene.remove(d); hostileDiscs.splice(i, 1); continue; }
    if (d.userData.age > 3.2) { scene.remove(d); hostileDiscs.splice(i, 1); }
  }
}

function updateDiscs(dt) {
  for (let i = discs.length - 1; i >= 0; i--) {
    const d = discs[i], data = d.userData; data.age += dt; d.rotation.y += dt * 21;
    d.rotation.x = 0; d.rotation.z = 0;
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
    const player = camera.position.clone(); player.y = e.position.y; const toPlayer = player.sub(e.position); const distance = toPlayer.length();
    e.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    if (d.platform) {
      e.position.x = d.platform.center.x + Math.sin(d.phase * .32) * .65;
      e.position.z = d.platform.center.z + Math.cos(d.phase * .32) * .65;
      e.position.y = d.platform.center.y + .22;
    }
    d.phase += dt * (4 + d.speed);
    if (d.imported) {
      d.mixer.update(dt);
      d.armorRig.position.y = Math.sin(time * 2.4 + d.phase) * .018;
    } else {
      const stride = Math.sin(d.phase), strideOpposite = Math.sin(d.phase + Math.PI);
      d.leftLeg.rotation.x = stride * .62; d.rightLeg.rotation.x = strideOpposite * .62;
      d.leftLeg.userData.lowerPivot.rotation.x = Math.max(0, -stride) * .82;
      d.rightLeg.userData.lowerPivot.rotation.x = Math.max(0, -strideOpposite) * .82;
      d.leftArm.rotation.x = strideOpposite * .42; d.rightArm.rotation.x = stride * .42;
      d.leftArm.userData.lowerPivot.rotation.x = -.28 + Math.max(0, stride) * .52;
      d.rightArm.userData.lowerPivot.rotation.x = -.28 + Math.max(0, strideOpposite) * .52;
      d.torso.rotation.y = stride * .11; d.torso.rotation.z = stride * .025;
      d.head.rotation.y = Math.sin(time * 1.6 + d.phase) * .18;
      d.root.position.y = Math.abs(Math.sin(d.phase)) * .055;
    }
    d.weapon.rotation.z += dt * (distance < 5 ? 12 : 3);
    if (d.flash > 0) {
      d.flash -= dt;
      if (d.imported) d.model.traverse(o => { if (o.isMesh) o.material.emissiveIntensity = .8; });
      else d.reactor.scale.setScalar(1.8);
    } else if (d.imported) {
      d.model.traverse(o => { if (o.isMesh) o.material.emissiveIntensity = o.name.toLowerCase().includes('visor') ? 1.8 : .08; });
    } else d.reactor.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 10);
    d.rangedAttack -= dt;
    if (d.rangedAttack <= 0) {
      d.rangedAttack = Math.max(.75, 2.4 - state.wave * .16) + Math.random() * .8;
      if (!d.imported) {
        d.rightArm.rotation.x = -1.85; d.rightArm.rotation.z = -.42;
        d.rightArm.userData.lowerPivot.rotation.x = -1.05; d.torso.rotation.y = -.38;
      } else {
        d.model.rotation.y = -.12;
      }
      throwEnemyDisc(e);
    }
  }
}

function damagePlayer(amount) {
  if (state.invulnerable > 0) return;
  state.health = Math.max(0, state.health - amount); ui.damage.classList.add('show'); setTimeout(() => ui.damage.classList.remove('show'), 180); sound('damage'); updateHud();
  if (state.health <= 0) {
    state.health = 100; state.score = Math.max(0, state.score - 500);
    if (state.phase === 'disc' && combatPlatforms[0]) {
      const start = combatPlatforms[0].center; camera.position.set(start.x, start.y + 1.82, start.z); state.playerY = camera.position.y; state.playerVelocityY = 0; state.grounded = true;
    }
    showToast('SYSTEM FAILURE · RECONSTITUTING');
  }
}

function updateCombat(dt, time) {
  const speed = state.key.ShiftLeft || state.key.ShiftRight ? 10.5 : 6.2;
  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const right = new THREE.Vector3(Math.cos(state.yaw), 0, Math.sin(state.yaw));
  const move = new THREE.Vector3();
  if (state.key.KeyW) move.add(forward); if (state.key.KeyS) move.sub(forward); if (state.key.KeyD) move.add(right); if (state.key.KeyA) move.sub(right);
  move.x += state.touchX; move.z += state.touchY;
  if (move.lengthSq()) camera.position.addScaledVector(move.normalize(), speed * dt);
  if (state.key.ArrowLeft) state.yaw += dt * 1.8; if (state.key.ArrowRight) state.yaw -= dt * 1.8;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -13, 13); camera.position.z = THREE.MathUtils.clamp(camera.position.z, -22, 14);
  const platform = platformBelow(camera.position.x, camera.position.z);
  const groundY = platform ? platform.center.y + 1.82 : -20;
  if (!platform && state.grounded) state.grounded = false;
  if (!state.grounded) {
    state.playerVelocityY -= 15 * dt; state.playerY += state.playerVelocityY * dt;
    if (platform && state.playerVelocityY <= 0 && state.playerY <= groundY + .18) { state.playerY = groundY; state.playerVelocityY = 0; state.grounded = true; sound('catch'); }
  } else {
    state.playerY = groundY + Math.sin(time * 7) * (move.lengthSq() ? .035 : .008);
  }
  camera.position.y = state.playerY;
  if (state.playerY < -5) {
    const start = combatPlatforms[0].center; camera.position.set(start.x, start.y + 1.82, start.z);
    state.playerY = camera.position.y; state.playerVelocityY = 0; state.grounded = true; damagePlayer(18); showToast('ABYSS FALL · PLATFORM RESTORED');
  }
  camera.rotation.order = 'YXZ'; camera.rotation.y = state.yaw; camera.rotation.x = state.pitch;
  if (state.dodge > 0) state.dodge -= dt; if (state.invulnerable > 0) state.invulnerable -= dt;
  if (state.discCooldown > 0) state.discCooldown -= dt;
  updateEnemies(dt, time); updateDiscs(dt); updateHostileDiscs(dt);
  const core = combatWorld.userData.core; if (core) for (const child of core.children) if (child.userData.spin) child.rotation.z += dt * child.userData.spin;
  for (const platform of combatPlatforms) {
    if (platform.group.visible && platform.group.scale.x < .99) platform.group.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 5.5);
  }
}

function platformBelow(x, z) {
  return combatPlatforms.find(p => p.group.visible && Math.hypot(x - p.center.x, z - p.center.z) <= p.radius);
}

function updateCycles(dt, time) {
  const player = cycles[0]; if (!player) return;
  if (state.cycleResetting) { updateWalls(dt); return; }
  const accelerating = state.key.KeyW || state.touchY < -.25;
  const braking = state.key.KeyS || state.key.ShiftLeft;
  state.cycleSpeed += (accelerating ? 8 : 1.8) * dt;
  state.cycleSpeed -= (braking ? 10 : 2.8) * dt;
  state.cycleSpeed = THREE.MathUtils.clamp(state.cycleSpeed, 6, 22);
  state.cycleTurnCooldown = Math.max(0, state.cycleTurnCooldown - dt);
  if (Math.abs(state.touchX) > .65 && state.cycleTurnCooldown <= 0) turnCycle(state.touchX > 0 ? 1 : -1);

  const p = player.userData;
  p.speed = state.cycleSpeed; p.dir = state.cycleDir;
  const forward = cycleDirection(p.dir);
  p.pos.addScaledVector(forward, p.speed * dt);
  state.cycleX = p.pos.x; state.cycleZ = p.pos.z;
  if (Math.abs(p.pos.x) > 37.8 || Math.abs(p.pos.z) > 37.8) crashCycle();

  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i], d = c.userData;
    if (d.ai) {
      if (d.crashed) continue;
      d.turnCooldown = Math.max(0, d.turnCooldown - dt);
      const f = cycleDirection(d.dir); d.pos.addScaledVector(f, d.speed * dt);
      const boundary = Math.abs(d.pos.x) > 36.5 || Math.abs(d.pos.z) > 36.5;
      if (boundary) { crashRival(c); continue; }
      if (Math.random() < dt * .13 && d.turnCooldown <= 0) {
        d.dir = (d.dir + (Math.random() > .5 ? 1 : 3)) % 4; d.turnCooldown = .9;
      }
    }
    d.trailTimer -= dt;
    if (d.trailTimer <= 0) { addTrailSegment(c); d.trailTimer = .18; }
    placeCycle(c, time, i, dt);
  }
  state.position = 1;

  const pos = p.pos.clone().setY(1.2);
  const desired = pos.clone().addScaledVector(forward, -10.5).add(new THREE.Vector3(0, 3.65, 0));
  camera.position.lerp(desired, 1 - Math.pow(.002, dt));
  const look = pos.clone().addScaledVector(forward, 3.25).add(new THREE.Vector3(0, .7, 0)); camera.lookAt(look);
  ui.speedValue.textContent = String(Math.round(state.cycleSpeed * 13)).padStart(3, '0');
  state.energy = state.cycleBoost;
  updateWalls(dt); updateMinimap();
}

function placeCycle(c, time, index, dt) {
  const d = c.userData;
  c.position.set(d.pos.x, .02, d.pos.z); c.rotation.y = -d.dir * Math.PI / 2;
  c.rotation.z = THREE.MathUtils.lerp(c.rotation.z, 0, .12);
  for (const w of d.wheels) w.rotation.z -= d.speed * dt * 1.5;
  d.machine.position.y = Math.sin(time * 12 + index) * .025;
  if (d.pilot) { d.pilot.userData.head.rotation.x = Math.sin(time * 2 + index) * .03; d.pilot.userData.torso.rotation.z = c.rotation.z * 1.8; }
}

function cycleDirection(dir) {
  return [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)][dir];
}

function turnCycle(delta) {
  if (state.phase !== 'cycle' || state.cycleTurnCooldown > 0) return;
  state.cycleDir = (state.cycleDir + (delta > 0 ? 1 : 3)) % 4;
  state.cycleTurnCooldown = .28; sound('wall');
  const player = cycles[0]; if (player) { player.rotation.z = delta > 0 ? -.18 : .18; player.userData.dir = state.cycleDir; }
}

function crashCycle() {
  if (state.cycleResetting) return;
  state.cycleResetting = true; state.lap += 1; explodeCycle(cycles[0]); sound('destroy'); showToast('CYCLE DEREZZED · ROUND RESTARTING');
  setTimeout(() => {
    wallSegments.forEach(w => cycleWorld.remove(w)); wallSegments.length = 0;
    cycles.forEach((c, i) => {
      c.visible = true; c.userData.pos.copy(c.userData.spawn); c.userData.dir = 0; c.userData.turnCooldown = .8; c.userData.trailTimer = .2;
      c.userData.lastTrailPoint = c.userData.pos.clone();
      if (i > 0) c.userData.speed = 10.5 + Math.random() * 2.5;
    });
    state.cycleDir = 0; state.cycleSpeed = 8; state.cycleBoost = 100; state.health = 100; state.cycleResetting = false;
  }, 850);
}

function explodeCycle(cycle) {
  if (!cycle) return;
  cycle.visible = false;
  for (let i = 0; i < 28; i++) {
    const shard = mesh(i % 3 ? geo.box : geo.ico, i % 5 ? mats.armor : cycle.userData.core, [.07 + Math.random() * .2, .05 + Math.random() * .16, .08 + Math.random() * .25]);
    shard.position.copy(cycle.position).add(new THREE.Vector3((Math.random() - .5) * 1.6, .5 + Math.random() * 1.8, (Math.random() - .5) * 2.2));
    shard.userData.life = .7 + Math.random() * .8; shard.userData.velocity = new THREE.Vector3((Math.random() - .5) * 10, 3 + Math.random() * 8, (Math.random() - .5) * 10);
    cycleWorld.add(shard); effects.push(shard);
  }
}

function crashRival(rival) {
  if (!rival || rival.userData.crashed) return;
  rival.userData.crashed = true; explodeCycle(rival); sound('destroy');
  setTimeout(() => {
    if (state.phase !== 'cycle') return;
    rival.userData.pos.copy(rival.userData.spawn); rival.userData.dir = 0; rival.userData.turnCooldown = 1; rival.userData.trailTimer = .2; rival.userData.crashed = false; rival.visible = true;
    rival.userData.lastTrailPoint = rival.userData.pos.clone();
  }, 900);
}

function addTrailSegment(c) {
  const d = c.userData, mat = d.wall.clone();
  if (!d.lastTrailPoint) { d.lastTrailPoint = d.pos.clone(); return; }
  const deltaX = d.pos.x - d.lastTrailPoint.x, deltaZ = d.pos.z - d.lastTrailPoint.z;
  const distance = Math.hypot(deltaX, deltaZ); if (distance < .025) return;
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaZ), halfLength = distance / 2 + .09;
  const centerX = (d.pos.x + d.lastTrailPoint.x) / 2, centerZ = (d.pos.z + d.lastTrailPoint.z) / 2;
  const wall = mesh(geo.box, mat, horizontal ? [halfLength, 1.75, .06] : [.06, 1.75, halfLength], [centerX, 1.75, centerZ]);
  wall.userData = { life: 12, age: 0, owner: c, halfX: horizontal ? halfLength : .16, halfZ: horizontal ? .16 : halfLength };
  cycleWorld.add(wall); wallSegments.push(wall);
  d.lastTrailPoint.copy(d.pos);
}

function updateMinimap() {
  const canvas = ui.mapCanvas, ctx = canvas?.getContext('2d'); if (!ctx) return;
  const w = canvas.width, h = canvas.height, toX = x => (x + 40) / 80 * w, toY = z => (z + 40) / 80 * h;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(2,9,12,.96)'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(101,247,255,.15)'; ctx.lineWidth = 1;
  for (let n = -40; n <= 40; n += 10) { ctx.beginPath(); ctx.moveTo(toX(n), 0); ctx.lineTo(toX(n), h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, toY(n)); ctx.lineTo(w, toY(n)); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(101,247,255,.7)'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = 'rgba(120,160,168,.35)';
  for (let i = -2; i <= 2; i++) { const x = toX(i * 10), y = toY(i % 2 ? 7 : -7); ctx.fillRect(x - 6, y - 15, 12, 30); }
  const colorHex = { cyan: '#65f7ff', orange: '#ff5a1f', magenta: '#ff3bd4', lime: '#8dff42', violet: '#8c5cff' };
  for (const wall of wallSegments) {
    const owner = wall.userData.owner; ctx.strokeStyle = colorHex[owner?.userData.color] || '#65f7ff'; ctx.globalAlpha = .7; ctx.lineWidth = 3;
    ctx.beginPath();
    if ((wall.userData.halfX || 0) > (wall.userData.halfZ || 0)) { ctx.moveTo(toX(wall.position.x - wall.userData.halfX), toY(wall.position.z)); ctx.lineTo(toX(wall.position.x + wall.userData.halfX), toY(wall.position.z)); }
    else { ctx.moveTo(toX(wall.position.x), toY(wall.position.z - wall.userData.halfZ)); ctx.lineTo(toX(wall.position.x), toY(wall.position.z + wall.userData.halfZ)); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  cycles.forEach(c => {
    const d = c.userData, x = toX(d.pos.x), y = toY(d.pos.z), dir = d.dir * Math.PI / 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-dir); ctx.fillStyle = colorHex[d.color] || '#fff'; ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.restore();
  });
  ui.mapCoords.textContent = `X ${Math.round(state.cycleX).toString().padStart(2, '0')} · Z ${Math.round(state.cycleZ).toString().padStart(2, '0')}`;
}

function boostCycle() {
  if (state.phase !== 'cycle' || state.cycleBoost < 8 || state.cycleHeat > 92) return;
  state.cycleSpeed = Math.min(28, state.cycleSpeed + 4.5); state.cycleBoost = Math.max(0, state.cycleBoost - 8); state.cycleHeat = Math.min(100, state.cycleHeat + 16);
  sound('boost'); ui.speedLines.classList.add('show');
}

function deployWall() {
  if (state.phase !== 'cycle' || !cycles[0]) return;
  const c = cycles[0], d = c.userData, horizontal = d.dir % 2 === 1;
  const behind = d.pos.clone().addScaledVector(cycleDirection(d.dir), -2.2);
  const wall = mesh(geo.box, d.wall.clone(), horizontal ? [1.8, 1.75, .055] : [.055, 1.75, 1.8], [behind.x, 1.75, behind.z]);
  wall.userData = { life: 4.5, age: 0, owner: c, halfX: horizontal ? 1.8 : .16, halfZ: horizontal ? .16 : 1.8 };
  cycleWorld.add(wall); wallSegments.push(wall); sound('wall'); ui.abilityLabel.textContent = 'WALL DEPLOYED'; setTimeout(() => state.phase === 'cycle' && (ui.abilityLabel.textContent = 'WALL READY'), 700);
}

function updateWalls(dt) {
  for (let i = wallSegments.length - 1; i >= 0; i--) {
    const w = wallSegments[i]; w.userData.life -= dt; w.userData.age = (w.userData.age || 0) + dt; w.material.opacity = Math.min(.76, w.userData.life * .35);
    if (state.phase === 'cycle' && w.userData.age > (w.userData.owner === cycles[0] ? .55 : .2)) {
      const p = cycles[0]?.userData.pos;
      if (p && Math.abs(p.x - w.position.x) < (w.userData.halfX || .2) + .42 && Math.abs(p.z - w.position.z) < (w.userData.halfZ || .2) + .42) {
        crashCycle(); w.userData.life = 0;
      }
      for (let c = 1; c < cycles.length; c++) {
        const rival = cycles[c]; if (w.userData.owner === rival || rival.userData.turnCooldown > 0) continue;
        const rp = rival.userData.pos;
        if (Math.abs(rp.x - w.position.x) < (w.userData.halfX || .2) + .35 && Math.abs(rp.z - w.position.z) < (w.userData.halfZ || .2) + .35) {
          crashRival(rival);
        }
      }
    }
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
    ui.objectiveValue.textContent = String(state.lap).padStart(2, '0'); ui.objectiveSub.textContent = `RIDERS ${cycles.length}`;
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

function choosePlatform(game, platform) {
  state.requestedPlatform = platform; state.pendingMode = game; launchMode(game);
  ui.enter.textContent = platform === 'desktop' ? `PLAY ${game === 'disc' ? 'DISC COMBAT' : 'CYCLE ARENA'} ON DESKTOP` : platform === 'vr' ? `ENTER ${game === 'disc' ? 'DISC COMBAT' : 'CYCLE ARENA'} IN VR` : 'ENTER DISC COMBAT IN AR';
}

async function enterRequestedPlatform() {
  if (state.requestedPlatform === 'desktop') { await enterMode(); return; }
  if (!navigator.xr || !state.xrAvailable[state.requestedPlatform]) { showToast(`${state.requestedPlatform.toUpperCase()} IS NOT SUPPORTED ON THIS DEVICE`); return; }
  try {
    const isAR = state.requestedPlatform === 'ar';
    const session = await navigator.xr.requestSession(isAR ? 'immersive-ar' : 'immersive-vr', isAR ? { optionalFeatures: ['local-floor', 'hit-test', 'anchors', 'dom-overlay'], domOverlay: { root: document.body } } : { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await renderer.xr.setSession(session);
  } catch (error) { console.warn(error); showToast(`${state.requestedPlatform.toUpperCase()} SESSION COULD NOT START`); }
}

function bindUi() {
  document.querySelectorAll('.mode-card').forEach(card => card.addEventListener('mouseenter', () => {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active')); card.classList.add('active'); sound('select');
  }));
  document.querySelectorAll('[data-platform]').forEach(btn => btn.addEventListener('click', () => choosePlatform(btn.dataset.game, btn.dataset.platform)));
  ui.enter.addEventListener('click', enterRequestedPlatform); ui.exit.addEventListener('click', exitMode); $('#homeButton').addEventListener('click', exitMode);
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
    if (e.code === 'Space' && state.phase === 'disc' && state.grounded) { state.playerVelocityY = 6.8; state.grounded = false; sound('boost'); }
    if (!e.repeat && state.phase === 'cycle' && e.code === 'KeyA') turnCycle(-1);
    if (!e.repeat && state.phase === 'cycle' && e.code === 'KeyD') turnCycle(1);
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
  Promise.all([navigator.xr.isSessionSupported('immersive-vr'), navigator.xr.isSessionSupported('immersive-ar')]).then(([vr, ar]) => {
    state.xrAvailable = { vr, ar };
    ui.xrStatus.textContent = `${vr ? 'VR' : ''}${vr && ar ? ' + ' : ''}${ar ? 'AR' : ''}${!vr && !ar ? 'INLINE ONLY' : ' READY'}`;
    document.querySelectorAll('[data-platform="vr"]').forEach(button => { button.title = vr ? 'VR supported' : 'VR requires a compatible headset and browser'; button.classList.toggle('unavailable', !vr); });
    document.querySelectorAll('[data-platform="ar"]').forEach(button => { button.title = ar ? 'AR supported' : 'AR requires a compatible mobile device'; button.classList.toggle('unavailable', !ar); });
  });

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: i ? C.orange : C.cyan, transparent: true, opacity: .7 }));
    ray.scale.z = 2.2; controller.add(ray); scene.add(controller);
    controller.addEventListener('selectstart', () => state.phase === 'disc' ? throwDiscFromController(controller) : boostCycle());
    controller.addEventListener('squeezestart', () => state.phase === 'disc' ? recallDisc() : deployWall());
  }

  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    state.xrMode = session?.environmentBlendMode && session.environmentBlendMode !== 'opaque' ? 'ar' : 'vr';
    if (state.xrMode === 'ar') { scene.background = null; scene.fog = null; state.pendingMode = 'disc'; }
    if (state.phase === 'menu') { ui.menu.classList.add('hidden'); enterMode(); }
    showToast(state.xrMode === 'ar' ? 'AR DISC FIELD ACTIVE' : 'VR SYSTEM LINKED');
  });
  renderer.xr.addEventListener('sessionend', () => {
    state.xrMode = null; scene.background = new THREE.Color(0x010507); scene.fog = new THREE.FogExp2(0x020a0d, .025);
    if (state.phase !== 'menu') exitMode();
  });
}

function updateXRControls() {
  if (!renderer.xr.isPresenting) return;
  for (let i = 0; i < 2; i++) {
    const source = renderer.xr.getSession()?.inputSources?.[i]; const axes = source?.gamepad?.axes; if (!axes) continue;
    const x = axes[2] ?? axes[0] ?? 0, y = axes[3] ?? axes[1] ?? 0;
    if (state.phase === 'disc') { state.touchX = Math.abs(x) > .15 ? x : 0; state.touchY = Math.abs(y) > .15 ? y : 0; }
    if (state.phase === 'cycle') {
      state.key.KeyW = y < -.2; state.key.KeyS = y > .35;
      state.xrTurnLatch ||= [false, false];
      if (Math.abs(x) > .72 && !state.xrTurnLatch[i]) { turnCycle(x > 0 ? 1 : -1); state.xrTurnLatch[i] = true; }
      if (Math.abs(x) < .3) state.xrTurnLatch[i] = false;
    }
  }
}

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth, innerHeight);
}

function animate() {
  const dt = Math.min(clock.getDelta(), .033), time = clock.elapsedTime; state.elapsed = time;
  updateXRControls();
  if (world.userData.particles) { world.userData.particles.rotation.y += dt * .006; world.userData.particles.position.y = Math.sin(time * .1) * .3; }
  if (state.phase === 'menu') updateMenu(dt, time);
  else if (state.phase === 'disc') updateCombat(dt, time);
  else if (state.phase === 'cycle') updateCycles(dt, time);
  updateEffects(dt); updateHud();
  if (renderer.xr.isPresenting) renderer.render(scene, camera); else composer.render();
}

sentinelLoadPromise = loadSentinelModel(); createAtmosphere(); createCombatEnvironment(); createCycleEnvironment();
menuMachines.visible = false; combatWorld.visible = false; cycleWorld.visible = false;
bindUi(); setupXR(); addEventListener('resize', onResize);
renderer.setAnimationLoop(animate);

// Useful for automated captures and direct mode links: ?mode=disc or ?mode=cycle.
const directMode = new URLSearchParams(location.search).get('mode');
if (directMode === 'disc' || directMode === 'cycle') {
  setTimeout(() => { launchMode(directMode); enterMode(); }, 250);
}
