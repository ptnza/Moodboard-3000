<p align="center">
  <img width="1920" height="1080" alt="Moodboard 3000" src="https://github.com/user-attachments/assets/5a259312-f714-494f-adcd-3c634d5aa97a" />
</p>

<h1 align="center">Moodboard 3000</h1>

<p align="center">
  <strong>An image layout engine for Figma.</strong><br/>
  <em>improve your mood (boards)</em>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#layout-modes">Layout Modes</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#settings">Settings</a>
</p>

---

> **Early beta** — feedback welcome.

Moodboard 3000 takes your images and turns them into something that actually looks designed.

Pick a layout, tweak a few controls, hit generate.

No dragging. No nudging. No "eh, that works."

---

## Install

Moodboard 3000 isn't on the Figma Community yet — install it locally from this repo.

### 1. Download

**[Download ZIP](https://github.com/ptnza/Moodboard-3000/archive/refs/heads/main.zip)** and unzip.

Or clone with git:

```bash
git clone https://github.com/ptnza/Moodboard-3000.git
```

### 2. Load into Figma

1. Open the **Figma desktop app**
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Select the `manifest.json` file from this repo

The plugin will now appear under:

```
Plugins → Development → Moodboard 3000
```

> **Note:** Local plugins only work in the Figma desktop app (not browser).

---

## Layout Modes

| Mode | Description |
|------|-------------|
| **Grid** | Justified rows — images sized by aspect ratio, filling each row edge to edge. |
| **Editorial** | Composed, full-frame layouts with varied scale. |
| **Masonry** | Pinterest-style flow. Loose, but still structured. |
| **Cluster** | Organic, center-weighted. Slightly chaotic (in a good way). |

---

## Usage

1. Select up to **40 images** on your canvas
2. Open Moodboard 3000
3. Choose a layout mode
4. Adjust settings
5. Generate

A new frame is created with your layout. Your original images stay untouched.

### Tips

- Mixed aspect ratios → better results
- 15–40 images → Editorial and Masonry shine
- Smaller sets → Grid or Cluster tends to work better

---

## Settings

- **Gap** — Spacing between images
- **Margin** — Padding inside the frame
- **Corner Rounding** — Radius on image frames
- **Image Frame Styling** — How images sit inside frames
- **Page Size** — Preset canvas sizes

---

## Why this exists

Most tools treat image layout like a grid problem. This treats it like composition.

Started as "I just need a quick moodboard."
Turned into "why does nothing do this well?"

---

## Status

Early beta. Still refining edge cases, pushing layouts to feel less algorithmic and more intentional.

---

## Built by

**Gavin Potenza** · [Datalands](https://datalands.co) — design, data, and tools
