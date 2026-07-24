# Project Neon

Project Neon is the primary cinematic WebXR application in this directory. The supplied `SAMPLETRONGAME` folder is retained only as a gameplay reference; it is not the active runtime or the visual foundation.

## Experiences

- **Disc Combat:** Desktop, VR, and AR. Fight animated 3D sentinels from floating platforms using flat, horizontally spinning identity discs. Later waves activate more enemies and more platforms.
- **Cycle Arena:** Desktop and VR. Race one player cycle against four differently colored rivals in a large square arena. Cycles move on cardinal headings, turn in exact 90-degree increments, and continuously emit lethal light walls from the rear of each machine.

The cinematic landing screen provides explicit launch buttons for every supported game and platform combination.

## Run

```bash
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

## Desktop controls

### Disc Combat

- WASD: move
- Mouse: aim
- Left mouse: throw
- Right mouse: recall
- Space: jump between platforms
- Shift: sprint

### Cycle Arena

- W/S: accelerate or brake
- A/D: instant 90-degree left or right turn
- Left mouse: boost
- Right mouse: trail surge
- Escape: return to landing screen
