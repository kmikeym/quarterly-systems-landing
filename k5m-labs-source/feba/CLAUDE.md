# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Game Overview

**FEBA (Forward Edge of Battle Area)** is a tactical wargaming simulator built as a single-file HTML5 game with no external dependencies. It features hex-grid-based tactical combat with fog of war, autonomous drones, and AI-controlled units.

## Architecture

**Single File**: `FEBA.html` - Complete game in one self-contained HTML file
**Size**: ~59KB
**Dependencies**: None - pure vanilla JavaScript, HTML, CSS
**Deployment**: Copy to `public/labs/feba/index.html` for web hosting

## Game Mechanics

### Core Systems

**Turn-Based Combat**
- Two-phase turns: BLUE (player) and RED (enemy)
- Each unit can move and attack once per turn
- Movement range and attack range vary by unit type

**Fog of War**
- Enemy units only visible within friendly unit vision range
- Last known positions shown as ghost units
- Recon units have extended vision (5 hexes)
- Drones provide additional reconnaissance capability

**Unit Types**
- **Infantry (I)**: Balanced unit with moderate stats (Health: 100, Attack: 60, Defense: 40, Range: 2, Movement: 2, Vision: 3)
- **Armor (A)**: Heavy unit with high attack (Health: 150, Attack: 100, Defense: 80, Range: 3, Movement: 3, Vision: 2)
- **Artillery (R)**: Long-range support (Health: 80, Attack: 120, Defense: 20, Range: 5, Movement: 1, Vision: 1)
- **Recon (S)**: Scout unit with drones (Health: 70, Attack: 40, Defense: 30, Range: 2, Movement: 4, Vision: 5, Drones: 2)

**Drone System**
- Recon units can deploy autonomous drones
- Drones patrol in hexagonal patterns around target coordinates
- 8-turn battery life with low-battery warning at 2 turns
- Provide vision radius of 2 hexes
- Can be destroyed by enemy fire

**Autopilot Mode**
- Units can be set to AI control
- AI prioritizes: 1) Attack nearby enemies, 2) Move towards objectives/enemies
- Useful for managing multiple units simultaneously

### Terrain Features

- **Forest**: Provides cover, reduces damage by 30%
- **Hill**: Provides cover, reduces damage by 30%
- **Water**: Impassable terrain (decorative in current version)

### Combat System

**Damage Calculation**:
```javascript
attackRoll = random() * attacker.attack
defenseRoll = random() * target.defense
damage = max(10, attackRoll - defenseRoll)
// Apply terrain modifier: damage *= 0.7 if in cover
```

**Health System**:
- Units have max health and current health
- Health bars show: Green (>60%), Yellow (30-60%), Red (<30%)
- Units destroyed at 0 health

### UI Components

**HUD (Top Bar)**:
- Turn counter
- Current phase (BLUE/RED)
- Unit counts (Friendly/Enemy)
- Game status

**Control Panel (Right Side)**:
- Selected unit information and stats
- Action buttons: Move, Attack, Recon, Deploy Drone
- Autopilot toggle
- Battle log with categorized entries
- End Turn button

**Battlefield (Main Area)**:
- 20x14 hex grid (40px cells)
- Units rendered as colored circles with symbols
- Terrain overlays (semi-transparent)
- Objective markers (yellow diamonds)
- Range indicators (movement, attack, vision)
- Explosion effects

## Code Structure

### Game State Object
```javascript
gameState = {
    turn: number,
    phase: 'BLUE' | 'RED',
    mode: 'select' | 'move' | 'attack' | 'recon' | 'deploy-drone',
    selectedUnit: Unit | null,
    gridSize: { width: 20, height: 14 },
    cellSize: 40,
    units: Unit[],
    drones: Drone[],
    terrain: TerrainFeature[],
    objectives: Objective[],
    battleLog: string[]
}
```

### Key Functions

**Game Initialization**:
- `initGame()` - Master initialization
- `createBattlefield()` - Generates grid cells
- `deployUnits()` - Places initial forces
- `addTerrain()` - Places terrain features
- `addObjectives()` - Places objective markers

**Unit Management**:
- `createUnit(type, x, y, side, callsign)` - Unit factory
- `renderUnit(unit)` - Visual representation
- `selectUnit(unit)` - Unit selection handler
- `updateUnitInfo()` - Panel UI update

**Combat & Movement**:
- `moveUnit(unit, x, y)` - Movement validation and execution
- `attackTarget(attacker, x, y)` - Combat resolution
- `hasTerrainCover(x, y)` - Cover calculation

**Fog of War**:
- `updateFogOfWar()` - Master visibility update
- `spotEnemiesInRange(spotter)` - Vision calculation
- `updateGridFog()` - Visual fog overlay

**Drone System**:
- `createDrone(deployer, x, y)` - Drone factory
- `generatePatrolRoute(x, y, radius)` - Hexagonal patrol pattern
- `moveDronesAutomatically()` - Autonomous drone movement
- `renderDrone(drone)` - Visual representation

**AI System**:
- `executeEnemyTurn()` - Enemy AI controller
- `executeAutopilotActions()` - Friendly autopilot
- `executeUnitAutopilot(unit)` - Single unit AI logic

**Turn Management**:
- `endTurn()` - Phase transition and cleanup
- `updateHUD()` - Status display refresh

## Styling System

**Color Scheme**:
- Background: Dark (#1a1a1a)
- Friendly Units: Blue (#0066ff)
- Enemy Units: Red (#ff0000)
- UI Accents: Green (#00ff00)
- Drones: Cyan (#00ffff)
- Objectives: Yellow (#ffff00)

**Visual Effects**:
- Unit pulse animation when spotted
- Health bar color transitions
- Explosion animations (scale + fade)
- Autopilot pulse effect
- Low battery blink on drones

**Layout**:
- Fixed HUD at top (60px height)
- Battlefield fills left side
- Control panel fixed right (250px width)
- Responsive grid with absolute positioning

## Development Guidelines

### When Modifying FEBA

**Adding New Unit Types**:
1. Add entry to `unitTypes` object with stats
2. Update `createUnit()` if new properties needed
3. Add symbol character for unit
4. Update control panel styling if needed

**Adding New Terrain**:
1. Add to `addTerrain()` with x,y coordinates
2. Add CSS class in `<style>` section
3. Update `hasTerrainCover()` if affects combat

**Balancing Combat**:
- Adjust unit stats in `unitTypes` object
- Modify damage formula in `attackTarget()`
- Change terrain modifier multipliers

**Extending AI**:
- Modify `executeUnitAutopilot()` for friendly AI
- Modify `executeEnemyTurn()` for enemy AI
- Add new decision factors to priority system

### Testing Considerations

**Manual Testing Focus**:
- Unit movement and pathfinding
- Combat damage calculations
- Fog of war visibility
- Drone patrol behavior
- AI decision making
- Turn phase transitions
- Win/loss conditions

**Known Limitations**:
- No pathfinding (movement is direct line)
- No formations or unit stacking
- Simple terrain system (no complex modifiers)
- Basic AI (no strategic planning)
- No multiplayer support
- No save/load functionality

## Deployment

**To Update Production**:
1. Edit `FEBA.html` in this directory
2. Copy to `public/labs/feba/index.html`
3. Commit both files
4. Push to GitHub (auto-deploys to Cloudflare Pages)

**Deployment URL**: https://quarterly.systems/labs/feba

## Future Enhancement Ideas

- Save/load game state to localStorage
- Multiple difficulty levels for AI
- Unit experience and upgrades
- More terrain types with complex effects
- Campaign mode with multiple missions
- Unit production and resources
- Multiplayer hot-seat mode
- Mobile touch controls optimization
- Sound effects and music
- Custom map editor
- Different victory conditions
- Reinforcements and reserves

## Technical Notes

- Uses absolute positioning for grid-based layout
- DOM manipulation for unit/terrain rendering
- CSS animations for visual effects
- No canvas - pure HTML/CSS rendering
- setTimeout() for turn-based AI sequencing
- Event delegation for grid cell clicks
- classList for dynamic state management

## Performance

- Handles 20+ units without issues
- Grid size limited by screen space, not performance
- Could optimize with canvas for 50+ units
- DOM updates throttled during AI turns
