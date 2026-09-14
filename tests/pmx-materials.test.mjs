import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, DataTexture, MeshToonMaterial, CustomBlending, SrcAlphaFactor, DstAlphaFactor, NormalBlending } from 'three';
import { configurePmxMaterials, findPmxOverlays } from '../src/pmx-materials.mjs';

const texture = alpha => new DataTexture(new Uint8Array([255,255,255,alpha]),1,1);
const material = options => new MeshToonMaterial({blending:CustomBlending,blendSrcAlpha:SrcAlphaFactor,blendDstAlpha:DstAlphaFactor,...options});

const layeredGeometry = () => {
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,1,0],3));
  g.setIndex([0,1,2,3,4,5]);g.addGroup(0,3,0);g.addGroup(3,3,1);
  return g;
};

test('coincident alpha highlights do not write depth or duplicate the base outline', () => {
  const geometry=layeredGeometry(),base=material({map:texture(255)}),map=texture(128),overlay=material({map});
  base.userData.outlineParameters={visible:true};overlay.userData.outlineParameters={visible:true};
  map.readyCallbacks=[];
  configurePmxMaterials({geometry,material:[base,overlay]});
  for(const callback of map.readyCallbacks)callback(map);
  assert.equal(base.depthWrite,true);assert.equal(base.userData.outlineParameters.visible,true);
  assert.equal(overlay.depthWrite,false);assert.equal(overlay.userData.outlineParameters.visible,false);
  assert.equal(overlay.userData.pmxOverlayOf,0);assert.equal(overlay.polygonOffset,true);
});

test('coincident rest poses with different skinning or morphs remain separate surfaces', () => {
  const geometry=layeredGeometry();
  geometry.setAttribute('skinIndex',new Float32BufferAttribute([0,0,0,1,1,1],1));
  assert.equal(findPmxOverlays({geometry}).size,0);
  geometry.deleteAttribute('skinIndex');
  geometry.morphAttributes.position=[new Float32BufferAttribute([0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],3)];
  assert.equal(findPmxOverlays({geometry}).size,0);
});

test('late shared PMX alpha textures update every material, including unflagged texture alpha', () => {
  const map=texture(0);map.readyCallbacks=[];
  const a=material({map}),b=material({map});
  configurePmxMaterials({material:[a,b]});
  for(const callback of map.readyCallbacks)callback(map);
  for(const m of [a,b]) {
    assert.equal(m.transparent,true);
    assert.equal(m.depthWrite,true);
    assert.ok(m.alphaTest>0);
    assert.equal(m.blending,NormalBlending);
  }
});

test('opaque textures retain occlusion; authored translucency and hidden materials are preserved', () => {
  const map=texture(255);
  const opaque=material({map}),glass=material({map,opacity:.4,transparent:true}),hidden=material({opacity:0,transparent:true});
  configurePmxMaterials({material:[opaque,glass,hidden]});
  assert.equal(opaque.transparent,false);assert.equal(opaque.depthWrite,true);
  assert.equal(glass.opacity,.4);assert.equal(glass.transparent,true);assert.equal(glass.depthWrite,false);
  assert.equal(hidden.opacity,0);assert.ok(hidden.alphaTest>0);
});

test('a late fully opaque texture returns to the opaque depth pass', () => {
  const map=texture(255);map.readyCallbacks=[];
  const m=material({map});configurePmxMaterials({material:m});
  for(const callback of map.readyCallbacks)callback(map);
  assert.equal(m.transparent,false);assert.equal(m.depthWrite,true);assert.equal(m.alphaTest,0);
});
