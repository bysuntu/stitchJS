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

def mark_sharp_edges_by_angle(obj, angle_threshold=30.0):
    """
    Automatically detect and mark sharp edges based on the angle between adjacent faces.

    Args:
        obj: Blender object
        angle_threshold: Angle in degrees - edges with angles greater than this are marked sharp
    """
    import math

    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')

    # Use Blender's built-in edge angle selection
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(angle_threshold))

    # Mark selected edges as sharp
    bpy.ops.mesh.mark_sharp()

    # Get count of marked edges for reporting
    bpy.ops.object.mode_set(mode='OBJECT')
    total_edges = len(obj.data.edges)
    sharp_edge_count = sum(1 for edge in obj.data.edges if edge.use_edge_sharp)
    percentage = (sharp_edge_count / total_edges * 100) if total_edges > 0 else 0

    print(f"  Detected {sharp_edge_count}/{total_edges} sharp edges ({percentage:.1f}%) with feature angle > {angle_threshold}°")

def store_sharp_edge_data(obj):
    """
    Store vertex positions and edge connectivity for all sharp edges.
    Returns a dictionary with edge data for later snapping.
    """
    mesh = obj.data
    sharp_edge_data = {
        'vertices': {},  # vertex_index: world_position
        'edges': []      # list of (v1_pos, v2_pos) tuples
    }

    # Get world matrix for transforming to world space
    matrix_world = obj.matrix_world

    for edge in mesh.edges:
        if edge.use_edge_sharp:
            # Get vertex indices
            v1_idx, v2_idx = edge.vertices[0], edge.vertices[1]

            # Get world space positions
            v1_pos = matrix_world @ mesh.vertices[v1_idx].co
            v2_pos = matrix_world @ mesh.vertices[v2_idx].co

            # Store vertex positions
            sharp_edge_data['vertices'][v1_idx] = v1_pos.copy()
            sharp_edge_data['vertices'][v2_idx] = v2_pos.copy()

            # Store edge as line segment
            sharp_edge_data['edges'].append((v1_pos.copy(), v2_pos.copy()))

    print(f"  Stored {len(sharp_edge_data['edges'])} sharp edges with {len(sharp_edge_data['vertices'])} unique vertices")
    return sharp_edge_data

def snap_to_sharp_edges(obj, sharp_edge_data, threshold=0.1, quiet=False):
    """
    Snap vertices in the remeshed object back to the nearest point on original sharp edges.

    Args:
        obj: Remeshed Blender object
        sharp_edge_data: Dictionary with original sharp edge data
        threshold: Maximum distance for snapping
        quiet: If True, suppress detailed output (for iterative mode)
    """
    from mathutils import Vector
    from mathutils.geometry import intersect_point_line

    mesh = obj.data
    matrix_world = obj.matrix_world
    matrix_world_inv = matrix_world.inverted()

    snapped_count = 0
    snap_distances = []
    total_displacement = 0.0
    max_displacement = 0.0

    # For each vertex in the remeshed mesh
    for vert in mesh.vertices:
        vert_world = matrix_world @ vert.co
        min_dist = float('inf')
        snap_pos = None

        # Find nearest point on any sharp edge
        for edge_v1, edge_v2 in sharp_edge_data['edges']:
            # Find closest point on line segment
            closest_point, _ = intersect_point_line(vert_world, edge_v1, edge_v2)

            # Clamp to line segment (not infinite line)
            edge_vec = edge_v2 - edge_v1
            edge_len = edge_vec.length
            if edge_len > 0:
                t = (closest_point - edge_v1).dot(edge_vec) / (edge_len * edge_len)
                t = max(0.0, min(1.0, t))  # Clamp to [0, 1]
                closest_point = edge_v1 + t * edge_vec

            dist = (vert_world - closest_point).length

            if dist < min_dist:
                min_dist = dist
                snap_pos = closest_point

        # Snap if within threshold
        if min_dist < threshold and snap_pos is not None:
            old_pos = vert.co.copy()
            vert.co = matrix_world_inv @ snap_pos

            # Calculate actual displacement
            displacement = (vert.co - old_pos).length
            snap_distances.append(min_dist)
            total_displacement += displacement
            max_displacement = max(max_displacement, displacement)
            snapped_count += 1

    mesh.update()

    # Report detailed statistics
    if not quiet:
        percentage = (snapped_count / len(mesh.vertices) * 100) if len(mesh.vertices) > 0 else 0
        print(f"  ✓ Snapped {snapped_count}/{len(mesh.vertices)} vertices ({percentage:.1f}%) to sharp edges")

        if snapped_count > 0:
            avg_distance = sum(snap_distances) / len(snap_distances)
            avg_displacement = total_displacement / snapped_count
            print(f"    → Average snap distance: {avg_distance:.6f} units")
            print(f"    → Average displacement: {avg_displacement:.6f} units")
            print(f"    → Maximum displacement: {max_displacement:.6f} units")
            print(f"    → Snap threshold: {threshold} units")
        else:
            print(f"    ⚠ No vertices within threshold ({threshold} units) of sharp edges")

    return snapped_count  # Return count for iterative mode tracking

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
parser.add_argument("--feature-angle", type=float, default=30.0,
                    help="Feature angle in degrees for detecting sharp edges (default: 30)")
parser.add_argument("--snap-sharp-edges", action='store_true',
                    help="Snap remeshed vertices back to original sharp edge positions (requires --preserve-sharp)")
parser.add_argument("--snap-threshold", type=float, default=0.1,
                    help="Distance threshold for snapping vertices to sharp edges (default: 0.1)")
parser.add_argument("--preserve-partitions", action='store_true',
                    help="Preserve separate solids by name, remeshing each independently")
parser.add_argument("--project-to-original", action='store_true',
                    help="Project remeshed surface back to original using shrinkwrap")

args = parser.parse_args(argv)

# Validate arguments
# Auto-enable snap-sharp-edges when preserve-sharp is enabled
if args.preserve_sharp and not args.snap_sharp_edges:
    args.snap_sharp_edges = True
    print(f"Auto-enabling --snap-sharp-edges (threshold={args.snap_threshold})")

if args.snap_sharp_edges and not args.preserve_sharp:
    print("WARNING: --snap-sharp-edges requires --preserve-sharp to be enabled")
    print("         Sharp edges must be marked before they can be snapped")
    print("         Disabling --snap-sharp-edges")
    args.snap_sharp_edges = False

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
remeshed_parts = []
for i, obj in enumerate(all_parts):
    bpy.context.view_layer.objects.active = obj
    print(f"\nProcessing part {i+1}/{len(all_parts)}: {obj.name}")

    # Show mesh statistics
    mesh = obj.data
    print(f"  Input mesh: {len(mesh.vertices)} vertices, {len(mesh.edges)} edges, {len(mesh.polygons)} faces")

    # Always show feature edge count for reference
    import math
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(args.feature_angle))
    bpy.ops.object.mode_set(mode='OBJECT')
    feature_edge_count = sum(1 for edge in mesh.edges if edge.select)
    feature_percentage = (feature_edge_count / len(mesh.edges) * 100) if len(mesh.edges) > 0 else 0
    print(f"  Feature edges: {feature_edge_count}/{len(mesh.edges)} ({feature_percentage:.1f}%) at angle > {args.feature_angle}°")

    # Deselect all edges
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')

    # Keep copy of original for projection
    original_mesh = None
    if args.project_to_original:
        print("  Creating copy of original mesh for projection...")
        original_mesh = obj.copy()
        original_mesh.data = obj.data.copy()
        original_mesh.name = f"{obj.name}_original"
        bpy.context.collection.objects.link(original_mesh)

    # Mark sharp edges if requested
    sharp_edge_data = None
    if args.preserve_sharp:
        print(f"  Detecting sharp edges by feature angle...")
        mark_sharp_edges_by_angle(obj, angle_threshold=args.feature_angle)

        # Store sharp edge data for snapping if requested
        if args.snap_sharp_edges:
            print(f"  [SNAP-SHARP-EDGES ENABLED] Will preserve exact edge positions")
            sharp_edge_data = store_sharp_edge_data(obj)

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

    # Project back to original surface if requested
    if args.project_to_original and original_mesh is not None:
        print("  Projecting remeshed surface back to original...")
        shrinkwrap = obj.modifiers.new(name="Shrinkwrap", type='SHRINKWRAP')
        shrinkwrap.target = original_mesh
        shrinkwrap.wrap_method = 'PROJECT'
        shrinkwrap.use_project_x = True
        shrinkwrap.use_project_y = True
        shrinkwrap.use_project_z = True
        shrinkwrap.use_negative_direction = True
        shrinkwrap.use_positive_direction = True
        bpy.ops.object.modifier_apply(modifier="Shrinkwrap")

        # Clean up original mesh copy
        bpy.data.objects.remove(original_mesh, do_unlink=True)

    # Optional smoothing with iterative snap
    if args.smoothing > 0:
        # If snap-sharp-edges is enabled, do iterative (smooth, snap) × n
        if args.snap_sharp_edges and sharp_edge_data is not None:
            print(f"  Applying {args.smoothing} smoothing iterations with iterative edge snapping...")
            for iteration in range(args.smoothing):
                # Apply one smoothing iteration
                smooth = obj.modifiers.new(name="Smooth", type='SMOOTH')
                smooth.iterations = 1
                bpy.ops.object.modifier_apply(modifier="Smooth")

                # Snap edges back after each smooth
                print(f"    [Iteration {iteration + 1}/{args.smoothing}] Smoothing + snapping...")
                snap_to_sharp_edges(obj, sharp_edge_data, threshold=args.snap_threshold, quiet=True)

            print(f"  ✓ Completed {args.smoothing} iterative smooth+snap cycles")
        else:
            # Standard smoothing without snap
            print(f"  Applying {args.smoothing} smoothing iterations...")
            smooth = obj.modifiers.new(name="Smooth", type='SMOOTH')
            smooth.iterations = args.smoothing
            bpy.ops.object.modifier_apply(modifier="Smooth")

    # Final snap to sharp edges if not using iterative mode
    elif args.snap_sharp_edges and sharp_edge_data is not None:
        print(f"  Snapping vertices to original sharp edges...")
        snap_to_sharp_edges(obj, sharp_edge_data, threshold=args.snap_threshold)

    # Show output mesh statistics
    mesh = obj.data
    print(f"  Output mesh: {len(mesh.vertices)} vertices, {len(mesh.edges)} edges, {len(mesh.polygons)} faces")

    remeshed_parts.append(obj)

# Update all_parts to use remeshed objects
all_parts = remeshed_parts

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
