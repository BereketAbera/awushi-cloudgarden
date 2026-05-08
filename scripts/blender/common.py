"""Shared deterministic Blender modeling, material, and export helpers."""
import bpy, math
from mathutils import Vector
from pathlib import Path

def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for data in list(bpy.data.materials): bpy.data.materials.remove(data)

def material(name, color, roughness=.25, metallic=0, transmission=0, emission=0):
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Transmission Weight'].default_value=transmission
    p.inputs['IOR'].default_value=1.36
    p.inputs['Coat Weight'].default_value=.4
    p.inputs['Coat Roughness'].default_value=.12
    p.inputs['Emission Color'].default_value=(*color,1)
    p.inputs['Emission Strength'].default_value=emission
    mat.diffuse_color=(*color,1)
    return mat

def add_jelly_volume(mat, color, density, thickness):
    """Add matching Cycles absorption and portable glTF volume parameters.

    `color` is linear RGB attenuation color; `density` is inverse attenuation
    distance in meters; `thickness` is the real-time approximate optical depth.
    Blender computes its own geometric ray distance. glTF/Three.js use the
    explicit thicknessFactor, so use a representative depth of the asset.
    The surface material must already have nonzero physical transmission.
    Repeated calls update the same nodes instead of appending duplicate groups.
    """
    if len(color) != 3 or any(not math.isfinite(c) or c < 0 or c > 1 for c in color):
        raise ValueError('Volume attenuation color must be three finite linear RGB values in [0, 1]')
    if not math.isfinite(density) or density < 0:
        raise ValueError('Volume density must be finite and nonnegative')
    if not math.isfinite(thickness) or thickness <= 0:
        raise ValueError('glTF volume thickness must be finite and positive')
    mat.use_nodes = True
    tree = mat.node_tree
    output = next((n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if output is None:
        output = tree.nodes.new('ShaderNodeOutputMaterial')
    absorption = tree.nodes.get('Awushi_volume_absorption')
    if absorption is None:
        absorption = tree.nodes.new('ShaderNodeVolumeAbsorption')
        absorption.name = 'Awushi_volume_absorption'
        absorption.label = 'Jelly depth / glTF attenuation'
    absorption.inputs['Color'].default_value = (*color, 1)
    absorption.inputs['Density'].default_value = density
    tree.links.new(absorption.outputs['Volume'], output.inputs['Volume'])

    # The official exporter reads Thickness from a group with this exact name.
    # This metadata group is deliberately unconnected to the Cycles surface.
    group_name = 'glTF Material Output'
    group = bpy.data.node_groups.get(group_name)
    if group is None:
        group = bpy.data.node_groups.new(group_name, 'ShaderNodeTree')
        group.nodes.new('NodeGroupInput')
        group.nodes.new('NodeGroupOutput')
    if not any(i.item_type == 'SOCKET' and i.in_out == 'INPUT' and i.name == 'Thickness' for i in group.interface.items_tree):
        socket = group.interface.new_socket(name='Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
        socket.min_value = 0
        socket.default_value = 0
    settings = next((n for n in tree.nodes if n.type == 'GROUP' and n.node_tree == group), None)
    if settings is None:
        settings = tree.nodes.new('ShaderNodeGroup')
        settings.node_tree = group
        settings.name = 'Awushi_glTF_volume'
        settings.label = 'Portable glTF optical thickness'
    settings.inputs['Thickness'].default_value = thickness
    return absorption, settings

def smooth(obj):
    if obj.type=='MESH':
        for p in obj.data.polygons: p.use_smooth=True
    return obj

def uv(name, loc, scale, mat=None, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    smooth(o)
    if mat: o.data.materials.append(mat)
    return o

def curve(name, points, radius, mat, resolution=5):
    d=bpy.data.curves.new(name,'CURVE'); d.dimensions='3D'; d.resolution_u=resolution
    d.bevel_depth=radius; d.bevel_resolution=4
    s=d.splines.new('BEZIER'); s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):
        p.co=co; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); d.materials.append(mat)
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o=bpy.context.object
    o.select_set(False); smooth(o)
    return o

def look_at(obj, point):
    obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()

def area(name, loc, power, color, size, target=(0,0,1.8), size_y=None):
    d=bpy.data.lights.new(name,'AREA'); d.energy=power; d.color=color
    d.shape='RECTANGLE'; d.size=size; d.size_y=size_y or size
    o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); o.location=loc; look_at(o,target)
    return o

def export_glb(path, objects, animations=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
        export_animations=animations,export_animation_mode='ACTIONS',export_yup=True,
        export_apply=False,export_materials='EXPORT',export_extras=True,
        export_force_sampling=True,export_frame_range=False,export_anim_single_armature=True)
