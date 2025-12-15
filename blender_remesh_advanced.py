import bpy
import sys
import argparse
import os
import tempfile
import re

def parse_stl_solids(filepath):
    """Parse ASCII STL file and extract individual solids with their names."""
    solids = []
    current_solid = None
    current_content = []

    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if line.startswith('solid'):
                # Extract solid name (everything after 'solid ')
                solid_name = line[6:].strip() if len(line) > 6 else f"solid_{len(solids)}"
                current_solid = solid_name
                current_content = [line + '\n']
            elif line.startswith('endsolid'):
                current_content.append(line + '\n')
                if current_solid is not None:
                    solids.append({
                        'name': current_solid,
                        'content': ''.join(current_content)
                    })
                current_solid = None
                current_content = []
            elif current_solid is not None:
                current_content.append(line + '\n')

    return solids

def write_stl_with_solids(filepath, objects_with_names):
    """Export multiple objects to STL file with named solids."""
    with open(filepath, 'w') as f:
        for obj_name, solid_name in objects_with_names:
            obj = bpy.data.objects.get(obj_name)
            if obj is None:
                print(f"  WARNING: Object '{obj_name}' not found, skipping...")
                continue

            # Write solid header
            f.write(f"solid {solid_name}\n")

            # Get mesh data
            mesh = obj.data
            mesh.calc_loop_triangles()

            tri_count = len(mesh.loop_triangles)
            print(f"  Writing {tri_count} triangles for '{solid_name}'...")

            # Write each triangle
            for tri in mesh.loop_triangles:
                normal = tri.normal
                f.write(f"  facet normal {normal.x} {normal.y} {normal.z}\n")
                f.write(f"    outer loop\n")
                for loop_index in tri.loops:
                    vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
                    v = vertex.co
                    f.write(f"      vertex {v.x} {v.y} {v.z}\n")
                f.write(f"    endloop\n")
                f.write(f"  endfacet\n")

            # Write solid footer
            f.write(f"endsolid {solid_name}\n")

# Parse arguments after the -- separator
argv = sys.argv
argv = argv[argv.index("--") + 1:]  # Get everything after --

parser = argparse.ArgumentParser()
parser.add_argument("input_file", help="Input STL file path")
parser.add_argument("output_file", help="Output STL file path")
parser.add_argument("--edge-length", type=float, default=0.01, help="Target edge length for remeshing")
parser.add_argument("--mode", type=str, default='VOXEL', choices=['VOXEL', 'SHARP'],
                    help="Remesh mode: VOXEL (smooth, loses edges) or SHARP (preserves edges)")
parser.add_argument("--sharpness", type=float, default=1.0, help="Sharpness for SHARP mode (0-1)")
parser.add_argument("--iterations", type=int, default=3, help="Number of remesh iterations")
parser.add_argument("--smoothing", type=int, default=2, help="Number of smoothing iterations")
parser.add_argument("--preserve-sharp", action='store_true', help="Mark sharp edges before remeshing")
parser.add_argument("--preserve-partitions", action='store_true',
                    help="Preserve separate solids by name, remeshing each independently")

args = parser.parse_args(argv)

# Clear existing mesh objects
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Check if we need to preserve named solids
all_parts = []
objects_with_names = []  # List of (object_name, solid_name) tuples

if args.preserve_partitions:
    print(f"Parsing STL file to extract named solids...")
    solids = parse_stl_solids(args.input_file)
    print(f"Found {len(solids)} named solid(s)")

    if len(solids) > 1:
        # Import each solid separately
        temp_dir = tempfile.mkdtemp()

        for i, solid in enumerate(solids):
            # Create temporary STL file for this solid
            temp_stl = os.path.join(temp_dir, f"solid_{i}.stl")
            with open(temp_stl, 'w') as f:
                f.write(solid['content'])

            # Import this solid
            print(f"  Importing solid '{solid['name']}'...")
            bpy.ops.wm.stl_import(filepath=temp_stl)

            # Get the imported object and rename it
            if len(bpy.context.selected_objects) > 0:
                obj = bpy.context.selected_objects[0]
                obj.name = f"solid_{i}_{solid['name']}"
                all_parts.append(obj)
                objects_with_names.append((obj.name, solid['name']))

            # Clean up temp file
            os.remove(temp_stl)

        # Clean up temp directory
        os.rmdir(temp_dir)
    else:
        # Only one solid, import normally
        print(f"Importing {args.input_file}...")
        bpy.ops.wm.stl_import(filepath=args.input_file)
        imported_objects = bpy.context.selected_objects[:]
        all_parts = imported_objects
        if len(solids) > 0:
            objects_with_names = [(obj.name, solids[0]['name']) for obj in all_parts]
else:
    # Import normally without preserving solid names
    print(f"Importing {args.input_file}...")
    bpy.ops.wm.stl_import(filepath=args.input_file)
    imported_objects = bpy.context.selected_objects[:]

    # Join all imported objects into one
    if len(imported_objects) > 1:
        bpy.context.view_layer.objects.active = imported_objects[0]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in imported_objects:
            obj.select_set(True)
        bpy.ops.object.join()
    all_parts = [bpy.context.view_layer.objects.active]

# Process each part
for i, obj in enumerate(all_parts):
    bpy.context.view_layer.objects.active = obj
    print(f"\nProcessing part {i+1}/{len(all_parts)}: {obj.name}")

    # Mark sharp edges if requested
    if args.preserve_sharp:
        print("  Marking sharp edges...")
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.mark_sharp()
        bpy.ops.object.mode_set(mode='OBJECT')

    # Apply remesh modifier
    print(f"  Applying {args.mode} remesh with edge length {args.edge_length}...")
    remesh = obj.modifiers.new(name="Remesh", type='REMESH')
    remesh.mode = args.mode

    if args.mode == 'VOXEL':
        remesh.voxel_size = args.edge_length
        remesh.use_smooth_shade = True
    elif args.mode == 'SHARP':
        # Octree depth: smaller edge_length = higher depth (range 1-10)
        import math
        remesh.octree_depth = max(1, min(10, int(-math.log2(args.edge_length))))
        remesh.sharpness = args.sharpness
        remesh.use_smooth_shade = False
        print(f"  Using octree depth: {remesh.octree_depth}")

    # Apply the modifier
    bpy.ops.object.modifier_apply(modifier="Remesh")

    # Optional smoothing
    if args.smoothing > 0:
        print(f"  Applying {args.smoothing} smoothing iterations...")
        smooth = obj.modifiers.new(name="Smooth", type='SMOOTH')
        smooth.iterations = args.smoothing
        bpy.ops.object.modifier_apply(modifier="Smooth")

# Export STL
print(f"\nExporting to {args.output_file}...")

if args.preserve_partitions and len(objects_with_names) > 0:
    # Export with preserved solid names
    print(f"Preserving {len(objects_with_names)} named solid(s)...")
    write_stl_with_solids(args.output_file, objects_with_names)
else:
    # Export normally
    bpy.ops.object.select_all(action='DESELECT')
    for obj in all_parts:
        obj.select_set(True)
    bpy.ops.wm.stl_export(filepath=args.output_file)

print("Remeshing complete!")
