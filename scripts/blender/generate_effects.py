"""Local reusable deployment props. Runtime motion follows simulation events.

The GLB stores named prototypes at their own local origin. The editable Blender
review scene arranges copies for inspection after exporting those prototypes.
"""
import argparse, json, math, sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import reset, material, export_glb, look_at, area
import asset_factory as F

parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True)
parser.add_argument('--previews', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT = Path(args.root).resolve()
for directory in ['assets/source', 'assets/previews', 'public/assets']:
    (ROOT/directory).mkdir(parents=True, exist_ok=True)
reset()
scene = bpy.context.scene
cyan = material('Signal cyan enamel', (.045, .58, .68), .24, .16)
navy = material('Deep teal structure', (.025, .10, .14), .28, .3)
cream = material('Warm porcelain', (.8, .91, .84), .25, .06)
amber = material('Approval amber', (.95, .56, .12), .27, .1)
glow = material('Soft cyan status light', (.17, .91, .89), .23, .0, emission=.6)


def combine(name, before, description):
    objects = [obj for obj in scene.objects if obj not in before and obj.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for uv in list(obj.data.uv_layers): obj.data.uv_layers.remove(uv)
    slots, mapping = [], {}
    for index, mat in enumerate(obj.data.materials):
        if mat not in slots: slots.append(mat)
        mapping[index] = slots.index(mat)
    indices = [mapping[face.material_index] for face in obj.data.polygons]
    obj.data.materials.clear()
    for mat in slots: obj.data.materials.append(mat)
    for face, index in zip(obj.data.polygons, indices): face.material_index = index
    obj['generator'] = 'scripts/blender/generate_effects.py'
    obj['role'] = description
    obj['units'] = 'metres'
    return obj


prototypes = []
before = set(scene.objects)
F.box('Code card', (0, 0, .23), (.64, .14, .46), cream, .055)
for sign in [-1, 1]:
    F.rod('Code bracket', (sign*.18, -.085, .33), (sign*.27, -.085, .23), .022, cyan, 8)
    F.rod('Code bracket', (sign*.27, -.085, .23), (sign*.18, -.085, .13), .022, cyan, 8)
F.rod('Code slash', (.04, -.085, .34), (-.04, -.085, .12), .018, navy, 8)
prototypes.append(combine('CodePacket', before, 'Code change travelling from source repository to CI'))

before = set(scene.objects)
F.box('Container shell', (0, 0, .23), (.62, .42, .46), cyan, .045)
for x in [-.22, -.11, 0, .11, .22]:
    for y in [-.216, .216]: F.box('Container rib', (x, y, .23), (.025, .018, .32), navy, .007)
F.box('Promotion band', (0, 0, .47), (.12, .43, .035), amber, .01)
F.box('Digest label', (0, -.23, .25), (.26, .025, .13), cream, .015)
for x in [-.075, -.025, .025, .075]: F.box('Digest mark', (x, -.246, .25), (.016, .007, .07), navy, 0)
prototypes.append(combine('ImagePackage', before, 'Immutable container image identified by digest'))

before = set(scene.objects)
F.box('Manifest card', (0, 0, .25), (.48, .11, .5), cream, .035)
for index in range(4):
    F.box('Manifest line', (.025 if index%2 else -.025, -.065, .39-index*.09), (.28 if index%2 else .19, .012, .018), cyan if index<3 else amber, .004)
F.box('Manifest binding', (-.23, 0, .25), (.055, .13, .5), navy, .01)
prototypes.append(combine('ConfigPacket', before, 'Rendered desired state sent through the local Git mirror to Argo CD'))

before = set(scene.objects)
F.cylinder('Pod footing', (0, 0, .035), .27, .07, navy, 20, .02)
F.cylinder('Pod capsule', (0, 0, .31), .23, .5, cyan, 24, .065)
F.cylinder('Pod cap', (0, 0, .59), .215, .065, cream, 24, .02)
F.box('Pod status panel', (0, -.23, .35), (.22, .035, .18), navy, .02)
F.box('Pod lamp', (0, -.252, .37), (.13, .015, .055), glow, .012)
F.torus('Pod collar', (0, 0, .12), .23, .018, cream)
prototypes.append(combine('PodShell', before, 'Reusable visual pod; color and visibility reflect actual replica state'))

before = set(scene.objects)
F.sphere('Signal core', (0, 0, .14), (.14, .14, .14), glow)
F.torus('Signal equator', (0, 0, .14), .145, .018, cream)
prototypes.append(combine('SignalOrb', before, 'A bounded telemetry event marker'))

before = set(scene.objects)
F.torus('Sync arc', (0, 0, .04), .36, .027, glow)
for angle in [0, math.tau/3, math.tau*2/3]:
    F.sphere('Sync node', (.36*math.cos(angle), .36*math.sin(angle), .04), (.055, .055, .055), amber)
prototypes.append(combine('SyncRing', before, 'Active synchronization or readiness halo'))

path = ROOT/'public/assets/deployment-effects.glb'
export_glb(path, prototypes)
manifest = {'generator': 'scripts/blender/generate_effects.py', 'version': 1, 'blender': bpy.app.version_string,
            'asset': 'deployment-effects.glb', 'bytes': path.stat().st_size, 'coordinate_system': 'Y-up metres after export',
            'animation_policy': 'No autonomous clips: simulation history and infrastructure state drive runtime motion.', 'prototypes': {}}
for obj in prototypes:
    obj.data.calc_loop_triangles()
    manifest['prototypes'][obj.name] = {'triangles': len(obj.data.loop_triangles), 'vertices': len(obj.data.vertices),
        'materials': len(obj.data.materials), 'role': obj['role'],
        'bounds_blender': [[round(fn(v.co[i] for v in obj.data.vertices), 5) for i in range(3)] for fn in [min, max]]}
manifest['triangles'] = sum(item['triangles'] for item in manifest['prototypes'].values())
assert manifest['triangles'] < 8000, manifest['triangles']
assert manifest['bytes'] < 400*1024, manifest['bytes']

# A local studio composed only of generated geometry and area lights.
positions = [(-1.2, -.5, 0), (0, -.5, 0), (1.2, -.5, 0), (-1.2, .65, 0), (0, .65, 0), (1.2, .65, 0)]
for obj, pos in zip(prototypes, positions): obj.location = pos
floor = material('Studio deep slate', (.016, .035, .046), .42)
F.box('Review plinth', (0, .1, -.12), (4.3, 2.9, .2), floor, .1)
for obj in prototypes:
    F.lettering('Label '+obj.name, obj.name.replace('Packet', ' packet').replace('Package', ' package').replace('Shell', ' shell').replace('Orb', ' orb').replace('Ring', ' ring'),
                (obj.location.x, obj.location.y-.4, .015), .11, cream, (0, 0, 0))
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.world.color = (.12, .12, .12)
scene.view_settings.view_transform = 'Standard'
scene.view_settings.exposure = -.7
scene.render.resolution_x = 1200; scene.render.resolution_y = 900; scene.render.resolution_percentage = 100
area('Large softbox', (1, -3, 6), 600, (.8, .95, 1), 4, target=(0, 0, .2))
area('Warm side light', (-4, -1, 3), 350, (1, .78, .48), 3, target=(0, 0, .2))
area('Cyan rim', (1, 4, 4), 450, (.4, .9, 1), 3, target=(0, 0, .2))
bpy.ops.object.camera_add(location=(4, -6, 5))
camera = bpy.context.object; camera.name = 'Effects review camera'; camera.data.type = 'ORTHO'; camera.data.ortho_scale = 5.5
look_at(camera, (0, .1, .1)); scene.camera = camera
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/effects.blend'), compress=True)
manifest['previews'] = []
if args.previews:
    for name, location in [('three-quarter', (4, -6, 5)), ('front', (0, -7, 4)), ('back', (-4, 6, 5))]:
        camera.location = location; look_at(camera, (0, .1, .1))
        scene.render.filepath = str(ROOT/f'assets/previews/deployment-effects-{name}.png')
        bpy.ops.render.render(write_still=True)
        manifest['previews'].append(f'assets/previews/deployment-effects-{name}.png')
(ROOT/'assets/source/effects-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('EFFECTS_GENERATED', json.dumps(manifest), flush=True)
