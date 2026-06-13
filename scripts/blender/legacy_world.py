"""Deterministic local DevOps island and modular environment assets.
Geometry, bevels, lettering and material colors are all authored in this file.
CLI: blender -b --python legacy_world.py -- --root <repo> [--previews]
"""
import bpy, math, random, argparse, sys, json
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from common import reset, material, uv, curve, smooth, look_at, area, export_glb
P=argparse.ArgumentParser();P.add_argument('--root',default=str(Path(__file__).resolve().parents[2]));P.add_argument('--previews',action='store_true')
args=P.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=Path(args.root);random.seed(74);reset()
for directory in ['assets/source','assets/previews','public/assets']:(ROOT/directory).mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
M={
'navy':material('World • midnight enamel',(.025,.065,.105),.31,.22),
'slate':material('World • slate blue',(.055,.145,.21),.4,.12),
'edge':material('World • edge metal',(.10,.26,.32),.32,.34),
'ivory':material('Workshop • warm plaster',(.62,.52,.32),.55),
'wood':material('Workshop • honey wood',(.38,.19,.075),.48),
'roof':material('Workshop • deep teal roof',(.025,.18,.21),.32,.15),
'grass':material('Island • moss teal',(.025,.20,.165),.75),
'grassLight':material('Island • fern tips',(.09,.34,.25),.65),
'path':material('Island • warm slate paths',(.20,.30,.32),.7),
'rock':material('Island • deep bedrock',(.028,.055,.085),.76),
'rockLight':material('Island • blue facets',(.045,.105,.14),.68),
'rockDark':material('Island • shadow facets',(.015,.035,.055),.8),
'cyan':material('Status • cyan',(.015,.66,.78),.22,emission=1.7),
'gold':material('Status • amber',(.95,.40,.035),.27,emission=.8),
'green':material('Status • passing green',(.13,.72,.38),.27,emission=.65),
'white':material('Lettering • cream',(.78,.88,.84),.4,emission=.12),
'glass':material('World • blue glass',(.02,.35,.45),.15,.25,transmission=.16),
}

def select_only(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def bevel(o,width=.08,segments=3):
    select_only(o)
    mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=width;mod.segments=segments
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=35
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def box(name,loc,size,mat,rounding=.06):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    if rounding:bevel(o,rounding)
    return o

def cylinder(name,loc,radius,depth,mat,vertices=32,rounding=.03):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    if rounding:bevel(o,rounding,2)
    return smooth(o)

def torus(name,loc,major,minor,mat,rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=48,minor_segments=8,location=loc)
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    if rotation:o.rotation_euler=rotation
    return smooth(o)

def mesh(name,verts,faces,mats):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o)
    for mat in mats:d.materials.append(mat)
    return o

def text(name,body,loc,size=.16,mat=None):
    d=bpy.data.curves.new(name,'FONT');d.body=body;d.align_x='CENTER';d.size=size;d.extrude=.002;d.bevel_depth=.001;d.resolution_u=3
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(math.pi/2,0,0);d.materials.append(mat or M['white'])
    select_only(o);bpy.ops.object.convert(target='MESH');return bpy.context.object

def rod(name,start,end,radius,mat):
    mid=(Vector(start)+Vector(end))/2;delta=Vector(end)-Vector(start)
    o=cylinder(name,mid,radius,delta.length,mat,16,.012);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o

def plate(name,x,y,z,width,height,mat):return box(name,(x,y,z),(width,.07,height),mat,.04)

def ground_ring(name,x,y,radius,mat):
    return torus(name,(x,y,.025),radius,.018,mat)

def path_ribbon(name,points,width,mat):
    verts=[]
    for i,p in enumerate(points):
        prev=Vector(points[max(0,i-1)]);nxt=Vector(points[min(len(points)-1,i+1)])
        direction=(nxt-prev).normalized();normal=Vector((-direction.y,direction.x,0))*width/2
        verts.extend([tuple(Vector(p)+normal),tuple(Vector(p)-normal)])
    return mesh(name,verts,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(points)-1)],[mat])

def branch_curve(name,points,mat,radius=.022):return curve(name,points,radius,mat,resolution=4)

def new_objects(before):return [o for o in bpy.context.scene.objects if o not in before and o.type=='MESH']

def export_asset(name,objects):
    # Baking bevels + joining by shared materials keeps static assets inexpensive.
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o['generator']='scripts/blender/generate_world.py';o['asset']=name
    export_glb(ROOT/'public/assets'/f'{name}.glb',[o])
    tri=sum(len(p.vertices)-2 for p in o.data.polygons)
    return o,{'triangles':tri,'bytes':(ROOT/'public/assets'/f'{name}.glb').stat().st_size,'materials':len(o.data.materials)}

# Floating island: traversable upper surface, stratified irregular rock underneath.
start=set(scene.objects);N=72
radii=[8.45+.22*math.sin(i*.63)+.13*math.cos(i*1.7) for i in range(N)]
verts=[(0,0,0)]
for i in range(N):
    a=i*math.tau/N;r=radii[i];verts.append((r*math.cos(a),r*math.sin(a),-.04))
faces=[(0,i+1,(i+1)%N+1) for i in range(N)]
mesh('Living moss cap',verts,faces,[M['grass']])
verts=[]
for ring,(factor,z) in enumerate([(1,-.04),(.99,-.42),(.82,-1.65),(.53,-2.75),(.19,-3.6)]):
    for i in range(N):
        a=i*math.tau/N;r=radii[i]*factor*(1+(.035*math.sin(i*2.3+ring) if ring>1 else 0))
        verts.append((r*math.cos(a),r*math.sin(a),z+(.18*math.sin(i*1.7+ring) if ring>1 else .02*math.cos(i))))
verts.append((0,0,-4.15));faces=[]
for ring in range(4):
    for i in range(N):
        a=ring*N+i;b=ring*N+(i+1)%N;c=(ring+1)*N+(i+1)%N;d=(ring+1)*N+i
        faces.extend([(a,b,c),(a,c,d)])
for i in range(N):faces.append((4*N+i,4*N+(i+1)%N,5*N))
# Ring ordering runs downward, so reverse side/bottom winding for outward normals.
faces=[tuple(reversed(face)) for face in faces]
rock=mesh('Layered floating rock',verts,faces,[M['rock'],M['rockLight'],M['rockDark'],M['edge']])
for p in rock.data.polygons:p.material_index=random.choices([0,1,2,3],[.45,.25,.25,.05])[0]
# Flat paths radiate from a quiet landing plaza toward the three stations.
cylinder('Landing plaza',(0,0,-.026),1.9,.05,M['path'],64,.01)
ground_ring('Welcome rim',0,0,1.83,M['edge'])
for name,destination in [('workshop',(-4.5,3)),('factory',(4.5,3)),('cluster',(0,6))]:
    dest=Vector((*destination,0));points=[]
    for i in range(17):
        t0=1.88/dest.length;t=t0+(1-t0)*i/16
        points.append(tuple(dest*t+Vector((.22*math.sin(math.pi*t)*(1 if dest.x<0 else -1),0,.009))))
    path_ribbon('Path to '+name,points,.82,M['path'])
    for i in range(3,13,3):
        x,y,z=points[i];box('Inset route marker',(x,y,.018),(.18,.075,.02),M['gold'] if name=='factory' else M['cyan'],.008)
# Rim moss shelves and understated faceted crystal veins.
for i in range(25):
    a=i*math.tau/25;r=8.05+random.uniform(-.15,.2)
    uv('Moss edge cushion',(r*math.cos(a),r*math.sin(a),-.01),(random.uniform(.25,.6),random.uniform(.2,.45),.10),M['grassLight'],12,8)
for i in range(10):
    a=i*math.tau/10+.22;r=random.uniform(5.4,7.1)
    bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=.025,radius2=.23,depth=random.uniform(.55,1.1),location=(r*math.cos(a),r*math.sin(a),-1.75))
    o=bpy.context.object;o.name='Suspended cyan mineral';o.data.materials.append(M['glass']);o.rotation_euler=(.1*math.cos(a),.2*math.sin(a),a)
island,island_info=export_asset('island',new_objects(start))

# Git workshop: warm approachable gable building with a locally modeled branch sign.
start=set(scene.objects)
box('Workshop foundation',(0,0,.10),(2.72,2.15,.20),M['navy'],.10)
box('Workshop plaster shell',(0,0,.92),(2.34,1.72,1.54),M['ivory'],.13)
for x in [-1.11,1.11]:box('Timber corner',(x,-.86,.95),(.11,.11,1.42),M['wood'],.025)
# Gabled roof with visible thickness and overhang.
rv=[(-1.38,-1.08,1.65),(0,-1.08,2.40),(1.38,-1.08,1.65),(-1.38,1.08,1.65),(0,1.08,2.40),(1.38,1.08,1.65),(-1.38,-1.08,1.55),(1.38,-1.08,1.55),(-1.38,1.08,1.55),(1.38,1.08,1.55)]
rf=[(0,1,4,3),(1,2,5,4),(0,6,7,2,1),(3,4,5,9,8),(0,3,8,6),(2,7,9,5),(6,8,9,7)]
roof=mesh('Swept gable roof',rv,rf,[M['roof']]);bevel(roof,.055,3)
for y in [-.85,-.42,0,.42,.85]:
    for s in [-1,1]:rod('Raised roof seam',(0,y,2.43),(s*1.38,y,1.68),.022,M['edge'])
plate('Entrance surround',0,-.90,.68,.72,1.11,M['wood']);plate('Workshop door',0,-.949,.67,.57,.98,M['navy'])
plate('Door window',0,-.994,.85,.40,.42,M['gold']);uv('Door brass handle',(.20,-1.01,.53),(.035,.03,.035),M['gold'],12,8)
for x in [-.78,.78]:
    plate('Window surround',x,-.90,1.02,.52,.60,M['wood']);plate('Warm window',x,-.95,1.02,.40,.47,M['gold'])
    box('Window crossbar vertical',(x,-.992,1.02),(.035,.035,.49),M['wood'],.008)
    box('Window crossbar horizontal',(x,-.994,1.02),(.42,.035,.035),M['wood'],.008)
box('Workshop threshold',(0,-1.10,.15),(1.05,.36,.13),M['wood'],.04)
plate('Workshop eave plaque',0,-1.112,1.59,1.7,.24,M['navy']);text('Workshop name','GIT WORKSHOP',(0,-1.155,1.535),.155)
# Branch glyph within the pediment.
for x,z in [(-.16,1.89),(-.16,2.16),(.18,2.16)]:
    o=torus('Git graph node',(x,-1.105,z),.047,.015,M['gold'],(math.pi/2,0,0))
branch_curve('Git branch stem',[(-.16,-1.105,1.94),(-.16,-1.105,2.11)],M['gold'],.015)
branch_curve('Git branch fork',[(-.16,-1.105,1.98),(.16,-1.105,2.02),(.18,-1.105,2.11)],M['gold'],.015)
workshop,workshop_info=export_asset('github-workshop',new_objects(start))

# CI factory: compact three-stage build line, with an unmistakable conveyor.
start=set(scene.objects)
box('Factory foundation',(0,0,.09),(2.70,2.12,.18),M['navy'],.10)
box('Factory blue shell',(0,.22,.87),(2.35,1.52,1.45),M['slate'],.13)
box('Factory rounded roof',(0,.22,1.62),(2.54,1.74,.20),M['edge'],.10)
for x in [-.83,0,.83]:
    box('Stage tower',(x,.34,1.96),(.52,.56,.58),M['navy'],.09)
    cylinder('Tower vent',(x,.34,2.31),.19,.17,M['edge'],24,.03)
for x,mat in [(-.83,M['cyan']),(0,M['gold']),(.83,M['green'])]:
    plate('Build stage indicator',x,.04,2.00,.33,.21,mat)
    for z in [1.79,1.85]:box('Tower cooling slot',(x,.025,z),(.30,.035,.025),M['slate'],.006)
branch_curve('Build pipeline pipe',[(-.85,.66,1.89),(-.85,.85,2.06),(0,.85,2.06),(.85,.85,2.06),(.85,.66,1.89)],M['gold'],.06)
plate('Factory front inset',0,-.57,.87,1.84,.95,M['navy'])
plate('Factory title plaque',0,-.62,1.39,1.94,.27,M['slate']);text('Factory name','CI / FACTORY',(0,-.665,1.325),.19)
for x in [-.85,.85]:
    for z in [.62,.78,.94,1.10]:box('Factory facade vent',(x,-.628,z),(.21,.045,.035),M['edge'],.008)
# Conveyor slopes into the build tunnel, all within the 1.7m collision footprint.
box('Conveyor base',(0,-1.02,.28),(.91,1.05,.25),M['navy'],.08)
box('Conveyor belt',(0,-1.02,.425),(.72,1.03,.045),M['edge'],.015)
for y in [-1.44,-1.27,-1.10,-.93,-.76,-.59]:box('Conveyor rib',(0,y,.458),(.70,.035,.025),M['slate'],.008)
for x in [-.42,.42]:box('Conveyor guard',(x,-1.02,.49),(.075,1.04,.12),M['gold'],.025)
for y,mat in [(-1.26,M['ivory']),(-.68,M['cyan'])]:
    box('Build artifact crate',(0,y,.64),(.36,.30,.35),mat,.045)
    plate('Artifact mark',0,y-.16,.66,.16,.07,M['navy'])
text('Build stages','BUILD   TEST   SHIP',(0,-.67,1.05),.115,M['gold'])
factory,factory_info=export_asset('ci-factory',new_objects(start))

# Kubernetes cluster: three rounded pods around a glowing control-plane hub.
start=set(scene.objects)
cylinder('Cluster platform',(0,0,.10),1.57,.20,M['navy'],64,.06)
torus('Platform cyan rim',(0,0,.19),1.48,.026,M['cyan'])
cylinder('Control plane base',(0,0,.28),.39,.18,M['edge'],32,.04)
cylinder('Control plane beacon',(0,0,.91),.235,1.16,M['glass'],32,.035)
for z in [.42,.73,1.04,1.35]:torus('Beacon luminous ring',(0,0,z),.24,.019,M['cyan'])
uv('Beacon core',(0,0,1.55),(.22,.22,.22),M['cyan'],20,12)
for i in range(3):
    a=math.pi/2+i*math.tau/3;x=math.cos(a)*1.04;y=math.sin(a)*1.04
    box('Pod foundation',(x,y,.30),(.73,.62,.18),M['edge'],.07)
    box('Rounded server pod',(x,y,.94),(.63,.55,1.16),M['slate'],.10)
    box('Pod cap',(x,y,1.56),(.66,.59,.14),M['navy'],.055)
    for z in [.63,.84,1.05,1.26]:
        plate('Server slot',x,y-.29,z,.44,.12,M['navy'])
        plate('Ready LED',x+.14,y-.335,z,.055,.042,M['green'])
        box('Slot ventilation',(x-.08,y-.336,z),(.15,.03,.025),M['edge'],.006)
    branch_curve('Cluster data link',[(0,0,.215),(x*.55,y*.55,.215),(x,y,.215)],M['cyan'],.022)
# A small wheel mark evokes orchestration without an external logo asset.
plate('Cluster wheel back',0,-.285,1.11,.38,.39,M['navy'])
torus('Orchestration wheel',(0,-.336,1.11),.124,.012,M['cyan'],(math.pi/2,0,0))
for i in range(6):
    a=i*math.tau/6;rod('Wheel spoke',(0,-.336,1.11),(.17*math.cos(a),-.336,1.11+.17*math.sin(a)),.010,M['cyan'])
plate('Cluster plaque',0,-1.32,.40,1.26,.32,M['slate']);text('Cluster name','KUBERNETES',(0,-1.366,.36),.125)
cluster,cluster_info=export_asset('kubernetes-cluster',new_objects(start))

# Supporting props are positioned in island coordinates and exported together.
start=set(scene.objects)
def lamp(x,y):
    cylinder('Lamp foot',(x,y,.055),.18,.10,M['navy'],20)
    cylinder('Lamp stem',(x,y,.44),.045,.72,M['edge'],16,.01)
    cylinder('Lantern housing',(x,y,.87),.14,.18,M['navy'],20)
    cylinder('Warm lantern lens',(x,y,.87),.145,.09,M['gold'],20,.008)
    cylinder('Lantern cap',(x,y,1.00),.17,.07,M['navy'],20,.015)
for pos in [(-2.2,2.2),(2.2,2.2),(-1.0,4.3),(1.0,4.3),(-5.7,.7),(5.7,.7),(-2,-2.1),(2,-2.1)]:lamp(*pos)
def shrub(x,y,scale=1):
    cylinder('Planting bed',(x,y,.06),.40*scale,.12,M['rock'],16,.04)
    for i,(dx,dy,h) in enumerate([(-.16,0,.38),(.15,.08,.46),(0,-.10,.32)]):
        uv('Soft fern shrub',(x+dx*scale,y+dy*scale,h*scale*.5),(.26*scale,.22*scale,h*scale),M['grassLight'] if i%2 else M['grass'],14,10)
for x,y,s in [(-6,-2,1.15),(6,-2,1.05),(-6,4,1.1),(6,4,1.2),(-2.8,6.1,.9),(2.8,6.1,.95),(-4.3,-4.9,1),(4.3,-4.9,1)]:shrub(x,y,s)
# Stylized crystalline crops match Awushi's watery world, reserved for the rim.
for x,y in [(-6.7,1.6),(6.7,1.6),(-3.2,-6.4),(3.2,-6.4),(4.8,5.6),(-4.8,5.6)]:
    for j in range(3):
        h=random.uniform(.35,.72);a=j*2.1
        bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=.11+j*.015,radius2=.015,depth=h,location=(x+math.cos(a)*.15,y+math.sin(a)*.15,h/2+.03))
        o=bpy.context.object;o.name='Rim cyan crystal';o.data.materials.append(M['glass']);o.rotation_euler=(.12*math.sin(a),.13*math.cos(a),a)
# A few tidy cargo boxes indicate work in progress without blocking main routes.
for x,y,s in [(-6,2,.6),(5.9,2,.65),(-5.8,2.7,.45)]:
    box('Supply crate',(x,y,s/2),(s,s,s),M['wood'],.06)
    for z in [.1,s-.1]:box('Crate band',(x,y-s/2-.008,z),(s*.91,.025,.045),M['gold'],.008)
props,props_info=export_asset('props',new_objects(start))

# The composite builder reuses these meshes without saving an intermediate scene.
if not globals().get('LIBRARY_MODE', False):
    # Assemble source scene. Assets remain centered in their individual GLB files.
    workshop.location=(-4.5,3,0);factory.location=(4.5,3,0);cluster.location=(0,6,0)
    assets=[island,workshop,factory,cluster,props]
    # Append the authored source only for the world review scene. Runtime always uses
    # the validated GLB; source append preserves the Cycles-specific gel shading.
    hero_path=ROOT/'assets/source/awushi.blend'
    if hero_path.exists():
        with bpy.data.libraries.load(str(hero_path),link=False) as (available,requested):
            requested.objects=[name for name in ['Awushi_SculptedSkin','Awushi_ExpressiveFace','AwushiRig'] if name in available.objects]
        imported_roots=[o for o in requested.objects if o]
        hero=bpy.data.objects.new('PREVIEW_Awushi_scale',None);bpy.context.collection.objects.link(hero)
        for o in imported_roots:
            bpy.context.collection.objects.link(o)
            matrix=o.matrix_world.copy();o.parent=hero;o.matrix_world=matrix
        hero.scale=(.5,.5,.5);hero.location.y=-.75
        scene.frame_set(0)
    # Local studio light rig and a dark floor under the floating island.
    floor_mat=material('Studio • matte midnight',(.014,.028,.045),.85)
    floor_mat.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=0
    floor=box('STUDIO_floor',(0,0,-4.45),(200,200,.1),floor_mat,0)
    world=scene.world or bpy.data.worlds.new('World studio');scene.world=world;world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.045,.075,.115,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35
    area('STUDIO_key',(-7,-9,15),2200,(.79,.94,1),10,target=(0,1,0))
    area('STUDIO_rim',(8,5,10),2600,(.28,.80,1),8,target=(0,1,-1))
    area('STUDIO_warm',(-8,6,5),1700,(1,.64,.28),7,target=(0,1,0))
    area('STUDIO_undercroft',(0,-9,-.2),1800,(.22,.68,.94),9,target=(0,0,-2)).visible_camera=False
    bpy.ops.object.camera_add(location=(13,-19,8.5));camera=bpy.context.object;camera.name='STUDIO_world_camera';camera.data.type='ORTHO';camera.data.ortho_scale=22.4;look_at(camera,(0,0,-.70));scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
    scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
    bpy.ops.object.select_all(action='DESELECT');island.select_set(True);bpy.context.view_layer.objects.active=island
    for screen in bpy.data.screens:
        for ar in screen.areas:
            if ar.type=='VIEW_3D':
                ar.spaces.active.region_3d.view_perspective='CAMERA';ar.spaces.active.shading.type='MATERIAL';ar.spaces.active.overlay.show_overlays=False
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/world.blend'))
    if args.previews:
        scene.render.filepath=str(ROOT/'assets/previews/world-overview.png');bpy.ops.render.render(write_still=True)
report={'generator':'legacy_world.py','blender':bpy.app.version_string,'seed':74,'island_radius':8.6,'playable_y':0,'assets':{'island':island_info,'github-workshop':workshop_info,'ci-factory':factory_info,'kubernetes-cluster':cluster_info,'props':props_info},'station_positions_gltf':{'github-workshop':[-4.5,0,-3],'ci-factory':[4.5,0,-3],'kubernetes-cluster':[0,0,-6]}}
if not globals().get('LIBRARY_MODE', False):
    (ROOT/'assets/source/world-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print('WORLD_COMPLETE',json.dumps(report))
