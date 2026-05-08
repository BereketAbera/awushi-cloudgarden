"""Awushi: sculpted splash volume, jelly PBR, weighted rig and five baked clips.
All geometry, texture pixels, lighting and motion originate here; no asset services.
Blender 5.1; coordinates: metres, Z-up, face toward -Y (GLB +Z).
"""
import bpy, math, random, argparse, sys, json
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from common import *
P=argparse.ArgumentParser(); P.add_argument('--root',default=str(Path(__file__).resolve().parents[2])); P.add_argument('--previews',action='store_true'); P.add_argument('--resolution',type=int,default=900); P.add_argument('--samples',type=int,default=64)
args=P.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=Path(args.root); random.seed(24); reset()
for folder in ['assets/source','assets/previews','public/assets']: (ROOT/folder).mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.render.fps=30
jelly=material('Awushi • cyan jelly',(.002,.44,.78),.17,transmission=.32)
add_jelly_volume(jelly,(.035,.57,.84),2.2,.75)
p=jelly.node_tree.nodes.get('Principled BSDF'); p.inputs['Subsurface Weight'].default_value=.015; p.inputs['Subsurface Radius'].default_value=(.15,.4,.5)
p.inputs['Coat Weight'].default_value=.65
black=material('Face • deep ink',(.001,.003,.005),.28)
white=material('Eyes • softbox glints',(.85,.99,1),.12,emission=.6)
bubble=material('Embedded • clear cyan bubbles',(.12,.72,.92),.10,transmission=.45)
bubble.node_tree.nodes.get('Principled BSDF').inputs['IOR'].default_value=1.20
amber=material('Eyes • amber fire', (1,.4,.01),.2,emission=.45)
# Pixel-authored texture is packed into the blend and GLB, independent of render nodes.
size=128; img=bpy.data.images.new('Amber gradient • generated',width=size,height=size,alpha=True)
pixels=[]
for y in range(size):
    v=y/(size-1)
    for x in range(size):
        u=x/(size-1); edge=min(1,((u-.5)**2+(v-.5)**2)**.5*1.1)
        pixels.extend((1, .16+.72*(1-v)**.7-.08*edge, .008+.09*(1-v), 1))
img.pixels=pixels; img.pack()
tex=amber.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=img
uvnode=amber.node_tree.nodes.new('ShaderNodeUVMap');uvnode.uv_map='UVMap';amber.node_tree.links.new(uvnode.outputs['UV'],tex.inputs['Vector'])
ap=amber.node_tree.nodes.get('Principled BSDF'); amber.node_tree.links.new(tex.outputs['Color'],ap.inputs['Base Color']); amber.node_tree.links.new(tex.outputs['Color'],ap.inputs['Emission Color'])

parts=[]
def lump(name,loc,scale):
    o=uv(name,loc,scale,segments=32,rings=20); parts.append(o); return o
# Broad low face, small pear-shaped body, rounded limbs.
lump('Head primary', (0,0,2.12),(1.07,.66,.71))
lump('Head upper volume',(-.10,.025,2.53),(.85,.51,.45))
lump('Broad lower cheeks',(0,-.015,1.73),(.82,.54,.31))
lump('Belly', (0,0,.88),(.52,.375,.49))
lump('Neck', (0,0,1.38),(.30,.27,.24))
for s in [-1,1]:
    lump('Leg', (s*.275,.025,.37),(.225,.26,.34))
    lump('Foot', (s*.29,-.10,.125),(.23,.29,.13))
    for i in range(8):
        t=i/7
        lump('Arm', (s*(.30+.40*t), -.015-.035*t,1.22-.27*t),(.22-.06*t,.20-.035*t,.22-.045*t))
# Curved, tapering splash ribbons are fused into one watertight skin.
# Each path is a Catmull-Rom volume with a rounded terminal, not cone primitives.
paths=[
    [(-.70,0,2.48,.35),(-.69,.015,2.94,.30),(-.51,.04,3.36,.26),(-.16,.07,3.67,.23),(.08,.06,3.75,.18)],
    [(-.22,.06,2.58,.32),(.03,.05,2.92,.26),(.34,.06,3.25,.21),(.51,.07,3.32,.16)],
    [(.31,.02,2.48,.31),(.60,.03,2.72,.25),(.89,.05,3.00,.20),(1.01,.06,3.05,.16)],
    [(.75,.03,2.25,.29),(1.03,.02,2.36,.23),(1.20,.02,2.56,.18),(1.19,.03,2.68,.12)],
    [(.80,0,1.92,.25),(1.02,0,1.96,.20),(1.15,.015,2.12,.13),(1.17,.02,2.21,.075)],
    [(-.80,.04,2.37,.26),(-1.08,.04,2.62,.17),(-1.08,.04,2.86,.13),(-1.00,.05,2.99,.08)],
    [(-.87,0,1.98,.20),(-1.06,0,2.06,.14),(-1.14,0,2.23,.095)],
]
def catmull(a,b,c,d,t): return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
for pi,path in enumerate(paths):
    nodes=[Vector(p) for p in path]
    for i in range(len(nodes)-1):
        for step in range(5):
            q=catmull(nodes[max(i-1,0)],nodes[i],nodes[i+1],nodes[min(i+2,len(nodes)-1)],step/4)
            lump(f'Crown ribbon {pi}',q.xyz,(q.w, q.w*.78, q.w))
# Sculpt remesh followed by relaxation removes intersections; optional subdivision is
# applied before export, so the visible silhouette is the exported silhouette.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); skin=bpy.context.object; skin.name='Awushi_SculptedSkin'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
mod=skin.modifiers.new('Continuous sculpt volume','REMESH'); mod.mode='VOXEL'; mod.voxel_size=.035; mod.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=mod.name)
mod=skin.modifiers.new('Relax jelly surface','SMOOTH'); mod.factor=1.25; mod.iterations=7; bpy.ops.object.modifier_apply(modifier=mod.name)
mod=skin.modifiers.new('Realtime surface budget','DECIMATE'); mod.ratio=.42; bpy.ops.object.modifier_apply(modifier=mod.name)
smooth(skin); skin.data.materials.append(jelly)
objects=[skin]; attachments=[]
# Dense inner gel approximates multiple scattering in realtime, blocking the
# opposite-side face from ghosting through while the outer shell refracts light.
coremat=material('Awushi • dense gel interior',(.003,.40,.65),.42)
coremat.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=0
for i,(loc,scale,bone) in enumerate([
    ((0,.015,2.13),(.96,.51,.63),'head'),
    ((-.10,.025,2.51),(.74,.39,.36),'head'),
    ((0,.015,1.77),(.72,.41,.23),'head'),
    ((0,.01,.88),(.43,.285,.39),'body'),
]):
    o=uv(f'DenseGelInterior_{i}',loc,scale,coremat,32,20);objects.append(o);attachments.append((o,bone))
# Slightly pear-shaped domed eye meshes; front UV projection keeps amber gradient upright.
def eye_mesh(name,x,z,w,h,depth,mat,y):
    o=uv(name,(x,y,z),(w,depth,h),mat,segments=40,rings=24)
    for v in o.data.vertices:
        t=v.co.z/h; v.co.x*=1-.14*t
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            o.data.uv_layers.active.data[li].uv=(co.x/(2*w)+.5,co.z/(2*h)+.5)
    return o
for s,label in [(-1,'L'),(1,'R')]:
    # Head surface retreats toward the temples. Eyes are convex and slightly turned.
    rim=eye_mesh('EyeOutline_'+label,s*.49,2.10,.29,.355,.072,black,-.592)
    iris=eye_mesh('AmberEye_'+label,s*.49,2.10,.249,.310,.060,amber,-.647)
    glint=uv('EyeGlint_'+label,(s*.49-.080,-.703,2.253),(.052,.018,.069),white)
    for o in [rim,iris,glint]: attachments.append((o,'eye_'+label));objects.append(o)
smile=curve('FriendlySmile',[(-.145,-.690,1.85),(-.09,-.710,1.795),(0,-.715,1.775),(.09,-.710,1.795),(.145,-.690,1.85)],.026,black)
objects.append(smile); attachments.append((smile,'head'))
for x in [-.145,.145]:
    o=uv('SmileRoundEnd',(x,-.690,1.85),(.026,.026,.026),black,20,12);objects.append(o);attachments.append((o,'head'))
# Embedded bubbles distributed on both faces and sides, never pasted to only one view.
for i in range(18):
    az=random.uniform(0,math.tau); elev=random.uniform(-.35,1.05)
    x=1.025*math.cos(elev)*math.cos(az); y=.65*math.cos(elev)*math.sin(az); z=2.20+.62*math.sin(elev)
    if y<-.25 and z<2.53 and abs(x)<.80:continue
    r=random.uniform(.025,.055)
    o=uv(f'Bubble_head_{i:02}',(x,y,z),(r,r*.46,r),bubble,20,12);objects.append(o);attachments.append((o,'head'))
for i in range(7):
    az=random.uniform(0,math.tau); z=random.uniform(.64,1.15); r=random.uniform(.025,.05)
    o=uv(f'Bubble_body_{i:02}',(.435*math.cos(az),.34*math.sin(az),z),(r,r*.7,r),bubble,16,10);objects.append(o);attachments.append((o,'body'))
# Larger oblate air pockets sit just under the surface and catch a soft crescent.
for i,(loc,scale,angle,bone) in enumerate([
    ((.10,-.595,2.64),(.16,.045,.23),-.55,'head'),
    ((-.49,-.492,2.79),(.105,.038,.16),-.45,'head'),
    ((.70,-.485,2.54),(.14,.038,.085),-.30,'head'),
    ((.83,-.37,1.88),(.13,.036,.075),-.60,'head'),
    ((-.15,-.340,1.03),(.10,.035,.145),-.35,'body'),
    ((.33,-.23,.68),(.065,.028,.09),.30,'body'),
    ((-.45,.55,2.40),(.12,.04,.15),.40,'head'),
]):
    x,y,z=loc
    direction=1 if y<0 else -1
    hit,point,normal,index=skin.ray_cast(Vector((x,-2*direction,z)),Vector((0,direction,0)))
    if hit:y=point.y+direction*scale[1]*.40
    o=uv(f'EmbeddedAirPocket_{i}',(x,y,z),scale,bubble,32,20);o.rotation_euler[1]=angle;objects.append(o);attachments.append((o,bone))
# Two suspended droplets belong to Awushi's splash silhouette and deform with the crown.
for i,(loc,scale) in enumerate([((.92,.06,3.59),(.10,.085,.13)),((1.32,.025,3.13),(.06,.055,.075))]):
    o=uv(f'CrownDroplet_{i}',loc,scale,jelly);objects.append(o);attachments.append((o,'crown'))
# Armature with smooth normalized skin weights and face bones for glTF-safe blinking.
arm_data=bpy.data.armatures.new('AwushiRig'); rig=bpy.data.objects.new('AwushiRig',arm_data);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig; bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
bones={
'root':((0,0,0),(0,0,.25),None),'body':((0,0,.55),(0,0,1.35),'root'),
'head':((0,0,1.38),(0,0,2.70),'body'),'crown':((0,.03,2.65),(0,.03,3.50),'head'),
'arm_L':((-.31,0,1.22),(-.70,0,.96),'body'),'arm_R':((.31,0,1.22),(.70,0,.96),'body'),
'leg_L':((-.26,0,.52),(-.28,0,.12),'root'),'leg_R':((.26,0,.52),(.28,0,.12),'root'),
'eye_L':((-.49,-.60,2.1),(-.49,-.60,2.3),'head'),'eye_R':((.49,-.60,2.1),(.49,-.60,2.3),'head')}
for name,(h,t,parent) in bones.items():
    b=arm_data.edit_bones.new(name);b.head=h;b.tail=t
    if parent:b.parent=arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for name in bones:skin.vertex_groups.new(name=name)
def clamp(x):return max(0,min(1,x))
for v in skin.data.vertices:
    x,y,z=v.co; weights={}
    head=clamp((z-1.30)/.24)
    crown=clamp((z-2.65)/.80)*.70
    if head>0:weights['head']=head*(1-crown);weights['crown']=head*crown
    rest=1-head
    leg=clamp((.59-z)/.22); arm=clamp((abs(x)-.34)/.26)*clamp((z-.63)/.24)
    side='L' if x<0 else 'R'
    weights['leg_'+side]=rest*leg
    weights['arm_'+side]=rest*(1-leg)*arm
    weights['body']=rest*(1-leg)*(1-arm)
    for name,w in weights.items():
        if w>1e-5:skin.vertex_groups[name].add([v.index],w,'REPLACE')
mod=skin.modifiers.new('Jelly deformation','ARMATURE');mod.object=rig;skin.parent=rig
for o,bone in attachments:
    # Bind without changing world transforms; all geometry remains skinned and portable.
    world=o.matrix_world.copy();o.parent=rig;o.matrix_world=world
    group=o.vertex_groups.new(name=bone);group.add(list(range(len(o.data.vertices))),1,'REPLACE')
    mod=o.modifiers.new('Follow expressive rig','ARMATURE');mod.object=rig
objects.append(rig)
# Celebration droplets hidden by bone scale except during the jump.
bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for i in range(6):
    b=arm_data.edit_bones.new(f'splash_{i}');b.head=(0,0,.1);b.tail=(0,0,.2);b.parent=arm_data.edit_bones['root']
bpy.ops.object.mode_set(mode='OBJECT')
for i in range(6):
    o=uv(f'CelebrationSplash_{i}',(0,0,.1),(.065,.065,.11),jelly,16,10);o.parent=rig
    vg=o.vertex_groups.new(name=f'splash_{i}');vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
    mod=o.modifiers.new('Splash animation','ARMATURE');mod.object=rig;objects.append(o)
for b in rig.pose.bones:b.rotation_mode='XYZ'
clips={'Idle':120,'Walk':30,'Run':22,'Interact':90,'Celebrate':66}
for name,duration in clips.items():
    action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data_create();rig.animation_data.action=action
    for frame in range(duration+1):
        t=frame/duration;phase=t*math.tau
        for b in rig.pose.bones:b.location=(0,0,0);b.rotation_euler=(0,0,0);b.scale=(1,1,1)
        root=rig.pose.bones['root'];body=rig.pose.bones['body'];head=rig.pose.bones['head'];crown=rig.pose.bones['crown']
        if name=='Idle':
            body.scale=(1+.012*math.sin(phase),1+.018*math.sin(phase),1-.009*math.sin(phase));head.rotation_euler[1]=.018*math.sin(phase);crown.rotation_euler[1]=.028*math.sin(phase-.6)
        elif name in ['Walk','Run']:
            amp=.36 if name=='Walk' else .60
            root.location.y=abs(math.sin(phase))*(.065 if name=='Walk' else .12)
            body.rotation_euler[2]=.035*math.sin(phase);head.rotation_euler[1]=.045*math.sin(phase);crown.rotation_euler[0]=.04*math.sin(phase*2-.6)
            for s,label in [(-1,'L'),(1,'R')]:
                rig.pose.bones['leg_'+label].rotation_euler[0]=s*amp*math.sin(phase)
                rig.pose.bones['arm_'+label].rotation_euler[0]=-s*amp*.75*math.sin(phase)
        elif name=='Interact':
            envelope=math.sin(math.pi*t)**2;head.rotation_euler[1]=-.13*envelope;head.rotation_euler[2]=.14*envelope
            rig.pose.bones['arm_R'].rotation_euler[2]=-.8*envelope;rig.pose.bones['arm_R'].rotation_euler[0]=.28*math.sin(phase*3)*envelope
            crown.rotation_euler[1]=-.08*envelope
        elif name=='Celebrate':
            jump=max(0,math.sin(math.pi*clamp((t-.18)/.57)))
            root.location.y=.65*jump;body.scale=(1+.07*math.cos(phase*2),1+.07*math.cos(phase*2),1-.07*math.cos(phase*2))
            for s,label in [(-1,'L'),(1,'R')]:rig.pose.bones['arm_'+label].rotation_euler[2]=s*(.8*jump)
            head.rotation_euler[2]=.10*math.sin(phase);crown.rotation_euler[1]=.10*math.sin(phase*2)
        blink=1
        if name in ['Idle','Interact']:
            center=.68 if name=='Idle' else .82
            blink=1-.97*max(0,1-abs(t-center)/.035)
        for label in ['L','R']:rig.pose.bones['eye_'+label].scale.y=blink
        for i in range(6):
            b=rig.pose.bones[f'splash_{i}'];amount=math.sin(math.pi*clamp((t-.63)/.30)) if name=='Celebrate' else 0
            b.scale=(max(.001,amount),)*3
            a=i*math.tau/6;b.location=(math.cos(a)*.9*amount,.35*amount,math.sin(a)*.65*amount)
        for b in rig.pose.bones:
            for path in ['location','rotation_euler','scale']:b.keyframe_insert(data_path=path,frame=frame,group=b.name)
    # Exporter discovers all armature-compatible actions, each with an exact named clip.
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0)
rig['asset']='Awushi';rig['forward']='+Z in glTF';rig['generator']='scripts/blender/generate_awushi.py';rig['reference']='assets/reference/awushi.png'
# Batch all skinned surfaces into material primitives. Keep mesh and skeleton as
# scene roots: glTF ignores transforms on non-root skinned mesh nodes.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:
    if o.type=='MESH':o.select_set(True)
bpy.context.view_layer.objects.active=skin;bpy.ops.object.join()
skin.parent=None
if skin.data.uv_layers:
    skin.data.uv_layers.active_index=0;skin.data.uv_layers[0].active_render=True
objects=[skin,rig]
export_glb(ROOT/'public/assets/awushi.glb',objects,True)
# Preserve studio in source blend, excluded from the exported asset selection.
studio=material('Studio • midnight',(.009,.017,.029),.36)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));floor=bpy.context.object;floor.name='STUDIO_floor';floor.data.materials.append(studio)
world=bpy.data.worlds.new('Procedural studio') if not scene.world else scene.world;scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.10,.16,1);world.node_tree.nodes['Background'].inputs[1].default_value=.40
area('Key • large softbox',(-3,-4,6),650,(.72,.94,1),4,size_y=2).data.shape='ELLIPSE'
area('Rim • cyan strip',(3,1,4.8),900,(.14,.79,1),3,size_y=1)
area('Fill • warm bounce',(1,-4,2),170,(1,.73,.44),2.6).data.shape='DISK'
area('Front • cyan bounce',(-1,-4,1.3),130,(.25,.80,1),3).data.shape='DISK'
area('Top • white sheen',(-1,1,6),750,(.75,.95,1),2.4,size_y=.7)
bpy.ops.object.camera_add(location=(0,-8,2.7));camera=bpy.context.object;camera.name='STUDIO_camera';scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=4.55
scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True
scene.render.resolution_x=args.resolution;scene.render.resolution_y=args.resolution;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard';scene.view_settings.exposure=-.7;scene.render.film_transparent=False
look_at(camera,(0,0,1.96))
scene.frame_start=0;scene.frame_end=120
bpy.ops.object.select_all(action='DESELECT');skin.select_set(True);bpy.context.view_layer.objects.active=skin
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=6.5
            ar.spaces.active.region_3d.view_location=(0,0,1.9)
            ar.spaces.active.region_3d.view_rotation=(1,0,0,0)
            ar.spaces.active.region_3d.view_perspective='CAMERA'
            ar.spaces.active.shading.type='MATERIAL'
            ar.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/awushi.blend'))
if args.previews:
    views={'front':(0,-8,2.85),'three-quarter':(4.8,-7,3.2),'side':(8,0,2.85),'back':(0,8,2.85)}
    for name,loc in views.items():
        camera.location=loc;look_at(camera,(0,0,1.96));scene.render.filepath=str(ROOT/f'assets/previews/awushi-{name}.png');bpy.ops.render.render(write_still=True)
report={'generator':'generate_awushi.py','blender':bpy.app.version_string,'seed':24,'height_m':round(max(v.co.z for v in skin.data.vertices),3),'skin_triangles':sum(len(p.vertices)-2 for p in skin.data.polygons),'clips':clips,'glb_bytes':(ROOT/'public/assets/awushi.glb').stat().st_size,'reference':'assets/reference/awushi.png','render_settings':{'resolution':args.resolution,'cycles_samples':args.samples}}
(ROOT/'assets/source/awushi-manifest.json').write_text(json.dumps(report,indent=2)+'\n');print('AWUSHI_COMPLETE',json.dumps(report))
