# Camera and navigation

The camera is orthographic in all modes. `src/game/camera.ts` supplies desired poses and time-step-independent exponential damping; `CameraRig` applies them to Three.js and calls `updateProjectionMatrix()` after frustum/zoom changes.

- **Follow:** target is Awushi's position plus 1.05m in Y, with a stable offset `[14, 13, 18]`. The vertical span is 13.5m on desktop or 18m in narrow layouts. Translation follows with damping rate 12; the character stays near screen center.
- **Explore:** begins wider, then permits controlled orbit and zoom. Polar angles stay between 0.3 and 1.12 radians, pan is disabled, and the orbit center follows the character without changing the user's chosen angle.
- **Overview:** fits the complete world using a 64m span expanded for narrow aspect ratios. Rotation is fixed for readable district relationships.
- **Studio:** front, back, side and three-quarter presets frame the face at Y=1.9m. Orbit and zoom remain available after the transition.

Mode and preset changes ease for 0.7 seconds. Reduced motion applies the target pose directly. Input is disabled while reading a panel. The camera has a 0.1–180m clipping range, and the follow offset stays above district geometry. Horizontal movement is transformed by the active camera azimuth, so pressing up consistently means away from the camera.

## Collision and heights

`navigation.ts` represents playable islands as discs and bridges as capsules around authored polyline segments. Station footprints are expanded by the hero radius (0.34m). Movement subdivides long steps into at most 0.1m pieces and tries sliding along the free axis when blocked. This prevents tunneling, walking off edges and crossing building footprints without expensive render-mesh raycasts. Bridge heights interpolate between the same samples used to build visible decking, then the character's vertical position damps smoothly across joins.

A breadth-first navigation test checks that every district center and every one of the 17 interaction regions is reachable from the hub. Other tests cover high-delta movement, bridge heights, camera-relative diagonals, vertical proximity filtering and damping invariance across frame rates. Playwright drives the actual keyboard across the six hub bridges and opens each district's introduction.

To tune framing, change the spans and offsets in `camera.ts`; do not scatter camera constants across the interface. To change walkability, edit the shared layout and regenerate the world. Use R or the visible Home control to recover safely without erasing progress.
