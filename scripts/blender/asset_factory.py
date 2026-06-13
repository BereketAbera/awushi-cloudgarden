"""Local miniature-world asset factory; no imported art, textures, or fonts.
All helpers author Z-up Blender geometry. Buildings face -Y, export +Z.
"""
import bpy, math, random
from mathutils import Vector
from common import material, smooth, uv, curve

def select(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def mesh(name, vertices, faces, materials):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
    for mat in materials:data.materials.append(mat)
    return o

def bevel(o,width=.04,segments=2):
    if not width:return o
    select(o);m=o.modifiers.new('Miniature softened edges','BEVEL');m.width=width;m.segments=segments
    bpy.ops.object.modifier_apply(modifier=m.name)
    m=o.modifiers.new('Corner normals','WEIGHTED_NORMAL');m.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=m.name)
    return o

def box(name,loc,size,mat,edge=.035):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    return bevel(o,min(edge,min(size)*.35))

def cylinder(name,loc,radius,depth,mat,segments=24,edge=.025):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=radius,depth=depth,location=loc)
    o=bpy.context.object;o.name=name;o.data.materials.append(mat);bevel(o,min(edge,depth*.3));return smooth(o)

def sphere(name,loc,scale,mat):return uv(name,loc,scale,mat,20,12)

def torus(name,loc,radius,tube,mat,rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,major_radius=radius,minor_radius=tube,location=loc)
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    if rotation:o.rotation_euler=rotation
    return smooth(o)

def rod(name,a,b,radius,mat,segments=12):
    # Direct mesh construction keeps the hundreds of repeated rail segments cheap.
    # Rounded normals provide the same silhouette without imperceptible bevel rings.
    a,b=Vector(a),Vector(b);direction=(b-a).normalized()
    tangent=direction.cross(Vector((0,0,1)))
    if tangent.length<.001:tangent=direction.cross(Vector((0,1,0)))
    tangent.normalize();bitangent=direction.cross(tangent).normalized()
    verts=[tuple(point+radius*(tangent*math.cos(i*math.tau/segments)+bitangent*math.sin(i*math.tau/segments))) for point in [a,b] for i in range(segments)]
    faces=[(i,(i+1)%segments,segments+(i+1)%segments,segments+i) for i in range(segments)]
    faces.extend([tuple(reversed(range(segments))),tuple(range(segments,2*segments))])
    obj=mesh(name,verts,faces,[mat])
    for face in obj.data.polygons:face.use_smooth=face.index<segments
    return obj

def line(name,points,radius,mat):return curve(name,points,radius,mat,resolution=3)

def lettering(name,body,loc,size,mat,rotation=(math.pi/2,0,0)):
    data=bpy.data.curves.new(name,'FONT');data.body=body;data.size=size;data.align_x='CENTER';data.extrude=.0015;data.bevel_depth=0;data.resolution_u=2
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=rotation;data.materials.append(mat)
    select(o);bpy.ops.object.convert(target='MESH');return bpy.context.object

def plaque(name,label,loc,width,mat,textmat):
    x,y,z=loc;box(name+' plaque',loc,(width,.07,.26),mat,.035)
    lettering(name+' lettering',label,(x,y-.041,z-.049),min(.125,width/max(len(label),1)*1.4),textmat)

def palette():
    values={
      'navy':((.025,.061,.091),.5,.08),'slate':((.07,.18,.23),.51,.08),
      'edge':((.16,.32,.34),.4,.15),'cream':((.70,.61,.40),.67,0),
      'wood':((.36,.19,.085),.7,0),'roof':((.045,.23,.245),.45,.06),
      'moss':((.08,.27,.22),.9,0),'leaf':((.21,.44,.30),.8,0),
      'path':((.31,.40,.39),.82,0),'rock':((.055,.11,.15),.8,0),
      'rockLight':((.10,.20,.245),.8,0),'rockDark':((.035,.075,.105),.85,0),
      'white':((.79,.88,.80),.55,0),'glass':((.045,.40,.44),.22,.1),
      'gold':((.95,.49,.10),.3,.1),'cyan':((.055,.64,.74),.3,.1),
    }
    p={k:material('Miniature • '+k,c,r,m,emission=.3 if k in ['gold','cyan'] else 0) for k,(c,r,m) in values.items()}
    for mat in p.values():mat.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=.12
    return p

def accent(hex_color,name):
    v=hex_color.lstrip('#');srgb=[int(v[i:i+2],16)/255 for i in [0,2,4]]
    linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in srgb]
    return material('District • '+name,linear,.5,.02,emission=.08)

def terrain(name,radius,p,seed=0):
    """Disc is completely flat through radius-.2; only nonwalkable rim slopes."""
    n=56;random.seed(seed);radii=[radius+.04+.07*(1+math.sin(i*1.83+seed))/2 for i in range(n)]
    verts=[(0,0,0)]
    for i in range(n):
        a=i*math.tau/n;verts.append(((radius-.2)*math.cos(a),(radius-.2)*math.sin(a),0))
    for i,r in enumerate(radii):
        a=i*math.tau/n;verts.append((r*math.cos(a),r*math.sin(a),-.08))
    faces=[(0,1+i,1+(i+1)%n) for i in range(n)]
    for i in range(n):j=(i+1)%n;faces.append((1+i,n+1+i,n+1+j,1+j))
    mesh(name+' flat meadow',verts,faces,[p['moss']])
    verts=[]
    for ring,(factor,z) in enumerate([(1,-.08),(.98,-1.20),(.82,-3.3),(.49,-5.0),(.13,-6.1)]):
        for i,r in enumerate(radii):
            a=i*math.tau/n;rr=r*factor*(1+.025*math.sin(i*1.3+ring)) if ring>1 else r*factor
            verts.append((rr*math.cos(a),rr*math.sin(a),z+(.14*math.sin(i*1.7) if ring>1 else 0)))
    verts.append((0,0,-6.6));faces=[]
    for ring in range(4):
        for i in range(n):
            a=ring*n+i;b=ring*n+(i+1)%n;c=(ring+1)*n+(i+1)%n;d=(ring+1)*n+i
            faces.extend([(a,c,b),(a,d,c)])
    for i in range(n):faces.append((4*n+i,5*n,4*n+(i+1)%n))
    rock=mesh(name+' outward bedrock',verts,faces,[p['rock'],p['rockLight'],p['rockDark']])
    for face in rock.data.polygons:face.material_index=random.choices([0,1,2],[.52,.3,.18])[0]
    return rock

def ribbon(name,points,width,mat,thickness=0):
    pts=[Vector(x) for x in points];verts=[]
    for i,p in enumerate(pts):
        direction=pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)];direction.z=0;direction.normalize();normal=Vector((-direction.y,direction.x,0))*width/2
        verts.extend([tuple(p+normal),tuple(p-normal)])
    faces=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(pts)-1)]
    if thickness:
        count=len(verts);verts.extend([(x,y,z-thickness) for x,y,z in verts])
        for i in range(len(pts)-1):
            a=2*i;b=a+1;c=a+3;d=a+2
            faces.extend([(count+a,count+d,count+c,count+b),(a,d,count+d,count+a),(b,count+b,count+c,c)])
        faces.extend([(0,count,count+1,1),(count-2,count-1,2*count-1,2*count-2)])
    return mesh(name,verts,faces,[mat])

def tree(name,loc,p,scale=1):
    x,y,z=loc;cylinder(name+' trunk',(x,y,z+.28*scale),.09*scale,.56*scale,p['wood'],10,0)
    sphere(name+' canopy',(x,y,z+.80*scale),(.42*scale,.37*scale,.62*scale),p['leaf'])
    sphere(name+' new growth',(x-.18*scale,y,z+1.02*scale),(.26*scale,.24*scale,.35*scale),p['moss'])

def plant_rim(name,radius,p,seed,excluded_angles):
    random.seed(seed)
    for i in range(18):
        a=i*math.tau/18+.12
        if any(abs(math.atan2(math.sin(a-b),math.cos(a-b)))<.23 for b in excluded_angles):continue
        r=radius+.1
        x,y=r*math.cos(a),r*math.sin(a)
        if i%3==0:tree(name,(x,y,-.10),p,.65+random.random()*.3)
        else:sphere(name+' rim moss',(x,y,-.06),(.42,.25,.14),p['leaf'])

def window(x,y,z,width,height,p,accentmat):
    box('Window recess',(x,y,z),(width+.10,.08,height+.10),p['navy'])
    box('Window glow',(x,y-.05,z),(width,.025,height),accentmat,.015)

def stack_server(x,y,z,p,accentmat,height=1.5):
    box('Equipment foot',(x,y,z+.08),(.62,.55,.16),p['edge'])
    box('Rounded server cabinet',(x,y,z+height/2),(.54,.48,height),p['slate'],.08)
    for j in range(4):
        zz=z+.25+j*(height-.35)/4
        box('Server tray',(x,y-.25,zz),(.39,.035,.14),p['navy'],.014)
        box('Status indicator',(x+.12,y-.273,zz),(.065,.015,.035),accentmat,.005)

def warehouse(p,a):
    box('Registry foundation',(0,0,.10),(2.15,1.8,.2),p['navy'],.08)
    box('Image repository shell',(0,.13,.92),(2.0,1.55,1.65),p['cream'],.12)
    box('Warehouse cap',(0,.13,1.82),(2.22,1.7,.20),p['roof'],.08)
    for x in [-.75,-.45,-.15,.15,.45,.75]:box('Warehouse roof ribs',(x,.13,1.95),(.035,1.55,.07),p['edge'],.005)
    box('Loading door',(0,-.67,.77),(1.05,.06,1.2),p['navy'])
    for z in [.3,.48,.66,.84,1.02,1.2]:box('Loading door ribs',(0,-.71,z),(.91,.03,.025),p['slate'],.005)
    for x in [-.75,.75]:window(x,-.70,1.03,.29,.40,p,a)
    plaque('Registry','IMAGE REGISTRY',(0,-.78,1.60),1.70,p['navy'],p['white'])
    box('Versioned image package',(.68,-.92,.24),(.45,.38,.42),a)

def crane_yard(p,a):
    box('Infrastructure slab',(0,0,.075),(2.15,2.0,.15),p['path'],.06)
    for x in [-.65,.65]:
        for y in [-.45,.40]:box('Foundation modules',(x,y,.27),(.65,.56,.40),p['cream'])
    x=.72;y=.53
    cylinder('Crane foundation',(x,y,.16),.35,.24,p['navy'],20)
    for dx,dy in [(-.15,-.15),(.15,-.15),(-.15,.15),(.15,.15)]:rod('Crane tower',(x+dx,y+dy,.22),(x+dx,y+dy,3.1),.043,a)
    for z in [.6,1.2,1.8,2.4,3]:
        rod('Crane rung',(x-.17,y-.17,z),(x+.17,y-.17,z),.028,p['edge'])
        rod('Crane truss',(x-.17,y-.17,z-.5),(x+.17,y-.17,z),.024,p['edge'])
    box('Crane arm',(-.10,y,3.05),(2.05,.28,.22),a,.025)
    rod('Hoist cable',(-.94,y,3.0),(-.94,y,1.65),.016,p['navy'])
    box('Suspended module',(-.94,y,1.49),(.40,.36,.32),p['slate'])
    plaque('Infrastructure','PLAN / APPLY',(0,-1.02,.61),1.50,p['navy'],p['white'])

def mini_containers(p,a):
    cylinder('Container quay base',(0,0,.05),.70,.10,p['navy'],24)
    for x,y,z,mat in [(-.23,.15,.28,p['slate']),(.25,.15,.28,a),(0,.12,.68,p['roof'])]:
        box('Shipping container',(x,y,z),(.43,.80,.36),mat,.025)
        for yy in [-.20,0,.20,.40]:box('Container corrugation',(x,yy,z+.19),(.40,.025,.025),p['edge'],.003)
    plaque('Quay','CONTAINERS',(0,-.43,.28),1.03,p['navy'],p['white'])

def gitops(p,a):
    cylinder('GitOps platform',(0,0,.08),1.35,.16,p['navy'],40)
    for x in [-.72,.72]:
        for y in [-.62,.62]:
            cylinder('Control tower',(x,y,1.1),.20,2.05,p['slate'],16)
            cylinder('Tower cap',(x,y,2.17),.24,.15,a,16)
    cylinder('Desired-state core',(0,0,1.0),.50,1.55,p['glass'],32)
    for z in [.35,.9,1.45,1.85]:torus('Reconciliation loop',(0,0,z),.59,.035,a)
    sphere('Desired state beacon',(0,0,2.05),(.30,.30,.30),p['cyan'])
    plaque('GitOps','GITOPS',(0,-1.05,.48),1.18,p['slate'],p['white'])

def network(p,a):
    cylinder('Network pedestal',(0,0,.10),.68,.20,p['navy'],24)
    cylinder('Network switch',(0,0,.65),.31,.94,p['slate'],20)
    for i in range(6):
        t=i*math.tau/6;x=.53*math.cos(t);y=.53*math.sin(t)
        rod('Network spoke',(0,0,1.13),(x,y,1.43),.026,a)
        sphere('Network endpoint',(x,y,1.43),(.09,.09,.09),a)
    torus('Service ring',(0,0,1.13),.34,.026,p['cyan'])
    plaque('Network','NETWORK',(0,-.55,.37),1.0,p['slate'],p['white'])

def checkpoint(p,a):
    box('Fortress foundation',(0,0,.10),(2.20,1.55,.20),p['navy'],.10)
    for x in [-.78,.78]:
        cylinder('Hexagonal checkpoint tower',(x,0,1.29),.45,2.4,p['slate'],6,.04)
        cylinder('Battlement crown',(x,0,2.52),.53,.18,a,6,.02)
        for i in range(6):
            t=i*math.tau/6;box('Battlement merlon',(x+.38*math.cos(t),.38*math.sin(t),2.72),(.18,.18,.28),p['navy'],.02)
        window(x,-.39,1.60,.16,.57,p,a)
    box('Security gate lintel',(0,0,2.23),(1.10,.42,.32),a)
    for x in [-.35,-.175,0,.175,.35]:rod('Access gate bars',(x,-.14,.14),(x,-.14,2.1),.026,p['edge'])
    box('Access lock',(0,-.25,1.13),(.35,.12,.37),p['gold'])
    plaque('Access','ACCESS CONTROL',(0,-.70,.40),1.80,p['navy'],p['white'])

def vault(p,a):
    box('Secrets vault foundation',(0,0,.10),(2.15,1.85,.20),p['navy'],.08)
    box('Reinforced vault',(0,.1,1.08),(1.95,1.55,1.95),p['slate'],.17)
    for x in [-.85,.85]:box('Vault reinforcements',(x,.1,1.06),(.14,1.65,2.0),a,.035)
    for z in [.28,1.86]:box('Vault crossbeam',(0,-.74,z),(1.85,.18,.15),a)
    door=cylinder('Round vault door',(0,-.75,1.10),.66,.16,p['navy'],32);door.rotation_euler[0]=math.pi/2
    torus('Vault gasket',(0,-.85,1.10),.54,.04,p['edge'],(math.pi/2,0,0))
    torus('Vault handwheel',(0,-.96,1.10),.23,.034,p['gold'],(math.pi/2,0,0))
    for i in range(4):
        t=i*math.pi/2;rod('Wheel spoke',(0,-.96,1.10),(.25*math.cos(t),-.96,1.10+.25*math.sin(t)),.023,p['gold'])
    plaque('Secrets','SECRETS VAULT',(0,-.81,2.03),1.75,p['navy'],p['white'])

def inspection(p,a):
    cylinder('Artifact podium',(0,0,.09),.68,.18,p['navy'],24)
    box('Inspection artifact',(0,0,.47),(.65,.61,.64),p['cream'],.06)
    box('Artifact seal',(0,-.32,.48),(.28,.035,.25),a)
    rod('Magnifier arm',(.35,.15,.12),(.35,.15,1.3),.045,p['edge'])
    torus('Trust inspection lens',(.15,-.1,1.43),.34,.045,a,(math.pi/2,0,0))
    plaque('Provenance','VERIFY',(0,-.57,.20),.95,p['navy'],p['white'])

def observatory(p,a):
    cylinder('Observatory foundation',(0,0,.10),1.28,.20,p['navy'],40)
    cylinder('Observatory drum',(0,0,.70),1.04,1.16,p['cream'],32)
    for i in range(8):
        t=i*math.tau/8;x=1.04*math.cos(t);y=1.04*math.sin(t)
        o=box('Observatory ribs',(x,y,.72),(.09,.09,1.13),p['edge'],.015)
    dome=sphere('Signal dome',(0,0,1.33),(1.09,1.09,.78),p['roof'])
    # Half dome is intentionally hidden within cylindrical walls; no open face.
    telescope=rod('Observatory telescope',(-.05,0,1.66),(.83,-.43,2.62),.24,a,24)
    end=Vector((.83,-.43,2.62));direction=(end-Vector((-.05,0,1.66))).normalized()
    lens=cylinder('Telescope objective',end,.27,.10,p['cyan'],24);lens.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
    plaque('Observe','METRICS / LOGS / TRACES',(0,-1.07,.57),1.9,p['navy'],p['white'])

def beacon(p,a):
    cylinder('Signal tower base',(0,0,.12),1.06,.24,p['navy'],32)
    for x,y in [(-.54,-.40),(.54,-.40),(0,.55)]:rod('Telemetry tower leg',(x,y,.16),(x*.40,y*.40,2.50),.075,p['edge'])
    for z in [.60,1.2,1.8]:torus('Signal tower brace',(0,0,z),.51-z*.09,.035,p['slate'])
    cylinder('Beacon housing',(0,0,2.48),.42,.35,a,24)
    sphere('Signal glow',(0,0,2.86),(.31,.31,.30),p['gold'])
    torus('Broadcast ring',(0,0,2.86),.65,.025,a)
    for x in [-.66,.66]:
        box('Telemetry dashboard',(x,-.44,.74),(.51,.09,.55),p['navy'])
        for j in range(4):box('Dashboard sparkline',(x-.16+j*.10,-.50,.65+.06*math.sin(j*2)),(.06,.025,.08+.08*(j%2)),a,.003)
    plaque('Alerts','INCIDENT BEACON',(0,-.88,.32),1.64,p['slate'],p['white'])

def database(p,a):
    cylinder('Data conservatory base',(0,0,.09),1.29,.18,p['navy'],40)
    for z in [.34,.80,1.26,1.72]:
        cylinder('Database volume',(0,.09,z),.67,.36,p['cream'],32,.05)
        torus('Data index ring',(0,.09,z+.19),.65,.028,a)
    for i in range(6):
        t=i*math.tau/6;x=1.0*math.cos(t);y=1.0*math.sin(t)
        rod('Conservatory frame',(x,y,.14),(x*.70,y*.70,2.04),.035,p['edge'])
    torus('Conservatory crown',(0,0,2.04),.71,.04,p['edge'])
    sphere('Glass conservatory roof',(0,0,2.06),(.72,.72,.33),p['glass'])
    plaque('Data','DATABASE',(0,-1.04,.47),1.40,p['slate'],p['white'])

def messaging(p,a):
    box('Exchange foundation',(0,0,.10),(2.15,1.72,.20),p['navy'],.09)
    box('Message sorting hall',(0,.15,.94),(1.86,1.27,1.56),p['cream'],.13)
    box('Exchange roof',(0,.15,1.78),(2.05,1.47,.20),p['roof'],.06)
    for x in [-.57,0,.57]:
        box('Queue slot',(x,-.52,.89),(.39,.09,.47),p['navy'])
        box('Message envelope',(x,-.58,.91),(.31,.035,.21),a,.018)
        line('Envelope fold',[(x-.14,-.605,1.0),(x,-.605,.91),(x+.14,-.605,1.0)],.012,p['white'])
    for x in [-.75,.75]:
        line('Broker pipe',[(x,.4,1.82),(x,.4,2.15),(0,.4,2.15)],.055,p['edge'])
    plaque('Message','MESSAGE EXCHANGE',(0,-.54,1.48),1.70,p['navy'],p['white'])

def recovery(p,a):
    cylinder('Recovery garden base',(0,0,.08),.70,.16,p['navy'],24)
    for z in [.31,.56,.81]:cylinder('Backup snapshot',(0,.04,z),.43,.20,p['cream'],24)
    torus('Recovery orbit',(0,0,1.1),.53,.04,a,(math.pi/2,0,0))
    box('Recovery plus horizontal',(0,-.08,1.10),(.43,.09,.12),p['gold'],.015)
    box('Recovery plus vertical',(0,-.08,1.10),(.12,.09,.43),p['gold'],.015)
    plaque('Recover','RESTORE',(0,-.56,.23),.95,p['navy'],p['white'])

def delivery(p,a):
    cylinder('Delivery post base',(0,0,.06),.67,.12,p['path'],24)
    cylinder('Parcel post',(0,.1,.66),.16,1.2,p['wood'],12)
    box('Delivery mailbox',(0,-.05,1.29),(.84,.63,.53),p['roof'],.10)
    box('Parcel slot',(0,-.38,1.30),(.51,.03,.07),p['navy'],.01)
    box('Parcel waiting',(0,-.26,.31),(.65,.50,.46),a,.04)
    plaque('Delivery','DELIVERY',(0,-.40,.89),.98,p['navy'],p['white'])

BUILDERS={'registry':warehouse,'infrastructure':crane_yard,'containers':mini_containers,'gitops':gitops,'network':network,'security':checkpoint,'secrets':vault,'supply-chain':inspection,'observability':observatory,'alerts':beacon,'database':database,'messaging':messaging,'recovery':recovery,'delivery':delivery}
