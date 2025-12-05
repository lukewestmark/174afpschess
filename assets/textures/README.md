# Texture Assets Guide

This directory contains textures for the FPS Chess battle arena. Follow the instructions below to obtain and install the required textures.

## Required Textures

You need to download 3 sets of PBR textures:

### 1. Grass Textures (for arena floor)
**Location**: `grass/` folder
**Required files**:
- `grass_diffuse.jpg` - Color/albedo map
- `grass_normal.png` - Normal map (for bump detail)
- `grass_roughness.png` - Roughness map

### 2. Wall Textures (for arena walls)
**Location**: `wall/` folder
**Required files**:
- `wall_diffuse.jpg` - Color/albedo map
- `wall_normal.png` - Normal map (for gritty industrial detail)
- `wall_roughness.png` - Roughness map

### 3. Metal Textures (for cover boxes)
**Location**: `metal/` folder
**Required files**:
- `metal_diffuse.jpg` - Color/albedo map
- `metal_normal.png` - Normal map
- `metal_roughness.png` - Roughness map

## Where to Get Textures (Free Sources)

### Option 1: Poly Haven (Recommended)
Website: https://polyhaven.com/textures

1. **For Grass**:
   - Search: "grass" or "lawn"
   - Recommended: "Green Grass" or "Short Grass"
   - Download: 1K or 2K resolution
   - Download maps: Diffuse, Normal, Roughness

2. **For Walls**:
   - Search: "concrete" or "industrial"
   - Recommended: "Concrete Floor" or "Concrete Wall"
   - Download: 1K or 2K resolution
   - Download maps: Diffuse, Normal, Roughness

3. **For Metal**:
   - Search: "metal" or "steel"
   - Recommended: "Rusted Metal" or "Metal Plate"
   - Download: 1K resolution
   - Download maps: Diffuse, Normal, Roughness

### Option 2: ambientCG
Website: https://ambientcg.com

- Similar to Poly Haven
- All textures are CC0 (public domain)
- Search and download the same types of textures

## How to Install Textures

1. Download your chosen textures from Poly Haven or ambientCG
2. Rename the files according to the naming convention:
   - Color/Albedo maps → `*_diffuse.jpg`
   - Normal maps → `*_normal.png`
   - Roughness maps → `*_roughness.png`
3. Place them in the correct folders:
   ```
   assets/textures/
   ├── grass/
   │   ├── grass_diffuse.jpg
   │   ├── grass_normal.png
   │   └── grass_roughness.png
   ├── wall/
   │   ├── wall_diffuse.jpg
   │   ├── wall_normal.png
   │   └── wall_roughness.png
   └── metal/
       ├── metal_diffuse.jpg
       ├── metal_normal.png
       └── metal_roughness.png
   ```

## File Requirements

- **Format**: JPG for diffuse maps, PNG for normal/roughness maps
- **Resolution**: 1024x1024 (1K) minimum, 2048x2048 (2K) recommended
- **Aspect Ratio**: 1:1 (square textures)
- **File Size**: Keep under 2MB per texture for best performance

## Testing

After adding textures:

1. Start the development server: `npm run dev`
2. Navigate to the chess game
3. Start a battle (capture an opponent's piece)
4. Check the browser console for texture loading messages:
   - "Texture loaded: /assets/textures/grass/grass_diffuse.jpg"
   - "Grass floor textures applied"
   - "Wall textures applied to all 4 walls"
   - "Metal textures applied to cover boxes"

## Fallback Behavior

If textures fail to load or are missing:
- The arena will still render with solid colors
- Floor: dark grey
- Walls: medium grey (opaque)
- Cover boxes: dark grey
- Check browser console for error messages

## Adjusting Texture Appearance

If you want to adjust how textures look after installation, edit `battle.js`:

### Texture Tiling (size of texture pattern)
- **Grass**: Line ~224: `texture.repeat.set(4, 4)` - adjust 4 to 2-6
- **Walls**: Lines ~325, ~330: `texture.repeat.set(10, 2.5)` - adjust as needed
- **Metal**: Line ~401: `texture.repeat.set(1, 1)` - adjust as needed

### Normal Map Strength (bump intensity)
- **Grass**: Line ~235: `normalScale: (0.5, 0.5)` - adjust 0.3-1.0
- **Walls**: Line ~341: `normalScale: (1.0, 1.0)` - adjust 0.8-1.5
- **Metal**: Line ~411: `normalScale: (0.8, 0.8)` - adjust 0.6-1.0

## License Note

When using textures from Poly Haven or ambientCG:
- All textures are CC0 (public domain)
- No attribution required
- Free for any use (commercial or personal)
