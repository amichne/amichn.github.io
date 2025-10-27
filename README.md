# Personal Site/Blog

Minimalist blog and photo portfolio built with 11ty.

## Setup

```bash
npm install
npm start
```

Site runs at http://localhost:8080

## Features

- Dark/light theme toggle with localStorage persistence
- Terminal aesthetic with semi-transparent window effect
- Responsive photo grid
- Markdown-based content
- EXIF metadata display for photos

## Structure

- `src/posts/` - Blog posts in markdown
- `src/photos/` - Photo posts with metadata
- `src/_includes/` - Layout templates
- `src/css/` - Styles

## Adding Content

### Blog Post

Create `src/posts/YYYY-MM-DD-slug.md`:

```markdown
---
title: "Post Title"
date: 2025-01-15
tags: ["tag1", "tag2"]
---

Content here.
```

### Photo Post

Create `src/photos/YYYY-MM-DD-slug.md`:

```markdown
---
title: "Photo Title"
date: 2025-01-15
location: "Location"
image: "/photos/filename.jpg"
camera: "Camera model"
lens: "Lens model"
settings: "ISO, aperture, shutter"
---

Optional description.
```

Place images in `src/photos/` directory.

## Customization

Theme colors are defined as CSS custom properties in `src/css/style.css`:
- Adjust transparency: change opacity value in `--body-bg`
- Modify colors: update values in `:root` (dark) and `[data-theme="light"]` (light)
- Grid texture: adjust `--grid-color` opacity

## Build

```bash
npm run build
```

Output in `_site/` directory.
