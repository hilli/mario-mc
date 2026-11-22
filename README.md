# Mario MC — Moto Kart Grand Prix

A Mario Kart style motorcycle racer that runs entirely in the browser. Pick your rider name and adventure bike, then race seven rivals over three tracks, using item boxes, boost pads and drift mini-turbos.

It is a static site with no build step and no external assets. Everything, including the bikes, scenery and music, is drawn and synthesised in code.

## Features

- Pseudo-3D racing at 60 fps with hills, curves, scenery, fog and parallax skies.
- Three tracks: **Alpine Pass**, **Desert Rally** and **Sunset Coast**.
- Eight-rider grid with rubber-banded AI and three difficulty levels.
- Items: turbo, oil slick, rocket and star. Better items go to riders further back.
- Drifting with mini-turbo boosts, boost pads and off-road slowdown that depends on the bike.
- One player, or two players in split screen on one keyboard (or with gamepads).
- Choose each player's name and motorcycle. Your choices are remembered between visits.
- Results podium, best laps, a pause menu, and sound effects plus music via Web Audio.

## Motorcycles

Each bike has the same stat budget, spread differently across top speed, acceleration, handling and off-road grip.

| Motorcycle | Strength |
| --- | --- |
| BMW R 1300 GS Adventure | Off-road king, heavy |
| BMW R 1300 GS | All-rounder |
| BMW F 900 GS | Light and quick off the line |
| BMW F 900 S | Best handling, weak off-road |
| KTM 1390 Super Adventure | Top speed |
| Triumph 900 | Balanced and agile |
| Ducati DesertX Gen 2 | Best off-road grip |
| Ducati Multistrada V4 S | Top speed and acceleration |

## Controls

| Action | 1 player | Player 1 (split) | Player 2 (split) | Gamepad | Touch |
| --- | --- | --- | --- | --- | --- |
| Accelerate | ↑ / W | W | ↑ | A / RT | Push joystick up (auto-throttle on by default) |
| Brake | ↓ / S | S | ↓ | B / LT | Pull joystick down |
| Steer | ← → / A D | A D | ← → | Left stick / D-pad | Joystick left/right |
| Drift | Shift / Z | Left Shift | Right Shift | LB / RB | DRIFT button |
| Use item | Space / E / Enter / X | Space / E | Enter / Slash | X / Y | ITEM button |
| Pause | Esc / P | Esc / P | Esc / P | Start | ❚❚ button |

## Play locally

Any static file server works:

```sh
python3 -m http.server 8000   # or: npm start
```

Then open <http://localhost:8000>.

## Host on GitHub Pages

`index.html` is in the repository root and every path is relative, so the site works as-is from a project page:

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/ (root)` folder, then save.

The game is then served at `https://<user>.github.io/mario-mc/`.

## Development

```
index.html      screens, HUD buttons and touch controls
css/style.css   menus and overlays
js/bikes.js     motorcycle catalogue (stats, colours, styling)
js/core.js      DOM-free game logic: tracks, physics, AI, items, standings
js/render.js    canvas renderer: road, sprites, bikes, HUD
js/audio.js     Web Audio engine sounds, effects and music
js/game.js      UI flow, input (keyboard, gamepad, touch) and main loop
tests/          node:test suite for the game logic
```

Run the tests with Node 18 or newer:

```sh
npm test
```
