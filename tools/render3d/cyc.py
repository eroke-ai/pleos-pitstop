import bpy, sys, json, math, mathutils
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
glb,out=args[0],args[1]; res=int(args[2]) if len(args)>2 else 800; samples=int(args[3]) if len(args)>3 else 96
resy=int(args[4]) if len(args)>4 else res
meta=json.load(open(glb[:-4]+'.json'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc=bpy.context.scene
for o in [o for o in sc.objects if o.type=='LIGHT']: bpy.data.objects.remove(o)
meshes=[o for o in sc.objects if o.type=='MESH']
for m in set(s.material for o in meshes for s in o.material_slots if s.material):
    nt=m.node_tree; bs=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not bs: continue
    if not bs.inputs['Normal'].is_linked:
        bv=nt.nodes.new('ShaderNodeBevel'); bv.samples=6; bv.inputs['Radius'].default_value=meta.get('bevel',0.012); nt.links.new(bv.outputs['Normal'],bs.inputs['Normal'])
    met=bs.inputs['Metallic'].default_value; col=bs.inputs['Base Color'].default_value
    if met<.5 and max(col[:3])<.06 and bs.inputs['Roughness'].default_value>.8:  # rubber
        bs.inputs['Roughness'].default_value=.62; bs.inputs['Base Color'].default_value=(.018,.018,.02,1)
    if met>.5:  # 금속: 미세한 결
        nz=nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value=180; mp=nt.nodes.new('ShaderNodeMapRange'); r=bs.inputs['Roughness'].default_value
        mp.inputs['To Min'].default_value=max(r-.06,.05); mp.inputs['To Max'].default_value=r+.1; nt.links.new(nz.outputs['Fac'],mp.inputs['Value']); nt.links.new(mp.outputs['Result'],bs.inputs['Roughness'])
# bounds
pts=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
mn=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts))); mx=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
c=(mn+mx)/2; rad=(mx-mn).length/2
d=meta['dir']; v=Vector((d[0],-d[2],d[1])).normalized()
if 'cam' in meta:
    cp=meta['cam']; tg=meta['target']; fov=meta['fov']; campos=Vector((cp[0],-cp[2],cp[1])); tgt=Vector((tg[0],-tg[2],tg[1]))
else:
    fov=22; campos=c+v*(rad/math.sin(math.radians(fov/2))*1.06); tgt=c
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera=cam
cam.location=campos; cam.rotation_euler=(tgt-campos).to_track_quat('-Z','Y').to_euler(); cam.data.sensor_fit='VERTICAL'; cam.data.angle_y=math.radians(fov); cam.data.clip_end=500
if meta.get('ground',True):
    bpy.ops.mesh.primitive_plane_add(size=rad*40,location=(c.x,c.y,mn.z-0.001)); g=bpy.context.object; g.is_shadow_catcher=True
def area(name,loc,size,power,color=(1,1,1)):
    l=bpy.data.lights.new(name,'AREA'); l.size=size*rad; l.energy=power*rad*rad*meta.get('gain',.8); l.color=color; o=bpy.data.objects.new(name,l); sc.collection.objects.link(o)
    o.location=c+Vector(loc)*rad; o.rotation_euler=(c-o.location).to_track_quat('-Z','Y').to_euler(); return o
# 카메라 기준 좌표로 조명 배치
right=v.cross(Vector((0,0,1))).normalized()*-1; up=Vector((0,0,1))
P=lambda r,u,f:(right*r+up*u+v*f)
area('key',P(-2.6,3.4,2.2),3.2,300)
area('fill',P(3.2,1.2,2.4),4.0,90,(.92,.96,1))
area('rim',P(1.5,2.6,-3.4),2.4,300,(.75,.92,1))
area('top',P(0,5,0.3),5.0,130)
area('warm',P(-3.5,.2,-1.5),2.0,120,(1,.72,.45))
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(meta.get('world',.05),)*3+(1,); w.node_tree.nodes['Background'].inputs[1].default_value=1
sc.render.engine='CYCLES'; sc.cycles.samples=samples; sc.cycles.use_denoising=True; sc.cycles.device='CPU'
sc.render.film_transparent=True; sc.render.resolution_x=res; sc.render.resolution_y=resy; sc.render.resolution_percentage=100
sc.view_settings.view_transform='AgX'
try: sc.view_settings.look='AgX - High Contrast'
except Exception as e: print('look',e)
sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'; sc.render.filepath=out
bpy.ops.render.render(write_still=True)
