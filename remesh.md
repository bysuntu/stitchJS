# Blender Remesh Advanced - Documentation

Advanced STL remeshing tool using Blender's remesh modifiers with sharp edge preservation.

## Overview

`blender_remesh_advanced.py` provides high-quality mesh remeshing with features including:
- VOXEL and SHARP remesh modes
- Automatic sharp edge detection and preservation
- Iterative smoothing with edge locking
- Surface projection for exact geometry preservation
- Multi-part STL support with named solids

## Basic Usage

```bash
blender --background --python blender_remesh_advanced.py -- \
  input.stl output.stl \
  --edge-length 0.025 \
  --mode SHARP
```

## Command-Line Arguments

### Required Arguments

| Argument | Description |
|----------|-------------|
| `input_file` | Input STL file path |
| `output_file` | Output STL file path |

### Remeshing Parameters

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--edge-length` | float | 0.01 | Target edge length for remeshing (voxel size) |
| `--mode` | choice | VOXEL | Remesh mode: `VOXEL` (smooth) or `SHARP` (preserves edges) |
| `--sharpness` | float | 1.0 | Edge preservation strength for SHARP mode (0-1, higher = sharper) |
| `--smoothing` | int | 2 | Number of smoothing iterations after remeshing |

### Sharp Edge Preservation

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--preserve-sharp` | flag | - | Automatically detect and mark sharp edges before remeshing |
| `--feature-angle` | float | 30.0 | Angle threshold (degrees) for detecting sharp edges |
| `--snap-threshold` | float | 0.1 | Maximum distance for snapping vertices to sharp edges |

**Note:** When `--preserve-sharp` is enabled, `--snap-sharp-edges` is automatically activated.

### Surface Preservation

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--project-to-original` | flag | - | Project remeshed surface back to original using shrinkwrap |

### Multi-Part Support

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--preserve-partitions` | flag | - | Preserve separate named solids, remeshing each independently |

## How It Works

### Workflow Overview

```
1. Import STL
2. Detect feature edges (if --preserve-sharp)
3. Store sharp edge positions
4. Apply remesh (VOXEL or SHARP mode)
5. Project to original surface (if enabled)
6. Smooth with iterative edge snapping
7. Export STL
```

### Key Features

#### 1. SHARP Mode Remeshing

SHARP mode creates new mesh topology while attempting to preserve sharp features:

```bash
--mode SHARP \
--sharpness 1.0 \      # Maximum edge preservation
--edge-length 0.025    # Target edge size
```

**Sharpness parameter (0-1):**
- `1.0` - Maximum edge preservation (recommended for mechanical parts)
- `0.5` - Moderate preservation
- `0.0` - Minimal preservation (similar to VOXEL)

#### 2. Feature Angle Detection

Automatically detects sharp edges based on the angle between adjacent faces:

```bash
--preserve-sharp \
--feature-angle 30.0   # Edges with angle > 30° are marked as sharp
```

**Feature angle guide:**
- `15-20°` - Sensitive (detects subtle features)
- `30-45°` - Standard (good for most mechanical parts)
- `60-90°` - Aggressive (only very sharp corners)

**Output example:**
```
Feature edges: 190/2862 (6.6%) at angle > 30.0°
Detected 190/2862 sharp edges (6.6%) with feature angle > 30.0°
```

#### 3. Snap Sharp Edges

After remeshing, snaps vertices near sharp edges back to their exact original positions:

```bash
--preserve-sharp \         # Auto-enables snap-sharp-edges
--snap-threshold 0.1       # Snap vertices within 0.1 units of edges
```

**Snap threshold guide:**
- `0.05` - Tight snapping (fewer vertices affected)
- `0.1` - Standard (recommended)
- `0.2` - Loose snapping (more vertices affected, may distort geometry)

**Output example:**
```
Stored 190 sharp edges with 380 unique vertices
✓ Snapped 156/5048 vertices (3.1%) to sharp edges
  → Average snap distance: 0.023456 units
  → Maximum displacement: 0.089123 units
```

#### 4. Iterative Smoothing with Edge Locking

When both `--smoothing` and `--preserve-sharp` are enabled, the script performs iterative (smooth → snap) cycles:

```bash
--smoothing 5 \            # 5 iterations
--preserve-sharp           # Auto-enables iterative mode
```

**Process:**
```
Iteration 1: Smooth mesh → Snap edges back to original
Iteration 2: Smooth mesh → Snap edges back to original
...
Iteration N: Smooth mesh → Snap edges back to original
```

**Output example:**
```
Applying 5 smoothing iterations with iterative edge snapping...
  [Iteration 1/5] Smoothing + snapping...
  [Iteration 2/5] Smoothing + snapping...
  ...
✓ Completed 5 iterative smooth+snap cycles
```

**Benefits:**
- Edges stay sharp throughout all smoothing iterations
- Better convergence than smooth-then-snap
- Smooth surfaces everywhere except at marked edges

#### 5. Project to Original

Projects all remeshed vertices back to the exact original surface:

```bash
--project-to-original
```

**Use cases:**
- Preserving exact surface geometry while improving topology
- Combining with smoothing for quality improvement
- Ensuring dimensional accuracy

**Order of operations:**
```
1. Remesh (new topology)
2. Project to original (exact surface)
3. Smoothing (with iterative snapping if enabled)
```

## Usage Examples

### Example 1: Basic Remeshing

Simple remeshing without edge preservation:

```bash
blender --background --python blender_remesh_advanced.py -- \
  input.stl output.stl \
  --edge-length 0.025 \
  --mode VOXEL
```

### Example 2: Mechanical Parts with Sharp Edges

Best settings for mechanical parts with hard edges:

```bash
blender --background --python blender_remesh_advanced.py -- \
  input.stl output.stl \
  --mode SHARP \
  --edge-length 0.01 \
  --sharpness 1.0 \
  --preserve-sharp \
  --feature-angle 30.0 \
  --project-to-original \
  --smoothing 2
```

**What this does:**
- SHARP mode preserves features during remeshing
- Detects edges with angle > 30°
- Projects to exact original surface
- Smooths 2 iterations while keeping edges locked

### Example 3: High-Quality Surface with Edge Preservation

For best surface quality while maintaining sharp edges:

```bash
blender --background --python blender_remesh_advanced.py -- \
  input.stl output.stl \
  --mode SHARP \
  --edge-length 0.01 \
  --sharpness 1.0 \
  --preserve-sharp \
  --feature-angle 30.0 \
  --snap-threshold 0.05 \
  --project-to-original \
  --smoothing 5
```

**What this does:**
- Tight snap threshold (0.05) for precise edge preservation
- 5 smoothing iterations for very smooth surfaces
- Iterative snapping keeps edges sharp throughout smoothing

### Example 4: Coarse Remeshing

For quick preview or low-poly output:

```bash
blender --background --python blender_remesh_advanced.py -- \
  input.stl output.stl \
  --edge-length 0.1 \
  --mode VOXEL \
  --smoothing 0
```

### Example 5: Multi-Part Assembly

For STL files with multiple named solids:

```bash
blender --background --python blender_remesh_advanced.py -- \
  assembly.stl output.stl \
  --mode SHARP \
  --edge-length 0.02 \
  --preserve-partitions \
  --preserve-sharp \
  --feature-angle 30.0
```

**What this does:**
- Remeshes each named solid independently
- Preserves solid names in output STL
- Applies edge preservation to each part

### Example 6: Sensitive Feature Detection

For parts with subtle features:

```bash
blender --background --python blender_remesh_advanced.py -- \
  input.stl output.stl \
  --mode SHARP \
  --edge-length 0.01 \
  --preserve-sharp \
  --feature-angle 15.0 \
  --snap-threshold 0.05
```

**What this does:**
- Lower feature angle (15°) detects more edges
- Tight snap threshold preserves fine details

## Parameter Tuning Guide

### Edge Length

Controls the target size of triangles in the output mesh:

| Value | Result | Use Case |
|-------|--------|----------|
| 0.001-0.005 | Very fine | High-detail models, small parts |
| 0.01-0.02 | Standard | Most mechanical parts |
| 0.05-0.1 | Coarse | Preview, low-poly models |

**Tip:** Smaller edge length = more triangles = longer processing time

### Sharpness (SHARP mode only)

Controls how aggressively SHARP mode preserves edges:

| Value | Edge Preservation | Vertex Density Near Edges |
|-------|------------------|--------------------------|
| 1.0 | Maximum | Very high |
| 0.7-0.8 | High | High |
| 0.5 | Moderate | Medium |
| 0.3 | Low | Low |

**Tip:** Always use 1.0 with `--preserve-sharp` for best results

### Feature Angle

Determines which edges are considered "sharp":

| Angle | Edges Detected | Best For |
|-------|----------------|----------|
| 10-15° | Many (subtle features) | Detailed models, fillets |
| 30-45° | Moderate (standard edges) | Mechanical parts, boxes |
| 60-90° | Few (very sharp only) | Simple shapes, hard corners |

**Tip:** Check the "Feature edges" output to see what percentage gets detected

### Snap Threshold

Controls how far vertices can be from an edge to get snapped:

| Value | Vertices Snapped | Quality Trade-off |
|-------|-----------------|-------------------|
| 0.05 | Fewer (precise) | Best quality, may miss some edges |
| 0.1 | Moderate | Balanced (recommended) |
| 0.2 | Many (loose) | May distort nearby geometry |

**Tip:** Use 2-3× your edge-length value

### Smoothing Iterations

Number of smoothing passes:

| Iterations | Surface Quality | Edge Preservation |
|-----------|----------------|-------------------|
| 0 | No smoothing | Edges preserved |
| 1-2 | Light smoothing | Good edge preservation |
| 3-5 | Moderate smoothing | Edges preserved via iterative snapping |
| 5+ | Heavy smoothing | Very smooth with locked edges |

**Tip:** With `--preserve-sharp`, smoothing won't affect edge sharpness due to iterative snapping

## Output Information

The script provides detailed progress information:

```
Processing part 1/1: model_name
  Input mesh: 956 vertices, 2862 edges, 1908 faces
  Feature edges: 190/2862 (6.6%) at angle > 30.0°
  Creating copy of original mesh for projection...
  Detecting sharp edges by feature angle...
  Detected 190/2862 sharp edges (6.6%) with feature angle > 30.0°
  [SNAP-SHARP-EDGES ENABLED] Will preserve exact edge positions
  Stored 190 sharp edges with 380 unique vertices
  Applying SHARP remesh with edge length 0.025...
  Using octree depth: 5
  Projecting remeshed surface back to original...
  Applying 2 smoothing iterations with iterative edge snapping...
    [Iteration 1/2] Smoothing + snapping...
    [Iteration 2/2] Smoothing + snapping...
  ✓ Completed 2 iterative smooth+snap cycles
  Output mesh: 5048 vertices, 10092 edges, 5046 faces
```

## Best Practices

### For Mechanical Parts

```bash
--mode SHARP \
--sharpness 1.0 \
--preserve-sharp \
--feature-angle 30.0 \
--project-to-original \
--smoothing 2
```

### For Organic Shapes

```bash
--mode VOXEL \
--edge-length 0.02 \
--project-to-original \
--smoothing 3
```

### For Maximum Quality

```bash
--mode SHARP \
--edge-length 0.01 \       # Fine detail
--sharpness 1.0 \
--preserve-sharp \
--feature-angle 25.0 \
--snap-threshold 0.05 \    # Precise snapping
--project-to-original \
--smoothing 5              # Very smooth surfaces
```

### For Speed

```bash
--mode VOXEL \
--edge-length 0.05 \       # Coarser mesh
--smoothing 0              # Skip smoothing
```

## Troubleshooting

### No edges being preserved

**Problem:** "Detected 0/2862 sharp edges (0.0%)"

**Solution:** Lower the feature angle
```bash
--feature-angle 15.0  # Try lower value
```

### Too many edges detected

**Problem:** "Detected 2500/2862 sharp edges (87.4%)"

**Solution:** Increase the feature angle
```bash
--feature-angle 45.0  # Try higher value
```

### Edges not sharp enough

**Solutions:**
1. Increase sharpness: `--sharpness 1.0`
2. Tighten snap threshold: `--snap-threshold 0.05`
3. Enable project-to-original: `--project-to-original`

### Mesh too coarse/fine

**Solution:** Adjust edge-length
```bash
--edge-length 0.005  # Finer
--edge-length 0.05   # Coarser
```

### Processing too slow

**Solutions:**
1. Increase edge-length: `--edge-length 0.05`
2. Reduce smoothing: `--smoothing 1`
3. Use VOXEL mode: `--mode VOXEL`

## Technical Details

### Remesh Modes

**VOXEL Mode:**
- Creates uniform voxel grid
- Loses sharp edges naturally
- Fast and simple
- Use with `--project-to-original` for accuracy

**SHARP Mode:**
- Detects sharp features geometrically
- Creates non-uniform mesh with denser vertices at edges
- Octree depth calculated automatically from edge-length
- Best combined with `--preserve-sharp`

### Snap Sharp Edges Algorithm

1. Before remeshing: Store positions of all vertices on sharp edges
2. After remeshing: For each vertex in new mesh:
   - Find nearest point on any original sharp edge
   - If distance < snap-threshold, move vertex to that point
3. Result: New topology with exact original edge positions

### Iterative Smoothing

When both `--smoothing > 0` and `--preserve-sharp` are enabled:
- Standard: smooth^n → snap (edges can drift)
- Iterative: (smooth → snap)^n (edges locked at each step)

This prevents edge degradation during smoothing.

## Version History

- Initial version with VOXEL/SHARP remeshing
- Added feature angle detection
- Added snap-sharp-edges with automatic enablement
- Added iterative smoothing mode
- Removed non-working UV-based remeshing

## Requirements

- Blender 3.0+ (tested with 4.4.3)
- Python 3.x (included with Blender)
- Input: ASCII or Binary STL files
- Output: ASCII STL format

## License

Part of stitchJS project.
