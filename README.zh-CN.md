# Eagle LIVP Format Extension Plugin

[English](./README.md) | [简体中文](./README.zh-CN.md)

一个为 Eagle 提供 `.livp` 文件缩略图生成和预览能力的插件，适用于 Apple Live Photo 文件。

## 功能特性

- 自动提取 LIVP 包内最大的 JPG 生成缩略图。
- 同时预览静态图片和内嵌的 MOV 视频。
- 支持包含多个 JPG 或 MOV 资源的 LIVP 文件。
- 在媒体提取或播放失败时提供优雅降级处理。

## 安装

1. 将插件目录复制到 Eagle 插件目录。
2. 在项目根目录运行 `npm install`。
3. 在 Eagle 中启用插件。

## 项目结构

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

## 技术说明

- LIVP 文件本质上是一个通常包含 JPG 和 MOV 的 ZIP 容器。
- 缩略图生成逻辑会优先提取压缩包内体积最大的 JPG。
- 预览器会在可播放的情况下同时展示静态图和视频内容。
- Windows 下的 MOV 播放依赖本地编解码器和浏览器支持情况。

## 开发

```bash
npm install
```

## 许可证

MIT
