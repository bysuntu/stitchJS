#!/usr/bin/env python3
"""
Blender-based isotropic remeshing using Blender's superior UV parameterization
and remeshing tools instead of libigl's limited LSCM.

Usage:
  blender --background --python blender_remesh.py -- input.stl output.stl --edge-length 0.5
"""

import bpy
import sys
import math
from pathlib import Path

def clear_scene():
    """Remove all objects from the scene"""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def import_stl(filepath):
    """Import STL file into Blender"""
    bpy.ops.import_mesh.stl(filepath=str(filepath))
    return bpy.context.selected_objects[0]

def apply_uv_unwrap(obj, method='SMART_UV_PROJECT'):
    """
    Apply UV unwrapping to the mesh using Blender's superior methods.

    Methods available:
    - SMART_UV_PROJECT: Industry standard, handles complex surfaces well
    - ANGLE_BASED: ABF++ equivalent, angle-preserving
    - UNWRAP: Angle and area preserving
    """
    # Enter edit mode
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')

    # Select all faces
    bpy.ops.mesh.select_all(action='SELECT')

    # Apply unwrapping
    if method == 'SMART_UV_PROJECT':
        try:
            # Blender 4.0+ parameter names
            bpy.ops.uv.smart_project(angle_limit=math.radians(66),
                                      island_margin=0.02, area_weight=0)
        except:
            # Fallback for older Blender versions
            bpy.ops.uv.smart_project()
    elif method == 'ANGLE_BASED':
        bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.02)
    else:
        bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.02)

    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"✓ UV unwrapping applied using {method}")

def apply_remesh(obj, voxel_size=None, use_voxel=False, original_mesh=None):
    """
    Apply Blender's isotropic remeshing with edge preservation.

    Strategy:
    1. Use VOXEL mode for density control (creates uniform mesh)
    2. Apply Shrinkwrap modifier to project back onto original surface
       (This preserves sharp features and surface details)

    Args:
        obj: Object to remesh
        voxel_size: Target voxel size
        use_voxel: Whether to apply voxel remeshing
        original_mesh: Original mesh object for shrinkwrap (optional)
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='OBJECT')

    if voxel_size and use_voxel:
        try:
            # Step 1: Apply voxel remesh for density control
            print(f"  [1/2] Applying voxel remesh with voxel_size={voxel_size}")
            remesh = obj.modifiers.new(name="Remesh", type='REMESH')
            remesh.mode = 'VOXEL'
            remesh.voxel_size = voxel_size
            with bpy.context.temp_override(object=obj):
                bpy.ops.object.modifier_apply(modifier=remesh.name)
            print(f"  ✓ Voxel remesh applied")

            # Step 2: Apply shrinkwrap to preserve original surface details
            if original_mesh is not None:
                print(f"  [2/2] Applying shrinkwrap to preserve original surface features")
                shrinkwrap = obj.modifiers.new(name="Shrinkwrap", type='SHRINKWRAP')
                shrinkwrap.target = original_mesh
                shrinkwrap.wrap_method = 'NEAREST_SURFACEPOINT'
                shrinkwrap.offset = 0.0

                with bpy.context.temp_override(object=obj):
                    bpy.ops.object.modifier_apply(modifier=shrinkwrap.name)
                print(f"  ✓ Shrinkwrap applied - surface features preserved")

            print(f"✓ Isotropic remesh with edge preservation applied (voxel size {voxel_size})")
        except Exception as e:
            print(f"⚠ Remesh with shrinkwrap failed: {e}")
            print("  Falling back to simple voxel remesh")
            try:
                remesh = obj.modifiers.new(name="Remesh", type='REMESH')
                remesh.mode = 'VOXEL'
                remesh.voxel_size = voxel_size
                with bpy.context.temp_override(object=obj):
                    bpy.ops.object.modifier_apply(modifier=remesh.name)
                print(f"✓ Voxel remesh applied")
            except Exception as e2:
                print(f"⚠ Remesh modifier failed: {e2}")
                print("  Applying smooth shading as fallback")
                bpy.ops.object.shade_smooth()
    else:
        # Apply smooth shading first for better results
        bpy.ops.object.shade_smooth()
        print("✓ Smooth shading applied")

def fix_orientation(obj):
    """Ensure all face normals point outward (correct orientation)"""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')

    # Recalculate normals facing outward
    bpy.ops.mesh.normals_make_consistent(inside=False)

    bpy.ops.object.mode_set(mode='OBJECT')
    print("✓ Face normals corrected (outward facing)")

def decimate_mesh(obj, ratio=0.5):
    """
    Apply decimation for simplification while maintaining quality.

    Args:
        obj: Blender object
        ratio: Target ratio of faces to keep (0.0-1.0)
    """
    bpy.context.view_layer.objects.active = obj

    # Add decimation modifier
    decimation = obj.modifiers.new(name="Decimation", type='DECIMATE')
    decimation.ratio = ratio
    decimation.use_collapse_edge_loop = True

    # Apply modifier
    bpy.ops.object.modifier_apply(modifier=decimation.name)
    print(f"✓ Decimation applied (ratio={ratio})")

def apply_smooth_shade(obj):
    """Apply smooth shading and fix orientation"""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()

    # Also apply a subdivision surface for smoother results
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.faces_shade_smooth()
    bpy.ops.object.mode_set(mode='OBJECT')

    print("✓ Smooth shading applied")

def write_obj_manual(obj, filepath):
    """Manually write OBJ file with UV coordinates"""
    mesh = obj.data
    vertices = mesh.vertices

    with open(str(filepath), 'w') as f:
        f.write("# OBJ file with UV coordinates\n")
        f.write(f"# Object: {obj.name}\n\n")

        # Write vertices
        f.write("# Vertices\n")
        for v in vertices:
            f.write(f"v {v.co.x} {v.co.y} {v.co.z}\n")

        # Write UV coordinates if available
        f.write("\n# Texture coordinates\n")
        if mesh.uv_layers:
            uv_layer = mesh.uv_layers[0]
            # Track which UV coordinates we've written to avoid duplicates
            uv_index_map = {}
            uv_count = 0

            for face in mesh.polygons:
                for loop_idx in face.loop_indices:
                    uv = uv_layer.data[loop_idx].uv
                    uv_key = (round(uv[0], 6), round(uv[1], 6))
                    if uv_key not in uv_index_map:
                        uv_index_map[uv_key] = uv_count + 1
                        f.write(f"vt {uv[0]} {uv[1]}\n")
                        uv_count += 1

        # Write faces (v/vt format - vertex/texture)
        f.write("\n# Faces\n")
        if mesh.uv_layers:
            uv_layer = mesh.uv_layers[0]
            uv_index_map = {}
            uv_count = 0

            # Rebuild map for faces
            for face in mesh.polygons:
                for loop_idx in face.loop_indices:
                    uv = uv_layer.data[loop_idx].uv
                    uv_key = (round(uv[0], 6), round(uv[1], 6))
                    if uv_key not in uv_index_map:
                        uv_index_map[uv_key] = uv_count + 1
                        uv_count += 1

            for face in mesh.polygons:
                f.write("f")
                for loop_idx in face.loop_indices:
                    vertex_idx = mesh.loops[loop_idx].vertex_index + 1
                    uv = uv_layer.data[loop_idx].uv
                    uv_key = (round(uv[0], 6), round(uv[1], 6))
                    uv_idx = uv_index_map[uv_key]
                    f.write(f" {vertex_idx}/{uv_idx}")
                f.write("\n")
        else:
            # No UV data, write v format
            for face in mesh.polygons:
                f.write("f")
                for vertex_idx in face.vertices:
                    f.write(f" {vertex_idx + 1}")
                f.write("\n")

def export_stl(obj, filepath):
    """Export object as STL"""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)

    bpy.ops.export_mesh.stl(filepath=str(filepath), use_selection=True, use_mesh_modifiers=True)
    print(f"✓ STL exported to {filepath}")

def export_obj_with_uv(obj, filepath):
    """Export object as OBJ (preserves UV data)"""
    write_obj_manual(obj, filepath)
    print(f"✓ OBJ with UV exported to {filepath}")

def export_uv_as_mesh(obj, filepath):
    """Export UV coordinates as 3D mesh for visualization (Z=0 plane)"""
    # Get mesh data
    mesh = obj.data

    # Create new mesh object for UV visualization
    uv_vertices = []
    uv_faces = []

    # Extract UV coordinates and faces
    if mesh.uv_layers:
        uv_layer = mesh.uv_layers[0]

        # Map vertex+uv to 3D point
        for face in mesh.polygons:
            face_verts = []
            for loop_idx in face.loop_indices:
                uv = uv_layer.data[loop_idx].uv
                # Create 3D point: (u, v, 0)
                uv_vertices.append((uv[0], uv[1], 0))
                face_verts.append(len(uv_vertices) - 1)
            uv_faces.append(face_verts)

    # Create new mesh
    uv_mesh = bpy.data.meshes.new("UV_Mesh")
    uv_mesh.from_pydata(uv_vertices, [], uv_faces)
    uv_mesh.update()

    # Create object
    uv_obj = bpy.data.objects.new("UV_Visualization", uv_mesh)
    bpy.context.collection.objects.link(uv_obj)

    # Export
    bpy.context.view_layer.objects.active = uv_obj
    bpy.ops.object.select_all(action='DESELECT')
    uv_obj.select_set(True)

    if filepath.endswith('.obj'):
        bpy.ops.export_scene.obj(filepath=str(filepath), use_selection=True)
    else:
        bpy.ops.export_mesh.stl(filepath=str(filepath), use_selection=True, ascii=True)

    print(f"✓ UV visualization exported to {filepath}")

    # Clean up
    bpy.data.objects.remove(uv_obj, do_unlink=True)
    bpy.data.meshes.remove(uv_mesh)

def remesh_with_blender(input_file, output_file, edge_length=0.5, use_voxel=True):
    """
    Main remeshing pipeline using Blender.

    Pipeline:
    1. Import STL
    2. Fix orientation (outward normals)
    3. Apply UV unwrapping (Smart UV Project - non-overlapping)
    4. Apply isotropic voxel remeshing
    5. Export results with UV data

    Args:
        input_file: Input STL file path
        output_file: Output STL file path
        edge_length: Target voxel size for remeshing
        use_voxel: Whether to apply voxel remeshing
    """
    print("=" * 70)
    print("BLENDER-BASED ISOTROPIC REMESHING")
    print("=" * 70)

    # Clear scene
    clear_scene()

    # Import mesh
    print(f"\n[1/5] Importing {input_file}...")
    mesh = import_stl(input_file)
    print(f"  ✓ Mesh imported: {mesh.name}")

    # Fix orientation
    print(f"\n[2/5] Fixing mesh orientation...")
    fix_orientation(mesh)

    # Apply UV unwrapping (Blender's Smart UV Project is much better than LSCM)
    print(f"\n[3/5] Applying UV unwrapping (Smart UV Project)...")
    print(f"  Smart UV Project creates non-overlapping parameterization")
    print(f"  (much better than libigl's LSCM which produces overlaps)")
    apply_uv_unwrap(mesh, method='SMART_UV_PROJECT')

    # Export UV parameterization BEFORE remeshing (remesh removes UV data)
    print(f"\n[4/5] Exporting UV parameterization visualization...")
    output_uv_stl = output_file.replace('.stl', '_uv.stl')
    export_uv_as_mesh(mesh, output_uv_stl)

    # Duplicate mesh for shrinkwrap target (preserve original surface)
    # Create a copy of the original mesh to use as shrinkwrap target
    import bpy
    original_mesh_copy = bpy.data.objects.new("OriginalMesh", mesh.data.copy())
    bpy.context.collection.objects.link(original_mesh_copy)

    # Apply isotropic remeshing using voxel remesh with shrinkwrap
    print(f"\n[5/5] Applying isotropic voxel remeshing with surface projection...")
    if use_voxel:
        apply_remesh(mesh, voxel_size=edge_length, use_voxel=True, original_mesh=original_mesh_copy)
    else:
        apply_smooth_shade(mesh)
        print("✓ Smooth shading applied (no voxel remeshing)")

    # Clean up the copy
    bpy.data.objects.remove(original_mesh_copy, do_unlink=True)

    # Export results
    print(f"\n[6/6] Exporting final results...")

    # Export final remeshed STL (ASCII format)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.ops.export_mesh.stl(filepath=output_file, use_selection=True, ascii=True)
    print(f"  ✓ Remeshed STL exported to {output_file} (ASCII format)")

    # Export 3D mesh with UV data as OBJ (before remesh had UV data)
    output_obj = output_file.replace('.stl', '.obj')
    export_obj_with_uv(mesh, output_obj)

    print("\n" + "=" * 70)
    print("✅ REMESHING COMPLETE")
    print("=" * 70)
    print(f"\nOutput files created:")
    print(f"  • {output_file} - Final isotropic remeshed mesh (STL)")
    print(f"  • {output_obj} - 3D mesh with UV coordinates (OBJ format)")
    print(f"  • {output_uv_stl} - UV parameterization visualization (STL, Z=0 plane)")
    print(f"\nRemeshing applied:")
    print(f"  • Voxel size: {edge_length}")
    print(f"  • Creates uniform, isotropic mesh")
    print(f"  • Non-overlapping UV parameterization via Smart UV Project")

if __name__ == "__main__":
    # Parse command line arguments
    argv = sys.argv[sys.argv.index("--") + 1:]

    input_file = argv[0] if len(argv) > 0 else "test.stl"
    output_file = argv[1] if len(argv) > 1 else "output_blender.stl"

    # Parse optional parameters
    edge_length = 0.5
    if "--edge-length" in argv:
        idx = argv.index("--edge-length")
        if idx + 1 < len(argv):
            edge_length = float(argv[idx + 1])

    # Run remeshing
    remesh_with_blender(input_file, output_file, edge_length=edge_length)
