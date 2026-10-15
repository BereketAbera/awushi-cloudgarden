"""Local raster branding from the exact editable source used by the game GLB.

Changes only presentation: camera, output settings and floor visibility.
Does not regenerate meshes, edit materials, overwrite the blend, or export a GLB.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from common import look_at


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', default=str(Path(__file__).resolve().parents[2]))
parser.add_argument('--draft', action='store_true')
parser.add_argument('--resolution', type=int)
parser.add_argument('--samples', type=int)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
resolution = args.resolution if args.resolution is not None else (512 if args.draft else 2048)
samples = args.samples if args.samples is not None else (24 if args.draft else 128)
if not (256 <= resolution <= 4096) or (not args.draft and resolution < 1024):
    parser.error('Resolution must be 256–4096 for drafts, or 1024–4096 for production.')
if not 1 <= samples <= 1024:
    parser.error('Samples must be 1–1024.')

root = Path(args.root).resolve()
sources = [root / 'assets/source/awushi.blend', root / 'public/assets/awushi.glb']
source_hashes = {str(path.relative_to(root)): sha256(path) for path in sources}
output = root / ('.cache/branding' if args.draft else 'assets/branding')
public = root / 'public/assets/branding'
output.mkdir(parents=True, exist_ok=True)
if not args.draft:
    public.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=str(sources[0]), load_ui=False, use_scripts=False)
scene = bpy.context.scene
rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
rig.animation_data_create()
rig.animation_data.action = bpy.data.actions['Idle']
for track in rig.animation_data.nla_tracks:
    track.mute = True
face = bpy.data.objects['Awushi_ExpressiveFace']
for key in face.data.shape_keys.key_blocks:
    if key.name != 'Basis':
        key.value = 0
scene.frame_set(0)
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = samples
scene.cycles.seed = 24
scene.cycles.use_animated_seed = False
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = resolution
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 35
scene.render.use_file_extension = True
camera = bpy.data.objects['STUDIO_camera']
floor = bpy.data.objects['STUDIO_floor']
scene.camera = camera
camera.data.type = 'ORTHO'

# The full crown, face, and cheek silhouette fit inside a centered circular crop.
# The lower torso intentionally runs out of the square for a close portrait.
views = {
    'profile': {
        'camera': (0.65, -8, 2.85), 'target': (0, 0, 2.48), 'ortho_scale': 3.48,
        'transparent': False, 'sizes': [1024, 512, 256],
    },
    'transparent': {
        'camera': (0.85, -8, 2.8), 'target': (0, 0, 1.97), 'ortho_scale': 4.50,
        'transparent': True, 'sizes': [1024],
    },
}
outputs = []
for name, settings in views.items():
    camera.location = settings['camera']
    camera.data.ortho_scale = settings['ortho_scale']
    look_at(camera, settings['target'])
    scene.render.film_transparent = settings['transparent']
    # Preserve jelly shading; transparency affects the world/floor only.
    scene.cycles.film_transparent_glass = False
    floor.hide_render = settings['transparent']
    scene.render.image_settings.color_mode = 'RGBA' if settings['transparent'] else 'RGB'
    master = output / f'awushi-{name}-master.png'
    scene.render.filepath = str(master)
    bpy.ops.render.render(write_still=True)
    outputs.append({'path': str(master.relative_to(root)), 'size': [resolution, resolution],
                    'transparent': settings['transparent'], 'sha256': sha256(master)})
    if not args.draft:
        for size in settings['sizes']:
            # Reload the master for each size; never resize an already reduced copy.
            img = bpy.data.images.load(str(master), check_existing=False)
            img.scale(size, size)
            destination = public / f'awushi-{name}-{size}.png'
            img.filepath_raw = str(destination)
            img.file_format = 'PNG'
            img.save()
            bpy.data.images.remove(img)
            outputs.append({'path': str(destination.relative_to(root)), 'size': [size, size],
                            'transparent': settings['transparent'], 'sha256': sha256(destination)})

assert source_hashes == {str(path.relative_to(root)): sha256(path) for path in sources}, 'Source asset changed'
manifest = {
    'generator': 'scripts/blender/render_branding.py', 'blender': bpy.app.version_string,
    'source_sha256': source_hashes, 'pose': {'action': 'Idle', 'frame': 0, 'expression': 'Neutral'},
    'render': {'engine': 'CYCLES', 'device': 'CPU', 'samples': samples, 'seed': 24,
               'resolution': resolution, 'denoising': True,
               'view_transform': scene.view_settings.view_transform, 'exposure': scene.view_settings.exposure},
    'views': views, 'outputs': outputs,
    'notes': 'Same source geometry, rig, expression meshes and materials as the game export. '
             'Local Cycles stills; pixels may vary by Blender version and device. Source files unchanged.',
}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('AWUSHI_BRANDING_COMPLETE', json.dumps(manifest))
