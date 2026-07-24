# Project Neon

Project Neon is a cinematic Three.js prototype with two playable modes:

- **Shattered Core:** first-person disc combat across floating platforms and five escalating enemy waves.
- **Vector Run:** a square-arena duel against four colored enemy cycles, each producing its own continuous lethal light wall.

The supplied skinned sentinel GLB is used in gameplay with its running animation. Discs are modeled as horizontal spinning frisbee-like weapons. Cycles, arena machinery, and effects are articulated real-time 3D objects rendered with physically based materials, emissive components, fog, reflections, shadows, particles, and bloom.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`. Direct mode links are available at `?mode=disc` and `?mode=cycle`.

## Controls

### Disc combat

- WASD: move
- Mouse: look
- Left click: throw disc
- Right click: recall disc
- Space: jump between platforms
- Escape: return to menu

### Vector Run

- W/S: accelerate and brake
- A/D: exact 90-degree left/right turns
- Shift: drift/brake
- Left click: boost
- Right click: deploy energy wall
- Escape: return to menu

The landing screen explicitly exposes Disc Combat for Desktop, VR, and AR; Cycle Arena is available for Desktop and seated VR. Touch controls appear automatically on coarse-pointer devices. Unsupported immersive modes are identified after WebXR capability detection.

## Production build

```bash
npm run build
npm run preview
```

The optimized output is generated in `dist/`.
