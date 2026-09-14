# External PMX physics — 0.6.10

The user's running 0.6.9 window was inspected through Windows Computer Use.
Its selected model was **Denia - (red ver)** (544 rigid bodies), which differs
from the blue variant in the initial idle study. The user reported continued
jitter during the annoyed/drag poses; 0.6.9's idle-only check was insufficient.

The expanded study loads the actual 32_frustrated.vmd, holds its annoyed pose,
and tests dragging with changing sway at 30 rendered frames per second.
In 0.6.9, both models exhibited approximately 2.19 rad (126 degree) sleeve
jumps: fractional slerp from identity changes branch as the accumulated offset
crosses 180 degrees. Keeping filtered secondary rotations within 90 degrees
prevents that branch crossing. A native regression exercises repeated turns.

Animated colliders now interpolate between display frames across the 130 Hz
physics substeps. Secondary output is filtered at 4/s, with angular speed
limited to 0.6 rad/s and each positional component to 0.8 PMX units/s, before
the user's category weight is applied. Authored animation is not slowed.

`scripts/diagnose-physics-poses.mjs` and `artifacts/physics-poses/stable.json`
record the 35% comparison (last 120 of 480 frames):

| Model, annoyed pose | Max local rotation/frame, before → after | Max local position/frame, PMX units |
| --- | --- | --- |
| Denia red | 2.194163 → 0.007668 rad | 0.077329 → 0.016166 |
| 桑多涅 | 2.190941 → 0.007677 rad | 0.357471 → 0.016166 |

These are bounded output measurements in selected poses, not proof of every
possible motion being collision-free. Stabilization intentionally softens
secondary motion and delays contact response. The 90 degree guard can limit
extreme simulated rotations. Original model assets and joint data are unchanged.

The same annoyed/drag studies also pass at 100% weight (full.json): annoyed
rotation changes remain at or below 0.020001 rad/frame; positional changes
remain below 0.046189 PMX units/frame. Native collision, off/restore and partial
weight checks pass, as do all 67 unit tests.

## Earlier 0.6.9 investigation

Checked: 2026-09-14. Local models: 桑多涅 (571 bodies), Denia blue (406 bodies).

Corrected the quaternion multiplication order when converting simulated world
rotation into local bone rotation. A free body under an animated parent had
0.234853 radians of erroneous world rotation in the diagnostic; after correction
the error was below 0.000001 radians. The native regression now exercises this
over 60 parent rotations.

Retained authored collision groups: adding a wrist group also enables contact
with every other body in that group and can destabilize overlapping garments.
Simulation now uses 130 Hz steps with 30 solver iterations. Rendered secondary
offsets receive an exponential filter and angular slew limit, while the main
animated pose remains immediate. Head ornament rotation is limited according
to chain depth so small per-segment rotations do not accumulate excessively.

`scripts/test-external-physics.mjs` runs each local model for 480 frames in off,
cloth-only, hair-only, both (35%), and full (100%) modes. The last 120 frames are
checked for excessive angular jumps and every frame for finite transforms.
Reports and images are in `artifacts/external-physics/` (not distributed).

During diagnosis, after the rotation fix alone, 桑多涅's maximum late-idle angular
jump at 35% was 0.539251 rad; the final combination reduced it to 0.017953 rad.
Denia's corresponding maximum was reduced from 0.145491 to 0.006980 rad.
These measure local bone changes in this deterministic idle study, not all
possible motion clips or physical contact quality. Filtering can delay the
displayed contact response; no claim of eliminating all model intersections.

Model files, bone layouts, textures and authored joint parameters are unchanged.
The additional simulation work increases CPU cost; no broad hardware benchmark
was performed. The external models remain local-only and are not in the EXE.
