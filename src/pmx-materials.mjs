import { NormalBlending } from 'three';

// MMDLoader r169 records texture transparency on the Texture, not its Material.
// Its custom alpha equation also erases destination alpha behind invisible texels.
// Use source-over blending and discard invisible fur/hair texels before depth writes.
// Keep depth writes for full-opacity PMX surfaces: material groups share one
// mesh center, so transparent sorting alone cannot occlude skirt/skin triangles.
export function configurePmxMaterials(mesh) {
  const alphaCache = new WeakMap();
  function hasAlpha(texture) {
    if (alphaCache.has(texture)) return alphaCache.get(texture);
    const image = texture.image;
    let pixels = image?.data;
    if (!pixels && image?.width && image?.height) {
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    let alpha = Boolean(texture.transparent);
    if (pixels && pixels.length === image.width * image.height * 4) {
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 255) { alpha = true; break; }
      }
    }
    alphaCache.set(texture, alpha);
    return alpha;
  }
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    const authoredTransparency = material.transparent || material.opacity < 1;
    material.blending = NormalBlending;
    material.premultipliedAlpha = false;
    const update = () => {
      material.transparent = authoredTransparency || Boolean(material.map && hasAlpha(material.map));
      material.depthWrite = material.opacity === 1;
      material.alphaTest = material.transparent ? 1 / 255 : 0;
      material.needsUpdate = true;
    };
    // Texture loading finishes after MMDLoader's mesh callback. Register once
    // per material (including shared textures), and handle already loaded maps.
    if (material.map?.readyCallbacks) {
      material.transparent = true;
      material.depthWrite = material.opacity === 1;
      material.alphaTest = 1 / 255;
      material.needsUpdate = true;
      material.map.readyCallbacks.push(update);
    } else update();
  }
}
