"""Portable skinned facial morphs for Awushi; all geometry stays local and procedural.
The face is a separate small mesh so expression deltas never duplicate the body.
Coordinates here are Blender Z-up, with the face toward -Y.
"""
import bpy, math
from mathutils import Vector
from common import uv, smooth

EXPRESSIONS = ('Neutral', 'Happy', 'Curious', 'Thinking', 'Excited', 'Worried', 'Surprised', 'Determined', 'Celebrating', 'Sleepy')
# sx, sz, z offset, rotation in the face plane, upward curvature of the eye.
EYES = {
    'Happy': ((1.03,.77,.030,0,.035), (1.03,.77,.030,0,.035)),
    'Curious': ((.94,1.06,.040,-.08,0), (1.06,.86,-.015,.06,0)),
    'Thinking': ((1,.69,.015,.08,.015), (.94,.80,.015,-.06,0)),
    'Excited': ((1.10,1.10,.025,0,0), (1.10,1.10,.025,0,0)),
    'Worried': ((.94,.91,.010,.12,0), (.94,.91,.010,-.12,0)),
    'Surprised': ((1.08,1.15,.030,0,0), (1.08,1.15,.030,0,0)),
    'Determined': ((1.03,.63,-.010,.18,0), (1.03,.63,-.010,-.18,0)),
    'Celebrating': ((1.08,.43,.045,0,.11), (1.08,.43,.045,0,.11)),
    'Sleepy': ((1,.27,-.025,.02,0), (1,.27,-.025,-.02,0)),
}
# Brow height, outer-to-inner slope, arch height; x sign mirrors the slope.
BROWS = {
    'Happy': (2.53,.0,.027), 'Curious': (2.53,.06,.025),
    'Thinking': (2.49,.08,.018), 'Excited': (2.59,.0,.04),
    'Worried': (2.49,.19,.018), 'Surprised': (2.62,0,.045),
    'Determined': (2.44,-.20,.008), 'Celebrating': (2.55,0,.035),
    'Sleepy': (2.42,0,.008),
}
OPEN_MOUTH = {'Excited':(.14,.085), 'Surprised':(.079,.115), 'Celebrating':(.19,.10)}


def mouth_center(t, expression='Neutral'):
    x, z = .145*t, 1.775+.075*t*t
    if expression == 'Happy': x,z=.205*t,1.735+.12*t*t
    elif expression == 'Curious': x,z=.145*t+.035,1.805+.042*t*t+.025*t
    elif expression == 'Thinking': x,z=.105*t+.065,1.805+.013*t*t-.023*t
    elif expression == 'Worried': x,z=.15*t,1.86-.07*t*t
    elif expression == 'Determined': x,z=.15*t,1.80+.008*t*t
    elif expression == 'Sleepy': x,z=.09*t,1.79+.025*t*t
    y=-.715+.025*t*t
    if expression in OPEN_MOUTH: y=-.55  # the existing line tucks below the gel
    return Vector((x,y,z))


def brow_center(t, side, expression='Neutral'):
    sign=-1 if side=='L' else 1
    x=sign*.49+.18*t
    if expression=='Neutral': return Vector((x,-.45,2.48+.01*(1-t*t)))
    height,slope,arch=BROWS[expression]
    if expression=='Curious': height += .075 if side=='L' else -.075
    if expression=='Thinking': height += -.035 if side=='L' else .045
    z=height-sign*slope*t+arch*(1-t*t)
    return Vector((x,-.592,z))


def tube_geometry(name, center_fn, radius, material, rings=33, sides=8):
    verts=[]; params=[]; faces=[]
    for i in range(rings):
        t=-1+2*i/(rings-1)
        center=center_fn(t)
        tangent=(center_fn(min(1,t+.002))-center_fn(max(-1,t-.002))).normalized()
        normal=Vector((-tangent.z,0,tangent.x)).normalized()
        # Soft taper makes the end caps rounded without extra separate meshes.
        cap=math.sqrt(max(.12,1-max(0,abs(t)-.86)**2/.14**2))
        for j in range(sides):
            angle=j*math.tau/sides
            point=center+normal*(radius*math.cos(angle)*cap)+Vector((0,radius*math.sin(angle)*cap,0))
            verts.append(tuple(point));params.append((t,angle,cap))
    for i in range(rings-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;c=(i+1)*sides+(j+1)%sides;d=(i+1)*sides+j
            faces.append((a,d,c,b))
    faces.append(tuple(range(sides)))
    faces.append(tuple((rings-1)*sides+j for j in reversed(range(sides))))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(material)
    for attr,index in [('face_t',0),('face_angle',1),('face_cap',2)]:
        data=mesh.attributes.new(attr,'FLOAT','POINT')
        for i,value in enumerate(params):data.data[i].value=value[index]
    smooth(obj)
    return obj


def tag(obj, part):
    group=obj.vertex_groups.new(name='_face_'+part)
    group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    return obj


def eye_mesh(name,x,z,w,h,depth,material,y):
    obj=uv(name,(x,y,z),(w,depth,h),material,segments=32,rings=20)
    for vertex in obj.data.vertices:
        vertex.co.x*=1-.14*vertex.co.z/h
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            co=obj.data.vertices[obj.data.loops[li].vertex_index].co
            obj.data.uv_layers.active.data[li].uv=(co.x/(2*w)+.5,co.z/(2*h)+.5)
    return obj


def create_face(black,amber,white):
    objects=[];attachments=[]
    # A dark, matte interior reads as an opening rather than a glossy grey bead.
    interior=black.copy();interior.name='Face • mouth interior'
    shader=interior.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.9
    shader.inputs['Coat Weight'].default_value=0
    shader.inputs['Specular IOR Level'].default_value=0
    for sign,side in [(-1,'L'),(1,'R')]:
        rim=eye_mesh('EyeOutline_'+side,sign*.49,2.10,.29,.355,.072,black,-.592)
        iris=eye_mesh('AmberEye_'+side,sign*.49,2.10,.249,.310,.060,amber,-.647)
        glint=uv('EyeGlint_'+side,(sign*.49-.080,-.703,2.253),(.052,.018,.069),white,20,12)
        for obj in [rim,iris,glint]:
            tag(obj,'eye_'+side);objects.append(obj);attachments.append((obj,'eye_'+side))
        # The tiny basis radius keeps brows invisible in the original Neutral
        # face; expression morphs grow them smoothly into readable strokes.
        brow=tube_geometry('ExpressiveBrow_'+side,lambda t,s=side:brow_center(t,s),.00001,black,25,6)
        tag(brow,'brow_'+side);objects.append(brow);attachments.append((brow,'head'))
    smile=tube_geometry('FriendlySmile',mouth_center,.026,black)
    tag(smile,'mouth');objects.append(smile);attachments.append((smile,'head'))
    opening=uv('ExpressionMouthInterior',(0,-.55,1.80),(.03,.01,.02),interior,20,12)
    tag(opening,'opening');objects.append(opening);attachments.append((opening,'head'))
    return objects,attachments


def add_expression_keys(face):
    """Call after joining face pieces and applying their object transforms."""
    basis=face.shape_key_add(name='Basis',from_mix=False)
    groups={group.index:group.name.removeprefix('_face_') for group in face.vertex_groups if group.name.startswith('_face_')}
    parts={vertex.index:next((groups[g.group] for g in vertex.groups if g.group in groups),None) for vertex in face.data.vertices}
    attrs={name:face.data.attributes.get(name) for name in ['face_t','face_angle','face_cap']}
    for expression in EXPRESSIONS[1:]:
        key=face.shape_key_add(name=expression,from_mix=False)
        key.slider_min=0;key.slider_max=1
        for i,vertex in enumerate(basis.data):
            part=parts[i];co=vertex.co.copy()
            if part in ['eye_L','eye_R']:
                side=0 if part.endswith('L') else 1;sign=-1 if side==0 else 1
                sx,sz,dz,angle,curve=EYES[expression][side]
                x=(co.x-sign*.49)*sx;z=(co.z-2.10)*sz
                co.x=sign*.49+x*math.cos(angle)-z*math.sin(angle)
                co.z=2.10+dz+x*math.sin(angle)+z*math.cos(angle)+curve*max(0,1-(x/.30)**2)
            elif part in ['mouth','brow_L','brow_R']:
                t=attrs['face_t'].data[i].value;angle=attrs['face_angle'].data[i].value;cap=attrs['face_cap'].data[i].value
                fn=(lambda u:mouth_center(u,expression)) if part=='mouth' else (lambda u:brow_center(u,part[-1],expression))
                center=fn(t);tangent=(fn(min(1,t+.002))-fn(max(-1,t-.002))).normalized();normal=Vector((-tangent.z,0,tangent.x)).normalized()
                radius=.026 if part=='mouth' else .016
                co=center+normal*(radius*math.cos(angle)*cap)+Vector((0,radius*math.sin(angle)*cap,0))
            elif part=='opening' and expression in OPEN_MOUTH:
                w,h=OPEN_MOUTH[expression]
                co.x=co.x/.03*w;co.y=-.731+(co.y+.55);co.z=1.80+(co.z-1.80)/.02*h
                if expression in ['Excited','Celebrating']:
                    co.z+=(.04 if expression=='Excited' else .07)*(co.x/w)**2
            key.data[i].co=co
        key.value=0
    face['expressions']=list(EXPRESSIONS)
    face['expression_basis']='Neutral = all morph weights zero'
    # These authoring-only groups are not needed for deformation after keys exist.
    for group in list(face.vertex_groups):
        if group.name.startswith('_face_'):face.vertex_groups.remove(group)
    return face
