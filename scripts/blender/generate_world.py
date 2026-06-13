"""Build the six-district world from the same layout used by runtime navigation.
Run with Blender --background --python scripts/blender/generate_world.py -- --root . --previews
All coordinates in world-layout.json are glTF / Three Y-up. Conversion is (x,-z,y).
"""
import argparse, hashlib, json, math, runpy, sys
from pathlib import Path
import bpy
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import look_at, area, export_glb
import asset_factory as F

parser=argparse.ArgumentParser();parser.add_argument('--root',required=True);parser.add_argument('--previews',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=Path(args.root).resolve();layout_path=ROOT/'src/data/world-layout.json';layout=json.loads(layout_path.read_text())
for folder in ['public/assets','assets/source','assets/previews']:(ROOT/folder).mkdir(parents=True,exist_ok=True)

# Keep the original three landmarks and legacy export contract reproducible.
# Meshes, not imported GLB representations, are reused from the original builders.
argv=sys.argv[:];sys.argv=['legacy_world.py','--','--root',str(ROOT)]
legacy=runpy.run_path(str(Path(__file__).with_name('legacy_world.py')),init_globals={'LIBRARY_MODE':True});sys.argv=argv
prototypes={name:legacy[var].data.copy() for name,var in [('github-workshop','workshop'),('ci-factory','factory'),('kubernetes-cluster','cluster')]}
legacy_report=legacy['report']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;p=F.palette();assets={};station_bounds={};navigation={'layout_sha256':hashlib.sha256(layout_path.read_bytes()).hexdigest(),'coordinate_system':'Y-up metres','islands':[],'bridges':layout['bridges'],'station_colliders':[]}

def xyz(p):return Vector((p[0],-p[2],p[1]))
def created(before):return [o for o in scene.objects if o not in before and o.type=='MESH']
def combine(name,objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    # No world shader uses image textures. Dropping unused generated UVs saves
    # bandwidth and avoids exporter vertex splits driven by irrelevant UV noise.
    for layer in list(o.data.uv_layers):o.data.uv_layers.remove(layer)
    # Consolidate shared material slots after joining repeated factory components.
    unique=[];mapping={}
    for i,m in enumerate(o.data.materials):
        if m not in unique:unique.append(m)
        mapping[i]=unique.index(m)
    indices=[mapping[f.material_index] for f in o.data.polygons]
    o.data.materials.clear()
    for m in unique:o.data.materials.append(m)
    for face,index in zip(o.data.polygons,indices):face.material_index=index
    return o

def exported(name,objects):
    obj=combine(name,objects);path=ROOT/'public/assets'/f'{name}.glb'
    obj['generator']='scripts/blender/generate_world.py';obj['layout_version']=layout['version']
    export_glb(path,[obj]);obj.data.calc_loop_triangles()
    bounds=[[round(fn(v.co[i] for v in obj.data.vertices),4) for i in range(3)] for fn in [min,max]]
    info={'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices),'materials':len(obj.data.materials),'bytes':path.stat().st_size,'bounds_blender':bounds}
    assert info['triangles']<150000,(name,info)
    assert info['bytes']<8*1024*1024,(name,info)
    assets[name]=info;print('DISTRICT_EXPORTED',name,json.dumps(info),flush=True);return obj

def bridge_endpoints(island):
    center=xyz(island['center']);ends=[]
    for bridge in layout['bridges']:
        if bridge['fromId']==island['id']:ends.append(xyz(bridge['points'][0])-center)
        if bridge['toId']==island['id']:ends.append(xyz(bridge['points'][-1])-center)
    return ends

def island_paths(island,accent):
    F.cylinder('Circular meeting plaza',(0,0,-.015),1.4,.05,p['path'],64,.005)
    F.torus('District compass inlay',(0,0,.015),.86,.015,accent)
    for index,point in enumerate(bridge_endpoints(island)):
        height=.004+index*.0007
        direction=point.normalized();direction.z=0
        F.ribbon('Arrival path',[tuple(direction*1.05+Vector((0,0,height))),tuple(point+Vector((0,0,height)))],1.52,p['path'])
    return [math.atan2(point.y,point.x) for point in bridge_endpoints(island)]

def bridge_geometry(bridge):
    points=[xyz(point) for point in bridge['points']];width=bridge['width'];name=bridge['id']
    F.ribbon(name+' continuous walkable deck',points,width,p['wood'],.16)
    # Seam lines follow the supplied cross section; no vertical obstacle on deck.
    edge_pairs=[]
    for i,point in enumerate(points):
        tangent=points[min(i+1,len(points)-1)]-points[max(i-1,0)];tangent.z=0;tangent.normalize()
        normal=Vector((-tangent.y,tangent.x,0))
        edge_pairs.append([point+normal*(width/2+.10),point-normal*(width/2+.10)])
        if i not in [0,len(points)-1]:
            F.rod(name+' plank seam',point-normal*(width/2-.02)+Vector((0,0,.001)),point+normal*(width/2-.02)+Vector((0,0,.001)),.008,p['cream'],6)
        if i%2==0 and i not in [0,len(points)-1]:
            for q in edge_pairs[-1]:
                F.rod(name+' outside rail post',q+Vector((0,0,-.18)),q+Vector((0,0,.68)),.045,p['edge'],8)
                F.cylinder(name+' amber rail cap',q+Vector((0,0,.69)),.065,.07,p['gold'],8,0)
    for side in [0,1]:
        # Straight segments intentionally match the deck; splines would overhang at bends.
        for a,b in zip(edge_pairs[1:-2],edge_pairs[2:-1]):
            for z in [.32,.62]:F.rod(name+' hand rail',a[side]+Vector((0,0,z)),b[side]+Vector((0,0,z)),.032,p['edge'],8)
            F.rod(name+' underbeam',a[side]+Vector((0,0,-.22)),b[side]+Vector((0,0,-.22)),.055,p['slate'],8)
    for i in [3,6,9]:
        a,b=edge_pairs[i];F.rod(name+' cross brace',a+Vector((0,0,-.22)),b+Vector((0,0,-.22)),.055,p['slate'],8)

# Hub export is at the global origin and owns all physical bridges.
before=set(scene.objects);hub=layout['hub'];hub_accent=F.accent(hub['color'],'The Common')
F.terrain('The Common',hub['radius'],p,layout['seed']);exclusions=island_paths(hub,hub_accent)
F.plant_rim('Hub garden',hub['radius'],p,layout['seed'],exclusions)
# A flush compass gives the hub a landmark without a collider at the spawn point.
for i,d in enumerate(layout['districts']):
    end=bridge_endpoints(hub)[i];direction=end.normalized();a=math.atan2(direction.y,direction.x)
    x,y=direction.x*2.25,direction.y*2.25
    F.cylinder('District compass tile',(x,y,.005),.20,.018,F.accent(d['color'],d['id']+' compass'),24,0)
    F.lettering('Compass number',str(d['order']),(x,y-.08,.019),.20,p['navy'],(0,0,0))
for bridge in layout['bridges']:
    bridge_geometry(bridge);print('BRIDGE_BUILT',bridge['id'],flush=True)
hub_obj=exported('world-hub',created(before));world_objects=[hub_obj]
navigation['islands'].append({k:hub[k] for k in ['id','center','radius']})

for district in layout['districts']:
    before=set(scene.objects);accent=F.accent(district['color'],district['label']);center=xyz(district['center'])
    F.terrain(district['label'],district['radius'],p,layout['seed']+district['order']);exclusions=island_paths(district,accent)
    for station_index,station in enumerate([s for s in layout['stations'] if s['districtId']==district['id']]):
        start=set(scene.objects)
        if station['model'] in prototypes:
            obj=bpy.data.objects.new(station['name'],prototypes[station['model']].copy());scene.collection.objects.link(obj)
        else:F.BUILDERS[station['model']](p,accent)
        obj=combine('Station • '+station['id'],created(start))
        max_radius=max(math.hypot(v.co.x,v.co.y) for v in obj.data.vertices)
        scale=min(1,station['radius']*.985/max_radius)
        if scale<1:obj.data.transform(Matrix.Scale(scale,4))
        actual=max(math.hypot(v.co.x,v.co.y) for v in obj.data.vertices)
        assert actual<=station['radius'],(station['id'],actual)
        local=xyz(station['position'])-center;obj.location=local;obj.rotation_euler.z=station['rotation']
        station_bounds[station['id']]={'model':station['model'],'radius':round(actual,4),'collision_radius':station['radius'],'scale':round(scale,4),'position':station['position'],'rotation_y':station['rotation']}
        navigation['station_colliders'].append({'id':station['id'],'center':station['position'],'radius':station['radius']})
        # Arrival spur ends outside each declared collider, with a colored flush threshold.
        toward=Vector((math.sin(station['rotation']),-math.cos(station['rotation']),0))
        approach=local+toward*(station['radius']+.20);approach.z=.007+station_index*.0007
        start_path=approach.normalized()*1.08;start_path.z=approach.z
        F.ribbon('Station approach • '+station['id'],[start_path,approach],.95,p['path'])
        F.ribbon('Station threshold • '+station['id'],[approach-toward*.12+Vector((0,0,.0025)),approach+toward*.12+Vector((0,0,.0025))],.95,accent)
    F.plant_rim(district['label'],district['radius'],p,layout['seed']+district['order'],exclusions)
    # Name banners float above clear arrival space; all solid ground props stay
    # within station colliders or outside the playable rim.
    inward=-Vector((center.x,center.y,0)).normalized();rotation=math.atan2(inward.x,-inward.y)
    sign_before=set(scene.objects)
    F.plaque('Entrance district sign',district['label'].upper(),(0,0,3.05),3.25,p['navy'],accent)
    F.lettering('District subtitle',district['name'].upper(),(0,-.045,2.78),.075,p['white'])
    sign=combine('Arrival banner • '+district['id'],created(sign_before));sign.rotation_euler.z=rotation;sign.location=inward*3.5
    obj=exported('district-'+district['id'],created(before));obj.location=center;world_objects.append(obj)
    navigation['islands'].append({k:district[k] for k in ['id','center','radius']})

total_triangles=sum(a['triangles'] for a in assets.values())
assert total_triangles<300000,('World triangle budget exceeded',total_triangles)
(ROOT/'assets/source/world-navigation.json').write_text(json.dumps(navigation,indent=2)+'\n')

# Append the native source for preview only; exported districts contain no hero.
hero_path=ROOT/'assets/source/awushi.blend'
if hero_path.exists():
    with bpy.data.libraries.load(str(hero_path),link=False) as (available,requested):
        requested.objects=[name for name in ['Awushi_SculptedSkin','Awushi_ExpressiveFace','AwushiRig'] if name in available.objects]
    hero=bpy.data.objects.new('PREVIEW_Awushi_scale',None);scene.collection.objects.link(hero)
    for obj in requested.objects:
        if obj:
            scene.collection.objects.link(obj);matrix=obj.matrix_world.copy();obj.parent=hero;obj.matrix_world=matrix
    hero.scale=(.5,.5,.5);hero.location=(0,-1.5,0);scene.frame_set(0)

world=scene.world or bpy.data.worlds.new('World studio');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.065,.10,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
bpy.ops.object.light_add(type='SUN',location=(0,0,30));sun=bpy.context.object;sun.name='STUDIO warm sun';sun.rotation_euler=(.35,-.45,-.4);sun.data.energy=2.3;sun.data.angle=.25;sun.data.color=(1,.87,.72)
area('STUDIO wide cool fill',(0,-10,30),17000,(.65,.86,1),30,target=(0,0,-1))
area('STUDIO sky rim',(15,25,20),18000,(.36,.75,1),30,target=(0,0,-1))
area('STUDIO bedrock fill',(0,-28,-.3),11000,(.23,.60,.80),25,target=(0,0,-2)).visible_camera=False
bpy.ops.object.camera_add(location=(43,-62,45));camera=bpy.context.object;camera.name='STUDIO_world_camera';camera.data.type='ORTHO';camera.data.ortho_scale=69;camera.data.clip_end=300;look_at(camera,(0,0,-.3));scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
bpy.ops.object.select_all(action='DESELECT');hub_obj.select_set(True);bpy.context.view_layer.objects.active=hub_obj
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_perspective='CAMERA';ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/world.blend'))
preview_names=['world-overview','world-north','world-plan']+['district-'+d['id'] for d in layout['districts']]
previews=[] if args.previews else [f'assets/previews/{name}.png' for name in preview_names if (ROOT/'assets/previews'/f'{name}.png').exists()]
report={'generator':'scripts/blender/generate_world.py','blender':bpy.app.version_string,'version':layout['version'],'seed':layout['seed'],'layout':'src/data/world-layout.json','layout_sha256':navigation['layout_sha256'],'assets':assets,'legacy_assets':legacy_report['assets'],'total_world_triangles':total_triangles,'total_world_bytes':sum(a['bytes'] for a in assets.values()),'station_bounds':station_bounds,'previews':previews,'previews_rendered_this_run':args.previews,'navigation':'assets/source/world-navigation.json','provenance':'All meshes, text, and materials are locally generated. No external art, fonts, or texture files.'}
(ROOT/'assets/source/world-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
if args.previews:
    def render(name,location,target,scale,width=1400,height=1100):
        camera.location=location;camera.data.ortho_scale=scale;look_at(camera,target)
        scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.filepath=str(ROOT/'assets/previews'/f'{name}.png')
        bpy.ops.render.render(write_still=True);previews.append(f'assets/previews/{name}.png')
    render('world-overview',(43,-62,45),(0,0,-.3),69)
    render('world-north',(-43,62,46),(0,0,-.3),69)
    render('world-plan',(0,-.01,70),(0,0,0),63,1300,1300)
    for district in layout['districts']:
        center=xyz(district['center']);inward=-Vector((center.x,center.y,0)).normalized()
        tangent=Vector((-inward.y,inward.x,0))
        render('district-'+district['id'],center+inward*14+tangent*8+Vector((0,0,10)),center+Vector((0,0,-.3)),16,1000,850)
    camera.location=(43,-62,45);camera.data.ortho_scale=69;look_at(camera,(0,0,-.3));scene.render.resolution_x=1400;scene.render.resolution_y=1100
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/world.blend'))
(ROOT/'assets/source/world-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print('PHASE_ONE_WORLD_COMPLETE',json.dumps(report),flush=True)
