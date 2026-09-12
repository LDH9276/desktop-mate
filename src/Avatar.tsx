import { useEffect, useId, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { CompanionBehavior, clamp } from './behavior.mjs';
import { VmdBodyMotion, jointBlend } from './motion.mjs';
import { clipFiles, createMotionClip, composeMotion } from './expressive-motion.mjs';
import { createMmdRig, createMmdGrantUpdater, mmdRotation } from './motion-rig.mjs';
import { createMmdPhysics, loadAmmo } from './mmd-physics.mjs';
import { preserveMmdAlphaLayers } from './mmd-materials.mjs';
import { createGltfRig, gltfRotation } from './gltf-rig.mjs';
import { defaultAppearance, type Appearance } from './appearance';
import { defaultOutline, type OutlineStyle } from './outline';
import { defaultVisualSettings } from './lighting';

export type AvatarModel = {
  id: string;
  name: string;
  creator: string;
  kind: 'vrm' | 'pmx' | 'gltf' | 'procedural';
  url: string;
  loadingName: string;
};

function createMateCharacter() {
  const root = new THREE.Group();
  const bones = new Map<string, THREE.Object3D>();
  const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02 });
  const fur = material(0x8eaf78), light = material(0xe9efd9), dark = material(0x344238), pink = material(0xd99591);
  const part = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, position: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(...position); mesh.castShadow = false; parent.add(mesh); return mesh;
  };
  const joint = (name: string, parent: THREE.Object3D, position: [number, number, number]) => {
    const node = new THREE.Group(); node.name = name; node.position.set(...position); parent.add(node); bones.set(name, node); return node;
  };

  const spine = joint('spine', root, [0, 0.68, 0]);
  part(new THREE.CapsuleGeometry(0.29, 0.5, 8, 16), fur, spine, [0, 0.22, 0]);
  part(new THREE.CapsuleGeometry(0.2, 0.25, 8, 16), light, spine, [0, 0.18, 0.25]);
  const chest = joint('chest', spine, [0, 0.36, 0]);
  const neck = joint('neck', chest, [0, 0.31, 0]);
  const head = joint('head', neck, [0, 0.13, 0]);
  part(new THREE.SphereGeometry(0.37, 28, 20), fur, head, [0, 0.19, 0]);
  part(new THREE.SphereGeometry(0.24, 24, 16), light, head, [0, 0.10, 0.27]);
  const earGeometry = new THREE.ConeGeometry(0.16, 0.42, 4);
  const leftEar = part(earGeometry, fur, head, [-0.21, 0.51, -0.01]); leftEar.rotation.z = 0.18;
  const rightEar = part(earGeometry, fur, head, [0.21, 0.51, -0.01]); rightEar.rotation.z = -0.18;
  for (const x of [-0.13, 0.13]) part(new THREE.SphereGeometry(0.047, 16, 12), dark, head, [x, 0.24, 0.34]);
  part(new THREE.SphereGeometry(0.045, 12, 10), pink, head, [0, 0.09, 0.49]);

  for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
    const shoulder = joint(`${side}Shoulder`, chest, [sign * 0.3, 0.18, 0]);
    const upperArm = joint(`${side}UpperArm`, shoulder, [sign * 0.06, 0, 0]);
    part(new THREE.CapsuleGeometry(0.085, 0.3, 6, 12), fur, upperArm, [0, -0.2, 0]);
    const lowerArm = joint(`${side}LowerArm`, upperArm, [0, -0.4, 0]);
    part(new THREE.CapsuleGeometry(0.075, 0.25, 6, 12), light, lowerArm, [0, -0.16, 0]);
    const hand = joint(`${side}Hand`, lowerArm, [0, -0.34, 0]);
    part(new THREE.SphereGeometry(0.1, 16, 12), light, hand, [0, 0, 0]);
    const upperLeg = joint(`${side}UpperLeg`, root, [sign * 0.17, 0.68, 0]);
    part(new THREE.CapsuleGeometry(0.11, 0.28, 6, 12), fur, upperLeg, [0, -0.19, 0]);
    const lowerLeg = joint(`${side}LowerLeg`, upperLeg, [0, -0.39, 0]);
    part(new THREE.CapsuleGeometry(0.09, 0.24, 6, 12), light, lowerLeg, [0, -0.15, 0]);
    const foot = joint(`${side}Foot`, lowerLeg, [0, -0.33, 0.07]);
    const footMesh = part(new THREE.SphereGeometry(0.13, 16, 12), light, foot, [0, 0, 0.05]); footMesh.scale.set(1, 0.65, 1.35);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.055, 10, 28, Math.PI * 1.45), fur);
  tail.position.set(0.28, 0.72, -0.14); tail.rotation.set(Math.PI / 2, 0.25, 0.2); root.add(tail);
  return { root, bones, neck };
}

type Props = {
  behavior: MutableRefObject<CompanionBehavior>;
  model: AvatarModel;
  compact?: boolean;
  paused?: boolean;
  zoom?: number;
  proportions?: Appearance;
  outline?: OutlineStyle;
  lighting?: number;
  brightness?: number;
  saturation?: number;
  physics?: boolean;
  physicsWeight?: number;
  hairPhysics?: boolean;
  hairPhysicsWeight?: number;
  onReady?: () => void;
};

function disposeObject(root: THREE.Object3D) {
  VRMUtils.deepDispose(root);
}

export function Avatar({ behavior, model, compact = false, paused = false, zoom = 1, proportions = defaultAppearance, outline = defaultOutline, lighting = defaultVisualSettings.lighting, brightness = defaultVisualSettings.brightness, saturation = defaultVisualSettings.saturation, physics = true, physicsWeight = 0.35, hairPhysics = true, hairPhysicsWeight = 0.35, onReady }: Props) {
  const outlineId = `mate-outline-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const host = useRef<HTMLDivElement>(null);
  const settings = useRef({ paused, zoom, proportions, lighting, brightness, saturation, physics, physicsWeight, hairPhysics, hairPhysicsWeight }); settings.current = { paused, zoom, proportions, lighting, brightness, saturation, physics, physicsWeight, hairPhysics, hairPhysicsWeight };
  const readyCallback = useRef(onReady); readyCallback.current = onReady;
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const el = host.current!;
    let grants: ReturnType<typeof createMmdGrantUpdater> | null = null;
    let cloth: ReturnType<typeof createMmdPhysics> | null = null;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
    catch { setError('3D 화면을 시작할 수 없어요. 그래픽 드라이버를 확인해 주세요.'); return; }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Outline the rendered alpha silhouette so VRM and PMX hair, transparent
    // textures and animated limbs share one consistent stroke. The browser
    // scales the CSS-pixel stroke with HiDPI, preserving the model's colors.
    renderer.domElement.style.filter = `url("#${outlineId}")`;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 30);
    camera.position.set(0, 1.06, 4.7);
    camera.lookAt(0, 0.94, 0);
    const ambient = new THREE.HemisphereLight(0xffffff, 0xc3b4a3, 2); scene.add(ambient);
    const light = new THREE.DirectionalLight(0xfff5e9, 2.4); light.position.set(-2, 4, 5); scene.add(light);
    const fill = new THREE.DirectionalLight(0xf0eeff, 1.3); fill.position.set(3, 2, -3); scene.add(fill);
    const presentation = new THREE.Group(); scene.add(presentation);
    const pivot = new THREE.Group(); presentation.add(pivot);
    let vrm: VRM | undefined;
    let mmd: THREE.SkinnedMesh | undefined;
    let proceduralBones = new Map<string, THREE.Object3D>();
    let gltfBones: ReturnType<typeof createGltfRig> = new Map();
    let modelRoot: THREE.Object3D | undefined;
    let disposed = false, frame = 0, lastFrame = 0, neckY = 1.4, motionTime = 0, renderedLighting = -1, renderedFilter = '';
    let mmdBones: ReturnType<typeof createMmdRig> = new Map();
    const clips = new Map<string, VmdBodyMotion>();
    const feet: THREE.Object3D[] = [];
    const footPosition = new THREE.Vector3();
    let groundY = 0;
    const footHeight = () => Math.min(...feet.map(foot => presentation.worldToLocal(foot.getWorldPosition(footPosition)).y));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const clipLoader = new MMDLoader();
    for (const file of clipFiles) {
      clipLoader.loadVMD(`./motions/gene/${file}`, data => {
        if (disposed) return;
        clips.set(file, createMotionClip(file, data));
        el.dataset.motionClips = String(clips.size);
      }, undefined, () => { if (!disposed) console.warn(`MMD ${file} unavailable; using built-in reaction.`); });
    }
    const clock = new THREE.Clock();
    const pointer = new THREE.Vector2();
    const look = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.set(clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1), clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1));
    };
    const resetPointer = () => pointer.set(0, 0);
    window.addEventListener('pointermove', look);
    window.addEventListener('blur', resetPointer);
    document.addEventListener('pointerleave', resetPointer);
    const gl = renderer.getContext();
    const maxBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    let displayPixelRatio = 0, bufferWidth = 0, bufferHeight = 0;
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      // Electron's devicePixelRatio already includes Windows display scaling
      // and the Mate window's zoom. Do not multiply those scales again or cap
      // high-DPI screens at 1.5x. Only the GPU's actual size limit can reduce it.
      displayPixelRatio = window.devicePixelRatio || 1;
      const pixelRatio = Math.min(displayPixelRatio, maxBufferSize / width, maxBufferSize / height, maxViewport[0] / width, maxViewport[1] / height);
      if (width !== bufferWidth || height !== bufferHeight || renderer.getPixelRatio() !== pixelRatio) {
        renderer.setDrawingBufferSize(width, height, pixelRatio);
        bufferWidth = width; bufferHeight = height;
        camera.aspect = width / height; camera.updateProjectionMatrix();
      }
      el.dataset.pixelRatio = String(pixelRatio);
      el.dataset.displayPixelRatio = String(displayPixelRatio);
      el.dataset.hidpiLimited = String(pixelRatio < displayPixelRatio);
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    window.addEventListener('resize', resize);
    const attach = (root: THREE.Object3D, neck?: THREE.Object3D | null) => {
      if (disposed) { disposeObject(root); return; }
      modelRoot = root;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const height = Math.max(0.001, box.max.y - box.min.y);
      const scale = 1.86 / height;
      root.scale.setScalar(scale);
      root.position.set(-(box.min.x + box.max.x) * 0.5 * scale, -box.min.y * scale, -(box.min.z + box.max.z) * 0.5 * scale);
      root.updateMatrixWorld(true);
      neckY = neck ? neck.getWorldPosition(new THREE.Vector3()).y : 1.45;
      pivot.position.y = neckY;
      root.position.y -= neckY;
      pivot.add(root);
      for (const name of ['leftFoot', 'rightFoot'] as const) {
        const foot = vrm?.humanoid.getRawBoneNode(name) || gltfBones.get(name)?.bone || mmdBones.get(name)?.bone;
        if (foot) feet.push(foot);
      }
      pivot.updateMatrixWorld(true);
      if (feet.length) groundY = footHeight();
      root.traverse(node => { node.frustumCulled = false; });
      setProgress(100); el.dataset.loaded = 'true'; readyCallback.current?.();
    };
    const onProgress = (event: ProgressEvent<EventTarget>) => {
      if (!disposed && event.total) setProgress(Math.min(95, Math.round(event.loaded / event.total * 95)));
    };
    const onError = (reason: unknown) => {
      console.error(`${model.kind.toUpperCase()} load failed`, reason);
      if (!disposed) setError(`${model.name} 모델을 불러오지 못했어요. 모델 파일과 텍스처를 확인해 주세요.`);
    };

    if (model.kind === 'procedural') {
      const mate = createMateCharacter();
      proceduralBones = mate.bones;
      for (const name of ['leftFoot', 'rightFoot']) {
        const foot = proceduralBones.get(name); if (foot) feet.push(foot);
      }
      el.dataset.modelLicense = 'DesktopMate-original';
      attach(mate.root, mate.neck);
    } else if (model.kind === 'vrm') {
      const loader = new GLTFLoader();
      loader.register(parser => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true }));
      loader.load(model.url, gltf => {
        const loaded = gltf.userData.vrm as VRM;
        if (disposed) { disposeObject(loaded.scene); return; }
        vrm = loaded; VRMUtils.rotateVRM0(loaded);
        attach(loaded.scene, loaded.humanoid.getRawBoneNode('neck'));
      }, onProgress, onError);
    } else if (model.kind === 'gltf') {
      const loader = new GLTFLoader();
      loader.load(model.url, gltf => {
        if (disposed) { disposeObject(gltf.scene); return; }
        gltfBones = createGltfRig(gltf.scene);
        el.dataset.genericBones = String(gltfBones.size);
        el.dataset.physics = 'unsupported';
        attach(gltf.scene, gltfBones.get('neck')?.bone || gltfBones.get('head')?.bone);
      }, onProgress, onError);
    } else {
      const loader = new MMDLoader();
      loader.load(model.url, mesh => {
        if (disposed) { disposeObject(mesh); return; }
        mmd = mesh;
        preserveMmdAlphaLayers(Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
        mmdBones = createMmdRig(mesh);
        grants = createMmdGrantUpdater(mesh);
        el.dataset.mmdGrants = String(grants.count);
        attach(mesh, mmdBones.get('neck')?.bone);
        el.dataset.physics = 'loading';
        loadAmmo().then(() => {
          if (disposed) return;
          cloth = createMmdPhysics(mesh);
          el.dataset.physics = cloth ? 'ready' : 'no-data';
          el.dataset.physicsBodies = String(cloth?.bodyCount || 0);
          el.dataset.physicsConstraints = String(cloth?.constraintCount || 0);
        }).catch((reason: unknown) => {
          if (!disposed) { el.dataset.physics = 'unavailable'; console.warn('MMD physics unavailable:', reason); }
        });
      }, onProgress, onError);
    }

    const animate = (timestamp: number) => {
      frame = requestAnimationFrame(animate);
      if (document.hidden || timestamp - lastFrame < (compact ? 30 : 24)) return;
      lastFrame = timestamp;
      // A move to another monitor can change DPI without changing CSS size.
      if (displayPixelRatio !== (window.devicePixelRatio || 1)) resize();
      const delta = clock.getDelta(), dt = Math.min(delta, 0.05), now = Date.now();
      const snapshot = behavior.current.tick(dt, now);
      if (!settings.current.paused) motionTime += dt;
      if (modelRoot && !settings.current.paused) {
        const blend = 1 - Math.exp(-dt * 20);
        const motion = composeMotion(snapshot, motionTime, pointer, reducedMotion.matches, clips);
        cloth?.restore();
        grants?.restore();
        for (const [name, target] of Object.entries(motion.targets)) {
          const follow = jointBlend(name, dt, reducedMotion.matches);
          const bone = vrm?.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
          if (bone) bone.quaternion.slerp(target, follow);
          else if (proceduralBones.has(name)) proceduralBones.get(name)!.quaternion.slerp(target, follow);
          else if (gltfBones.has(name)) {
            const entry = gltfBones.get(name)!;
            entry.bone.quaternion.slerp(gltfRotation(entry, target), follow);
          }
          else {
            const entry = mmdBones.get(name);
            if (entry) entry.bone.quaternion.slerp(mmdRotation(entry, target), follow);
          }
        }
        pivot.position.x = THREE.MathUtils.lerp(pivot.position.x, motion.root.x, blend);
        pivot.position.y = THREE.MathUtils.lerp(pivot.position.y, neckY + (snapshot.dragging ? motion.root.y : 0), blend);
        pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, motion.root.rx, blend);
        pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, motion.root.ry + (compact ? 0 : -0.08), blend);
        pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, motion.root.rz, blend);
        const morph = (aliases: string[], amount: number) => {
          if (!mmd?.morphTargetDictionary || !mmd.morphTargetInfluences) return;
          const key = Object.keys(mmd.morphTargetDictionary).find(name => aliases.includes(name.toLowerCase()) || aliases.includes(name));
          if (key === undefined) return;
          const index = mmd.morphTargetDictionary[key];
          mmd.morphTargetInfluences[index] = THREE.MathUtils.lerp(mmd.morphTargetInfluences[index] || 0, amount, blend);
        };
        const expressions = vrm?.expressionManager;
        if (expressions) {
          for (const [name, amount] of Object.entries(motion.face)) {
            expressions.setValue(name, THREE.MathUtils.lerp(expressions.getValue(name) || 0, amount, blend));
          }
        } else if (mmd) {
          morph(['まばたき', 'blink'], motion.face.blink);
          morph(['にこり', 'smile'], motion.face.happy * 0.65);
          morph(['笑い', '笑い目'], motion.face.happy * 0.35 * (1 - motion.face.blink));
          morph(['にやり', '口角上げ'], motion.face.happy * 0.6);
          morph(['怒り', '怒る', '怒り眉', 'angry'], motion.face.angry);
          morph(['困る', '悲しい', 'sad'], motion.face.sad);
          morph(['口角下げ'], motion.face.sad * 0.55 + motion.face.angry * 0.3);
          morph(['じと目'], snapshot.state === 'annoyed' ? motion.weight * 0.6 : 0);
          morph(['照れ'], snapshot.state === 'embarrassed' ? motion.weight * 0.6 : 0);
          morph(['瞳小'], motion.face.surprised * 0.4);
          morph(['あ', 'aa', 'a'], motion.face.aa);
          morph(['びっくり', '驚き', 'surprise'], motion.face.surprised);
        }
        vrm?.update(dt);
        grants?.update();
        if (cloth) {
          try {
            const current = settings.current;
            const clothing = current.physics && !reducedMotion.matches ? current.physicsWeight : 0;
            const hair = current.hairPhysics && !reducedMotion.matches ? current.hairPhysicsWeight : 0;
            cloth.update(delta, clothing > 0 || hair > 0, clothing, hair);
            el.dataset.physics = clothing > 0 || hair > 0 ? 'active' : 'paused';
            el.dataset.physicsWeight = String(clothing);
            el.dataset.hairPhysicsWeight = String(hair);
            el.dataset.physicsSteps = String(cloth.steps);
          } catch (reason) {
            cloth.dispose(); cloth = null; el.dataset.physics = 'unavailable';
            console.warn('MMD physics stopped:', reason);
          }
        }
        if (!snapshot.dragging && feet.length) {
          pivot.updateMatrixWorld(true);
          pivot.position.y += clamp(groundY - footHeight(), -0.55, 0.55) + motion.root.y;
        }
        el.dataset.motion = snapshot.state;
        el.dataset.motionSource = motion.source ? 'gene-vmd' : 'procedural';
        el.dataset.motionClip = motion.source || '';
        el.dataset.motionPhase = motion.phase;
        el.dataset.idleGesture = motion.idleGesture;
      }
      const { width, height, offsetY, rotation } = settings.current.proportions;
      const { lighting: lightLevel, brightness: brightnessLevel, saturation: saturationLevel } = settings.current;
      if (renderedLighting !== lightLevel) {
        ambient.intensity = 2 * lightLevel;
        light.intensity = 2.4 * lightLevel;
        fill.intensity = 1.3 * lightLevel;
        renderedLighting = lightLevel;
      }
      // Final-output controls remain effective for emissive and custom toon
      // materials whose color may not respond strongly to scene lighting.
      const filter = `brightness(${brightnessLevel}) saturate(${saturationLevel})`;
      if (renderedFilter !== filter) {
        el.style.filter = filter;
        renderedFilter = filter;
      }
      presentation.scale.set(width, height, width);
      presentation.position.y = offsetY;
      presentation.rotation.y = THREE.MathUtils.degToRad(rotation);
      el.dataset.proportions = JSON.stringify({ zoom: settings.current.zoom, width, height, offsetY, rotation });
      el.dataset.lighting = String(lightLevel);
      el.dataset.brightness = String(brightnessLevel);
      el.dataset.saturation = String(saturationLevel);
      camera.zoom = settings.current.zoom; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('pointermove', look);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', resetPointer); document.removeEventListener('pointerleave', resetPointer);
      cloth?.dispose();
      if (modelRoot) disposeObject(modelRoot);
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [behavior, compact, model.id, outlineId]);

  return <div className="avatar-renderer" ref={host} aria-label={`${model.name} 3D 캐릭터`} data-model={model.id} data-outline="silhouette">
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs><filter id={outlineId} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius={outline.thickness} result="expanded" />
        <feGaussianBlur in="expanded" stdDeviation="0.8" result="softened" />
        <feComposite in="softened" in2="SourceAlpha" operator="out" result="edge" />
        <feFlood floodColor={outline.color} floodOpacity={outline.thickness > 0 ? outline.opacity : 0} result="ink" />
        <feComposite in="ink" in2="edge" operator="in" result="stroke" />
        <feMerge><feMergeNode in="stroke" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter></defs>
    </svg>
    {progress < 100 && !error && <div className="model-loading"><span className="loading-orbit" /><b>{model.loadingName}가 오고 있어요</b><span>옷매무새를 다듬는 중… {progress}%</span><div className="load-track"><i style={{ width: `${progress}%` }} /></div></div>}
    {error && <div className="model-loading model-error" role="alert">{error}<button onClick={() => location.reload()}>다시 시도</button></div>}
  </div>;
}
