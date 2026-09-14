export const defaultPhysicsWeight = 0.35;
export function physicsWeight(value, fallback = defaultPhysicsWeight) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}
export function loadPhysicsWeight(key) { return physicsWeight(localStorage.getItem(key)); }

// A hair strand needs its full joint/contact response. Do not confuse it with
// a small head ornament just because both descend from the head bone.
export function isHairStrand(bone, bodyNames = '') {
  const hair = /hair|髪|髮|发|もみあげ|アホ毛|ツインテ|ポニテ/i;
  const ornament = /ribbon|リボン|发带|髪飾|髮飾|ornament|accessory/i;
  if (ornament.test(bone.name + ' ' + bodyNames)) return false;
  if (hair.test(bone.name + ' ' + bodyNames)) return true;
  for (let parent = bone.parent; parent?.isBone; parent = parent.parent) {
    if (ornament.test(parent.name)) return false;
    if (hair.test(parent.name)) return true;
  }
  return false;
}

// Hair names vary between PMX exporters. Head descendants include ribbons and
// ornaments: keep them with hair, while explicitly named garments stay clothing.
export function physicsCategory(bone, bodyNames = '') {
  const garment = /skirt|cloth|dress|coat|cape|スカート|裙|衣摆|披/i;
  const hair = /hair|髪|髮|发|髮|前髮|後髮|もみあげ|アホ毛|ツインテ|ポニテ/i;
  if (garment.test(`${bone.name} ${bodyNames}`)) return 'cloth';
  if (hair.test(`${bone.name} ${bodyNames}`)) return 'hair';
  for (let parent = bone.parent; parent?.isBone; parent = parent.parent) {
    if (/^(頭|head)$/i.test(parent.name) || hair.test(parent.name)) return 'hair';
  }
  return 'cloth';
}
