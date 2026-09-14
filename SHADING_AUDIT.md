# PMX shadows and settings tabs — 0.6.11

PMX models now support a persisted 0–100% shadow slider (default 65%) in
Model Settings. Zero disables the shadow map and restores original material
emission and lighting intensity. The renderer uses a 2048px PCF shadow map.
Eyes and fur are split into a mesh that shares the animated skeleton and morph
weights but does not receive or cast shadows. Eye materials keep their emission.
Identification currently uses material names (eye, 瞳, 眼, 白目, 虹彩, fur, 毛皮).
Models using unrelated names may require additional material classification.

The split uses cloned geometry: MMDLoader's asynchronous alpha callbacks still
need the original material-indexed groups. Each mesh also has its own material
array because OutlineEffect temporarily replaces array elements.

Settings now have Chat Window, Model Settings, and GPT Connection tabs, with
keyboard arrow navigation. Connection entry buttons target the GPT tab.

Validation: 68 unit tests; actual Denia red loading, 0/65/100% shadow changes,
four excluded eye materials, separate settings tabs and restart persistence;
existing lighting/brightness/saturation controls and persistence. No GPT
messages were sent. Screenshots are in artifacts/shading-tabs.

The separate shading-study renderer produces a reference-inspired preview
with a 4096px map, a four-level toon ramp, portrait framing and neutral backdrop.
It is an actual PMX render, not the original game's proprietary face shader.
Its lighting and presentation are a study, not a pixel-identical EXE screenshot.
