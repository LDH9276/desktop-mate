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

# Generated Rigify files contain hundreds of controller display meshes. Keep
# renderable meshes and the armatures that actually deform them; exporting the
# whole authoring scene can make Blender detach glTF skins from the mesh.
bpy.ops.object.select_all(action="DESELECT")
selected = [obj for obj in bpy.data.objects if obj.type == "MESH" and not obj.name.startswith("WGT-") and len(obj.data.polygons)]
# The source files use Geometry Nodes for Blender-only viewport effects. Their
# evaluated output drops vertex-group membership, making glTF omit the skin.
# DesktopMate supplies its own outline, so disable those modifiers for export.
for obj in selected:
    for modifier in obj.modifiers:
        if modifier.type == "NODES":
            modifier.show_viewport = False
            modifier.show_render = False
armatures = {
    modifier.object for obj in selected for modifier in obj.modifiers
    if modifier.type == "ARMATURE" and modifier.object is not None
}
for obj in [*selected, *armatures]:
    obj.select_set(True)

# The bundled game shaders are large custom node groups that glTF cannot
# represent. Reconnect each material's authored diffuse image to a standard
# Principled BSDF so color and alpha survive in Three.js.
for obj in selected:
    for slot in obj.material_slots:
        material = slot.material
        if not material or not material.use_nodes:
            continue
        image_nodes = [node for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image]
        diffuse = next((node.image for node in image_nodes if "diffuse" in node.name.lower() or "base color" in node.name.lower()), None)
        if diffuse is None:
            continue
        nodes = material.node_tree.nodes
        nodes.clear()
        output_node = nodes.new("ShaderNodeOutputMaterial")
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = diffuse
        shader.inputs["Roughness"].default_value = 0.72
        shader.inputs["Metallic"].default_value = 0.0
        material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
        if any(word in material.name.lower() for word in ("hair", "bangs")):
            material.node_tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
            if hasattr(material, "surface_render_method"):
                material.surface_render_method = "DITHERED"
        material.node_tree.links.new(shader.outputs["BSDF"], output_node.inputs["Surface"])

from io_scene_gltf2.blender.exp import nodes as gltf_nodes
gltf_skins = gltf_nodes.gltf2_blender_gather_skins
original_gather_skin = gltf_skins.gather_skin


def repaired_gather_skin(armature_uuid, settings):
    """Repair Blender 5.2's filtered Rigify tree before skin gathering."""
    tree = settings["vtree"]
    armature = tree.nodes[armature_uuid]
    # In these files the selection filter leaves all root pose bones at the
    # scene root. gather_skin then sees zero armature children and omits the
    # skin even though JOINTS/WEIGHTS are written. Reattach only true roots.
    for bone_uuid in armature.bones.values():
        bone = tree.nodes[bone_uuid]
        if bone.blender_bone.parent is None and bone_uuid not in armature.children:
            if bone_uuid in tree.roots:
                tree.roots.remove(bone_uuid)
            bone.parent_uuid = armature_uuid
            armature.children.append(bone_uuid)
    result = original_gather_skin(armature_uuid, settings)
    if os.environ.get("MATE_GLTF_TRACE"):
        print("MATE_SKIN_TRACE", armature.blender_object.name, "roots", len(armature.children), "skin", bool(result))
    return result


gltf_skins.gather_skin = repaired_gather_skin

if os.environ.get("MATE_GLTF_TRACE"):
    original_node_skin = gltf_nodes.gather_skin

    def traced_node_skin(vnode, settings):
        result = original_node_skin(vnode, settings)
        item = settings["vtree"].nodes[vnode]
        if item.blender_object and item.blender_object.type == "MESH":
            print("MATE_NODE_SKIN_TRACE", item.blender_object.name, "armature", item.armature, "modifiers", [modifier.type for modifier in item.blender_object.modifiers], "groups", len(item.blender_object.vertex_groups), bool(result))
        return result

    gltf_nodes.gather_skin = traced_node_skin

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
    use_selection=True,
)

report["output"] = output
report["outputBytes"] = os.path.getsize(output)
with open(report_file, "w", encoding="utf-8") as stream:
    json.dump(report, stream, ensure_ascii=False, indent=2)
