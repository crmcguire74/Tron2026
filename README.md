# Project Neon

Project Neon is a cinematic Three.js prototype with two playable modes:

- **Shattered Core:** first-person disc combat across five escalating enemy waves.
- **Vector Run:** a six-rider light-cycle circuit with boost, energy walls, and lap tracking.

The characters, enemies, discs, cycles, arena machinery, and animation rigs are constructed as articulated real-time 3D objects. The visual system uses physically based materials, emissive mechanical components, volumetric fog, reflections, shadows, particles, and bloom.

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
- Space: phase dodge
- Escape: return to menu

### Vector Run

- W/S: accelerate and brake
- A/D: lane steering
- Shift: drift/brake
- Left click: boost
- Right click: deploy energy wall
- Escape: return to menu

Touch controls appear automatically on coarse-pointer devices. WebXR entry is exposed when immersive VR is supported by the browser.

## Production build

```bash
npm run build
npm run preview
```

The optimized output is generated in `dist/`.
