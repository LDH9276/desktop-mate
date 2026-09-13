import test from 'node:test';
import assert from 'node:assert/strict';
import { DataTexture, MeshToonMaterial, CustomBlending, SrcAlphaFactor, DstAlphaFactor, NormalBlending } from 'three';
import { configurePmxMaterials } from '../src/pmx-materials.mjs';

const texture = alpha => new DataTexture(new Uint8Array([255,255,255,alpha]),1,1);
const material = options => new MeshToonMaterial({blending:CustomBlending,blendSrcAlpha:SrcAlphaFactor,blendDstAlpha:DstAlphaFactor,...options});

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
