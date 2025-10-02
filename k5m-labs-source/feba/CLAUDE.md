# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Game Overview

**FEBA (Forward Edge of Battle Area)** is a minimal tactical exploration game built as a single-file HTML5 game. The player controls one unit exploring a grid with fog of war until encountering and defeating a single hidden enemy unit.

## Core Design Philosophy

**ABSOLUTE MINIMUM VIABLE GAME**
- 1 player unit vs 1 enemy unit
- Click to move, click enemy to attack
- Enemy counter-attacks automatically
- First to die loses
- That's it. Nothing more.

## Architecture

**Single File**: `FEBA.html` - Complete game in one self-contained HTML file
**Size Target**: ~500 lines (was 1700+, now simplified)
**Dependencies**: anime.js v4 (CDN) for animations
**Deployment**: Copy to `public/labs/feba/index.html` for web hosting

## Game Mechanics

### Core Loop

1. **Player clicks their unit** → Movement range highlights (blue cells, 3-cell radius)
2. **Player clicks destination** → Unit slides there smoothly with anime.js
3. **Fog of war updates** → Enemy appears if within vision range (3 cells)
4. **Player clicks enemy** (when visible) → Attack sequence plays
5. **Enemy counter-attacks** automatically if still alive
6. **First unit to 0 health** → Game over (Victory/Defeat alert, auto-restart)

### Units

**Player Unit**
- Type: Infantry
- Position: Fixed at (2, 7)
- Stats: Health 100, Attack 60, Defense 40, Range 2, Vision 3
- Callsign: "PLAYER"

**Enemy Unit**
- Type: Random (Infantry/Armor/Artillery/Recon)
- Position: Random (x: 16-19, y: 2-11)
- Stats: Varies by type
- Callsign: "ENEMY"
- Hidden by fog of war until discovered

### Fog of War

- Enemy hidden until player unit gets within 3 cells
- Enemy stays visible once spotted
- Simple boolean: visible or not

### Combat

**Damage Formula**:
```javascript
attackRoll = random() * attacker.attack
defenseRoll = random() * target.defense
damage = max(10, attackRoll - defenseRoll)
damage = floor(damage)
```

**Attack Sequence** (anime.js):
1. Attacker flash (scale 1→1.15→1, brightness pulse) - 100ms
2. Projectile streak (colored dot animates attacker→target) - 100ms
3. Target shake (translateX wiggle) - 100ms
4. Damage number floats up (translateY + fade) - 400ms
5. Explosion effect (existing CSS animation) - 500ms

**Projectile Colors**:
- Infantry: Yellow (#ffff00)
- Armor: Orange (#ff8800)
- Artillery: Red (#ff0000)
- Recon: Cyan (#00ffff)

### Grid

- Size: 20 cells wide × 14 cells tall
- Cell size: 60px × 60px
- Layout: Simple square grid (not hex despite game name)
- Click detection via data-x/data-y attributes

## What's Removed

**NO** turn system - continuous play
**NO** phases (BLUE/RED) - just player and enemy
**NO** End Turn button - movement happens immediately
**NO** action buttons - direct click interaction only
**NO** multiple units - just 1v1
**NO** drones - removed complexity
**NO** terrain - plain grid
**NO** objectives - just defeat enemy
**NO** autopilot - no AI for player
**NO** movement points - unlimited movement in 3-cell range
**NO** attack limits - can attack repeatedly

## Code Structure

### HTML Elements

```html
<div class="hud">
  - Turn counter (can remove)
  - Unit counts
  - New Game button
</div>

<div class="battlefield">
  - Grid cells (generated)
  - Units (rendered)
</div>

<div class="control-panel">
  - Selected unit info
  - Battle log
</div>
```

### Key Functions

**Game Initialization**:
- `initGame()` - Creates grid, spawns units, sets up fog
- `restartGame()` - Clears state and reinitializes
- `deployUnits()` - Creates 1 player unit + 1 random enemy

**Unit Management**:
- `createUnit(type, x, y, side, callsign)` - Unit factory
- `renderUnit(unit)` - Visual representation with health bar
- `selectUnit(unit)` - Selection handler (only friendly units)

**Interaction**:
- `handleCellClick(x, y)` - Smart detection: move or attack
- `moveUnit(unit, x, y)` - Updates position, triggers animation
- `attackTarget(attacker, x, y)` - Combat calculation + animation
- `counterAttack(attacker, target)` - Automatic retaliation

**Animations** (anime.js):
- `animateMovement(unit, x, y, callback)` - Smooth position change
- `animateAttack(attacker, target, damage, callback)` - Full attack sequence

**Fog of War**:
- `updateFogOfWar()` - Shows/hides enemy based on distance
- Vision check: `distance <= 3 cells` from player unit

**Win/Loss**:
- Checked after every attack/counter-attack
- `alert()` message + `restartGame()` after 1 second

### Game State

```javascript
gameState = {
  units: [playerUnit, enemyUnit],  // Just 2 units
  selectedUnit: null,               // Currently selected
  gridSize: { width: 20, height: 14 },
  cellSize: 60,
  battleLog: []
}
```

## Styling

**Color Scheme**:
- Background: Dark (#1a1a1a)
- Grid cells: Green borders (rgba(0, 255, 0, 0.2))
- Movement highlights: Blue (rgba(0, 0, 255, 0.2))
- Friendly unit: Blue (#0066ff)
- Enemy unit: Red (#ff0000)
- Fog: Dark overlay (#000 50% opacity)

**Animations**:
- All via anime.js for smooth 60fps performance
- Durations: 100-400ms for snappy feel
- Easing: easeOutQuad for natural motion

## Development Guidelines

### When Modifying FEBA

**Adding Features**:
- Don't. The game is intentionally minimal.
- If absolutely necessary, document why in CLAUDE.md first

**Balancing Combat**:
- Adjust unit stats in `unitTypes` object
- Keep damage formula simple (no terrain modifiers)

**Bug Fixes**:
- Always test: select unit → move → discover enemy → attack → counter-attack → victory
- Verify fog of war reveals enemy at correct distance
- Ensure game restarts properly after win/loss

### Testing Checklist

1. Click player unit → see blue movement cells
2. Click blue cell → unit moves immediately (no delays)
3. Move right 4-5 times → enemy should appear
4. Click enemy → attack plays, enemy counter-attacks
5. Keep attacking → eventually someone dies
6. Verify win/loss alert shows
7. Click "New Game" → fresh random enemy spawns

## Deployment

**To Update Production**:
1. Edit `FEBA.html` in this directory
2. Copy to `public/labs/feba/index.html`
3. Test locally by opening index.html in browser
4. Commit both files
5. Push to GitHub (auto-deploys to Cloudflare Pages)

**Deployment URL**: https://quarterly.systems/labs/feba

## Technical Notes

- Uses anime.js v4 from CDN (imported as ES module)
- DOM manipulation for all rendering (no canvas)
- Click delegation via cell data attributes
- Simple collision: check if cell occupied before move
- No pathfinding: direct distance calculation only
- Alert-based game over (can improve to modal later)

## Performance

- Handles 2 units easily (obviously)
- Grid size limited by screen space
- Anime.js handles 60fps animations smoothly
- No performance concerns with this minimal scope

## File Size

Target: ~500 lines total
Current: Way too much (1700+)
Next step: Rewrite from scratch following this spec exactly
