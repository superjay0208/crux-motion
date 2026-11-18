# UI & Art Direction Research — Crux Motion Visual Overhaul

## 1. Reference Games & Design Pillars

### Jusant (Don't Nod)
- **Stamina HUD**: Minimal diegetic approach — stamina drains only during jumps/exertion, not while hanging. A subtle circular/arc meter appears near the character only when relevant, fading when at rest. Controller triggers map directly to left/right hands.
- **Key Takeaway**: Curved stamina arc attached to the climber body (not screen corners). Emerald→Ochre→Vermilion color shift communicates urgency without text. Gentle pulse when low, chalk-white glow when recovering.

### Cairn (The Game Bakers)
- **Zero-UI Philosophy**: No intrusive HUD — tension communicated through character animation (limb shaking), breathing audio, camera zoom, and haptic feedback. Limbs controlled independently.
- **Key Takeaway**: Forearm muscle tremor when pumped (reserve < 35%). Visible strain through wobble, not abstract meters. Character posture tells the story.

### Valley Peaks / Lonely Mountains: Downhill
- **Tactile Outdoor Aesthetic**: Low-poly geometric forms + dramatic atmospheric lighting. Menus styled as topo maps, field journals, chalk-dusted tags. Gear-centric mindset — UI elements feel like items from a climber's chalk bag.
- **Key Takeaway**: Warm natural surfaces (stone, plywood, canvas). Stamp/tag typography. Card-based route selection resembling real gym topo cards pinned to a corkboard.

### Bouldering Gym Culture
- **Topo Cards**: White/cream cards with bold route grades, colored hold indicators, and hand-drawn path lines on plywood boards.
- **Wall Design**: Charcoal-grey/warm concrete panels with visible T-nut bolt grids, panel seams, and warm overhead spotlights. Crash pad mats in muted navy/charcoal with colored edge binding.
- **Hold Design**: Vibrant polyurethane resin holds — each type has a distinct color, shape, and texture. Chalk accumulates on positive surfaces.

---

## 2. Color Palette — "Warm Gym Topo"

| Role | Hex | Usage |
|------|-----|-------|
| Shell / Background | `#181512` | App background, warm near-black espresso |
| Wall Dark | `#1d1a17` | Main climbing wall surface |
| Wall Panel | `#272320` | Lighter wall panel facets |
| Wall Facet Light | `#322c27` | Sunlit angled volume highlights |
| Wall Facet Dark | `#221e1b` | Recessed shadow facets |
| Crash Pad | `#2c353d` | Bouldering mat at floor |
| Jug (Emerald) | `#2fb370` | Primary hold — positive bucket |
| Jug Highlight | `#5be09b` | Top-lit edge |
| Jug Shadow | `#175c39` | Underside shadow |
| Crimp (Ochre) | `#eb9c28` | Angular incut edge |
| Crimp Highlight | `#ffd175` | Lit crisp lip |
| Crimp Shadow | `#7c4b08` | Undercut shadow |
| Pinch (Vermilion) | `#e55938` | Vertical tufa/rib |
| Pinch Highlight | `#ff987d` | Lit face |
| Pinch Shadow | `#7a2210` | Deep recess |
| TOP Hold | `#f5ede0` | Ivory/sandstone finishing volume |
| Stamina Full | `#37c47b` | Emerald arc |
| Stamina Mid | `#f0a830` | Ochre transition |
| Stamina Low | `#ec4e32` | Vermilion critical |
| Chalk White | `#f4efe6` | Typography, chalk dust |
| Muted Text | `#a89e8f` | Secondary labels |
| Accent Ochre | `#eb9c28` | Buttons, highlights |
| Accent Vermilion | `#e55938` | Warnings, strain |
| L Wrist Tape | `#4d8ef7` | Cobalt — left hand |
| R Wrist Tape | `#f2a93b` | Amber — right hand |
| Card Surface | `#231f1b` | Topo card background |

---

## 3. Typography

| Role | Font | Weight | Fallback |
|------|------|--------|----------|
| UI Body | Fredoka | 400–600 | system-ui, sans-serif |
| Display / Headers | Bebas Neue | 400 | Impact, sans-serif |
| Condensed Labels | BarlowCondensed | 400, 800 | Arial Narrow, sans-serif |
| Canvas HUD | Fredoka / Bebas Neue | 700 | sans-serif |

All fonts self-hosted as `.ttf` in `/fonts/` with OFL licenses. Zero reliance on `Arial` or Google Fonts CDN.

---

## 4. Hold Art Direction

### Jug — Ergonomic Rounded Bucket
- Emerald `#2fb370` body with deep recessed grab pocket shadow on top
- Rounded positive silhouette (moveTo/quadraticCurveTo organic shape)
- Washer bolt rendered as small dark circle
- Chalk stippling on positive top rim when visited

### Crimp — Angular Incut Edge
- Ochre `#eb9c28` body, crisp flat horizontal shape (roundRect)
- Sharp dark undercut shadow below the biting lip
- Narrow chalked top edge
- Twin screw head dots

### Pinch — Vertical Sculpted Rib/Tufa
- Vermilion `#e55938` body, tall narrow vertical organic shape
- Concave thumb depressions on both left and right flanks
- Chalk marks on both squeeze surfaces

### TOP Hold — Large Finishing Volume
- Ivory/sandstone `#f5ede0`
- Gym-style twin finish tape tags reading "TOP"
- Dual match zone indicators (L/R patches)

---

## 5. Climber Anatomy

- **2-segment articulated legs**: IK from hip to passive foot endpoints, tapered thigh/calf, shorts cuffs, climbing shoes (dark rubber rand, ochre velcro strap)
- **Anatomical arms**: Sculpted deltoid/bicep upper, tapered flexor forearm. Muscle tremor on forearm when reserve < 35%
- **Athletic top**: Warm terracotta `#d96b43` raglan with cream/charcoal panels (NOT neon cyan)
- **Harness/chalk bag**: Waistband with swaying chalk bag at hip
- **Expressive head**: Tousled hair/headband, dynamic eyes (focused→wide→grit), gaze tracks target
- **Hand gestures**: Jug=clenched fist, Crimp=arched claw, Pinch=thumb clamp, Release=splayed fingers. Chalked fingertips. L/R wrist tape color-coded.

---

## 6. Stamina HUD — Diegetic Arc

Inspired by Jusant/BotW stamina wheel:
- Curved arc beneath climber's hip/chalk bag
- Central arc = `s.energy` (core stamina)
- Left flanking arc = `s.reserve.left` (left forearm)
- Right flanking arc = `s.reserve.right` (right forearm)
- Color shift: Emerald `#37c47b` → Ochre `#f0a830` → Vermilion `#ec4e32` below 35%
- Gentle pulse animation when low
- Chalk-white glow when resting/recovering

---

## 7. CSS UI Direction

Replace dark-cyan SaaS (`#101e24` + `#9ce7c8`) with:
- Warm stone/espresso shell (`#181512`)
- Tactile topo cards (`#231f1b` bg, `#f4efe6` chalk text)
- Bold tactile buttons with physical bottom-bevel press states
- Ochre/vermilion/emerald accent system
- 12-boulder front-screen grid styled as gym topo cards
- Prominent HUD stamina bar `.stamina-panel`
- 4-class gesture meter `.gesture-bars`
