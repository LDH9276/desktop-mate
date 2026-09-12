// MMDLoader discovers PNG alpha after the mesh is created.  An alpha-zero
// pixel must not update depth, otherwise it hides the clothing behind it and
// exposes the transparent Electron window as a black strip.
export function preserveMmdAlphaLayers(materials) {
  for (const material of materials) {
    if (!material) continue;
    const disableDepthWriteForAlpha = () => {
      if (!material.transparent || !material.depthWrite) return;
      material.depthWrite = false;
      material.needsUpdate = true;
    };

    disableDepthWriteForAlpha();

    // three.js' MMD loader keeps these callbacks on the texture while it
    // checks the pixels for alpha. Run after that check so materials that
    // become transparent later receive the same depth treatment.
    const callbacks = material.map?.readyCallbacks;
    if (Array.isArray(callbacks)) callbacks.push(disableDepthWriteForAlpha);
  }
}
