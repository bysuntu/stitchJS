// Rendering priority configuration
// Higher renderOrder values are rendered on top
// Polygon offset: more negative values push elements closer to camera

export const RENDER_ORDER = {
  // Base mesh - lowest priority
  MESH: 0,

  // Wireframe - third priority
  WIREFRAME: 3,

  // Polylines group - second highest priority
  POLYLINE_BASE: 4,
  POLYLINE_LINE: 5,      // POLYLINE_BASE + 1
  POLYLINE_FACETS: 6,    // POLYLINE_BASE + 2

  // Corners - highest priority when enabled
  CORNERS: 100,
};

export const POLYGON_OFFSET = {
  // Base mesh
  MESH: {
    factor: 0,
    units: 0,
  },

  // Wireframe
  WIREFRAME: {
    factor: -1,
    units: -1,
  },

  // Polylines
  POLYLINE_LINE: {
    factor: -5,
    units: -5,
  },

  // Highlighted cells/facets
  POLYLINE_FACETS: {
    factor: -8,
    units: -8,
  },

  // Corners
  CORNERS: {
    factor: -10,
    units: -10,
  },
};

// Geometry processing tolerances
export const GEOMETRY_TOLERANCES = {
  // Minimum triangle area threshold
  // Triangles with area below this are considered degenerate and removed
  MIN_TRIANGLE_AREA: 1e-8,

  // Point merging tolerance for exact duplicates (zero tolerance)
  DUPLICATE_POINT_TOLERANCE: 0,

  // Point merging tolerance for nearby points (proximity-based merging)
  PROXIMITY_TOLERANCE: 1e-5,

  // Minimum edge length for valid triangles
  MIN_EDGE_LENGTH: 1e-6,

  // Collinearity threshold (cosine of angle between edges)
  // If dot product of normalized edges is close to ±1, points are collinear
  COLLINEARITY_THRESHOLD: 0.9999,

  // Distance tolerance for determining if two polylines are close
  POLYLINE_DISTANCE_TOLERANCE: 0.0001,
};

// Default colors for visualization elements
export const DEFAULT_COLORS = {
  MESH: '#808080',        // Gray
  BOUNDARY: '#ff0000',    // Red
  CORNER: '#00ff00',      // Green
  POLYLINE: '#ffff00',    // Yellow
  WIREFRAME: '#ffffff',   // White
};
