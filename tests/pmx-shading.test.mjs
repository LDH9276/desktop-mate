import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,BufferGeometry,Skeleton,SkinnedMesh,MeshToonMaterial} from 'three';
import {createPmxShading} from '../src/pmx-shading.mjs';
test('PMX eyes keep their lighting and animated skeleton while shadow strength changes',()=>{
 const geometry=new BufferGeometry();geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
 const materials=['MI_Eye1','face'].map(name=>new MeshToonMaterial({name,emissive:0x777777}));
 const mesh=new SkinnedMesh(geometry,materials),bone=new Bone();mesh.add(bone);mesh.bind(new Skeleton([bone]));
 mesh.morphTargetInfluences=[.4];const original=materials[0].emissive.clone(),shading=createPmxShading(mesh);
 const detail=mesh.children.find(c=>c.isSkinnedMesh);
 assert.notEqual(detail.material,mesh.material,'outline passes must not mutate a shared material array');
 assert.equal(geometry.groups.length,2,'pending loader callbacks retain the full original group indices');
 assert.equal(detail.skeleton,mesh.skeleton);assert.equal(detail.morphTargetInfluences,mesh.morphTargetInfluences);
 assert.deepEqual(mesh.geometry.groups.map(g=>g.materialIndex),[1]);assert.deepEqual(detail.geometry.groups.map(g=>g.materialIndex),[0]);
 shading.update(1);assert.equal(mesh.receiveShadow,true);assert.equal(detail.receiveShadow,false);assert.equal(detail.castShadow,false);
 assert.ok(materials[0].emissive.equals(original));assert.ok(materials[1].emissive.r<original.r);
 shading.update(0);assert.equal(mesh.castShadow,false);assert.ok(materials[1].emissive.equals(original));
 detail.geometry.dispose();mesh.geometry.dispose();geometry.dispose();materials.forEach(m=>m.dispose());mesh.skeleton.dispose();
});
