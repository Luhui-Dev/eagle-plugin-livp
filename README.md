# Eagle LIVP Format Extension Plugin

[English](./README.md) | [简体中文](./README.zh-CN.md)

An Eagle plugin that adds thumbnail generation and preview support for Apple Live Photo files in `.livp` format.

## Features

- Generate thumbnails by extracting the largest JPG from a LIVP package.
- Preview both the still image and the embedded MOV video.
- Handle LIVP files that contain multiple JPG or MOV assets.
- Fall back gracefully when media extraction or playback fails.

## Installation

1. Copy this plugin folder into your Eagle plugin directory.
2. Run `npm install` in the project root.
3. Enable the plugin in Eagle.

## Project Structure

```text
eagle-plugin-livp/
├── manifest.json
├── logo.png
├── thumbnail/
│   └── livp.js
├── viewer/
│   ├── index.html
│   ├── viewer.js
│   └── viewer.css
└── vendor/
    └── jszip.min.js
```

## Technical Notes

- A LIVP file is a ZIP container that usually bundles JPG and MOV files.
- Thumbnail generation extracts the largest JPG found in the archive.
- The viewer presents the still image and video together when playback is available.
- MOV playback on Windows depends on local codecs and browser support.

## Development

```bash
npm install
```

## License

MIT
