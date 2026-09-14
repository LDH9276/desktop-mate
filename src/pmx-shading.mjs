import { SkinnedMesh } from 'three';

export function createPmxShading(mesh) {
  const materials = Array.isArray(mesh.material) ? [...mesh.material] : [mesh.material];
  const exempt = new Set(materials.flatMap((m, i) => /eye|瞳|眼|白目|虹彩|fur|毛皮/i.test(m.name) ? [i] : []));
  const original = materials.map(m => m.emissive?.clone());
  if (exempt.size) {
    // MMDLoader's pending texture callbacks retain the original geometry and
    // index its groups by material number. Split a clone, leaving those groups
    // intact until the callbacks finish.
    const loadingGeometry = mesh.geometry;
    mesh.geometry = loadingGeometry.clone();
    loadingGeometry.dispose();
    const groups = mesh.geometry.groups.map(g => ({ ...g })), geometry = mesh.geometry.clone();
    geometry.clearGroups(); mesh.geometry.clearGroups();
    for (const g of groups) (exempt.has(g.materialIndex) ? geometry : mesh.geometry).addGroup(g.start, g.count, g.materialIndex);
    // OutlineEffect temporarily replaces array elements; meshes need separate
    // arrays even though their individual material objects can be shared.
    const detail = new SkinnedMesh(geometry, [...materials]);
    detail.frustumCulled = false;
    detail.name = 'Unshadowed eyes and fur';
    detail.bind(mesh.skeleton, mesh.bindMatrix);
    detail.morphTargetInfluences = mesh.morphTargetInfluences;
    detail.morphTargetDictionary = mesh.morphTargetDictionary;
    detail.castShadow = detail.receiveShadow = false;
    mesh.add(detail);
  }
  return {
    eyeMaterials: materials.filter(m => /eye|瞳|眼|白目|虹彩/i.test(m.name)).length,
    update(strength) {
      mesh.castShadow = mesh.receiveShadow = strength > 0;
      materials.forEach((m, i) => {
        if (original[i]) m.emissive.copy(original[i]).multiplyScalar(exempt.has(i) ? 1 : 1 - strength * .8);
      });
    },
  };
}
