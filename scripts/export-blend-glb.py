"""Export the currently opened .blend file as a self-contained GLB.

Usage:
  blender --background model.blend --python scripts/export-blend-glb.py -- output.glb report.json
"""
import json
import os
import sys

import bpy


def arguments():
    marker = sys.argv.index("--") if "--" in sys.argv else -1
    values = sys.argv[marker + 1:]
    if len(values) != 2:
        raise SystemExit("expected output.glb and report.json")
    return (os.path.abspath(value) for value in values)


output, report_file = arguments()
os.makedirs(os.path.dirname(output), exist_ok=True)

# Some authored files are saved in Pose Mode. Blender 5.2 can emit JOINTS and
# WEIGHTS without a glTF skin in that state, so normalize the export context.
if bpy.context.object is not None and bpy.context.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")

armatures = []
for obj in bpy.data.objects:
    if obj.type == "ARMATURE":
        armatures.append({
            "name": obj.name,
            "bones": [bone.name for bone in obj.data.bones],
        })

texts = {}
for block in bpy.data.texts:
    body = block.as_string().strip()
    if body:
        texts[block.name] = body[:4000]

report = {
    "source": bpy.data.filepath,
    "blender": bpy.app.version_string,
    "objects": {kind: sum(obj.type == kind for obj in bpy.data.objects) for kind in sorted({obj.type for obj in bpy.data.objects})},
    "armatures": armatures,
    "deformBones": {
        obj.name: [bone.name for bone in obj.data.bones if bone.use_deform]
        for obj in bpy.data.objects if obj.type == "ARMATURE"
    },
    "meshModifiers": {
        obj.name: [modifier.type for modifier in obj.modifiers]
        for obj in bpy.data.objects if obj.type == "MESH" and obj.modifiers
    },
    "rigidBodies": sum(obj.rigid_body is not None for obj in bpy.data.objects),
    "rigidBodyConstraints": sum(obj.rigid_body_constraint is not None for obj in bpy.data.objects),
    "animations": [action.name for action in bpy.data.actions],
    "texts": texts,
}

bpy.ops.export_scene.gltf(
    filepath=output,
    export_format="GLB",
    export_yup=True,
    export_skins=True,
    # These generated Rigify files keep skin dependencies outside Blender's
    # simple deform-bone subset. Exporting only deform bones produces a GLB
    # that looks correct at rest but has no glTF skin, so retain the full rig.
    export_def_bones=False,
    export_animations=True,
    export_morph=True,
    export_extras=True,
    export_cameras=False,
    export_lights=False,
    use_visible=True,
)

report["output"] = output
report["outputBytes"] = os.path.getsize(output)
with open(report_file, "w", encoding="utf-8") as stream:
    json.dump(report, stream, ensure_ascii=False, indent=2)
