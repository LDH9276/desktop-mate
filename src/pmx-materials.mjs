import { NormalBlending } from 'three';

// Compare every vertex attribute and morph so distinct animated surfaces stay
// separate, even when their positions happen to coincide in the rest pose.
export function findPmxOverlays(mesh) {
  const geometry = mesh.geometry, overlays = new Map();
  if (!geometry?.index) return overlays;
  const attributes = [...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes).flat()];
  const groups = geometry.groups, index = geometry.index;
  const sameSurface = (a, b) => {
    if (a.count !== b.count || a.count === 0) return false;
    for (let i = 0; i < a.count; i++) {
      const ai = index.getX(a.start + i), bi = index.getX(b.start + i);
      for (const attribute of attributes) {
        for (let k = 0; k < attribute.itemSize; k++) {
          if (attribute.getComponent(ai, k) !== attribute.getComponent(bi, k)) return false;
        }
      }
    }
    return true;
  };
  for (let i = 1; i < groups.length; i++) {
    for (let j = 0; j < i; j++) {
      if (groups[i].materialIndex !== groups[j].materialIndex && sameSurface(groups[i], groups[j])) {
        overlays.set(groups[i].materialIndex, groups[j].materialIndex);
        break;
      }
    }
  }
  return overlays;
}

// MMDLoader r169 records texture transparency on the Texture, not its Material.
// Its custom alpha equation also erases destination alpha behind invisible texels.
// Use source-over blending and discard invisible fur/hair texels before depth writes.
// Keep depth writes for full-opacity PMX surfaces: material groups share one
// mesh center, so transparent sorting alone cannot occlude skirt/skin triangles.
export function configurePmxMaterials(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const overlays = findPmxOverlays(mesh);
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
  for (const [materialIndex, material] of materials.entries()) {
    const authoredTransparency = material.transparent || material.opacity < 1;
    material.blending = NormalBlending;
    material.premultipliedAlpha = false;
    const update = () => {
      const textureAlpha = Boolean(material.map && hasAlpha(material.map));
      const baseIndex = overlays.get(materialIndex);
      const overlay = baseIndex !== undefined && textureAlpha;
      material.transparent = authoredTransparency || textureAlpha;
      material.depthWrite = material.opacity === 1 && !overlay;
      material.alphaTest = material.transparent ? 1 / 255 : 0;
      if (overlay) {
        material.userData.pmxOverlayOf = baseIndex;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;
        if (material.userData.outlineParameters && materials[baseIndex].userData.outlineParameters?.visible) {
          material.userData.outlineParameters.visible = false;
        }
      }
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
