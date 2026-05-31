const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const sharp = require("sharp");

/**
 * 日志工具函数
 */
function logError(message, error) {
  try {
    const logDir = path.join(__dirname, "..", "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, "thumbnail.log");
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n${error ? error.stack || error.toString() : ""}\n\n`;
    fs.appendFileSync(logFile, logMessage, "utf8");
  } catch (logErr) {
    // 忽略日志写入失败
  }
}

/**
 * 检测是否为 ZIP 文件
 */
function isZipFile(buffer) {
  if (buffer.length < 4) return false;
  // ZIP magic bytes: PK\x03\x04
  return (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/**
 * 从 ZIP 中选择最大的 JPG 文件
 */
function findLargestJpg(zip) {
  const jpgFiles = [];

  zip.forEach((relativePath, file) => {
    if (!file.dir) {
      const lowerPath = relativePath.toLowerCase();
      if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
        jpgFiles.push({
          path: relativePath,
          file: file,
          size: file._data ? file._data.uncompressedSize : 0,
        });
      }
    }
  });

  if (jpgFiles.length === 0) {
    return null;
  }

  // 按大小排序，返回最大的
  jpgFiles.sort((a, b) => b.size - a.size);
  return jpgFiles[0];
}

/**
 * 生成占位缩略图
 */
async function generatePlaceholderThumbnail(dest, size = 400) {
  try {
    // 创建一个简单的灰色占位图
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#e0e0e0"/>
        <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#999" text-anchor="middle" dominant-baseline="middle">LIVP</text>
      </svg>
    `;

    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(dest);

    return true;
  } catch (err) {
    logError("Failed to generate placeholder thumbnail", err);
    return false;
  }
}

/**
 * 超时保护包装函数
 */
function withTimeout(promise, timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Operation timeout")), timeoutMs),
    ),
  ]);
}

/**
 * 主函数：生成 LIVP 缩略图
 */
module.exports = async ({ src, dest, item }) => {
  try {
    // 1. 读取源文件
    if (!fs.existsSync(src)) {
      throw new Error(`Source file not found: ${src}`);
    }

    const buffer = fs.readFileSync(src);

    // 2. 检测 ZIP magic bytes
    if (!isZipFile(buffer)) {
      logError(`File is not a valid ZIP: ${src}`);
      await generatePlaceholderThumbnail(dest);
      return item;
    }

    // 3. 加载 ZIP（带超时保护）
    const zip = await withTimeout(JSZip.loadAsync(buffer), 10000);

    // 4. 查找最大的 JPG 文件
    const largestJpg = findLargestJpg(zip);

    if (!largestJpg) {
      logError(`No JPG file found in LIVP: ${src}`);
      await generatePlaceholderThumbnail(dest);
      return item;
    }

    // 5. 提取 JPG 数据（带超时保护）
    const jpgBuffer = await withTimeout(
      largestJpg.file.async("nodebuffer"),
      10000,
    );

    // 6. 使用 sharp 读取元数据（含 EXIF 方向）
    const metadata = await withTimeout(sharp(jpgBuffer).metadata(), 5000);
    const targetSize = 400; // manifest.json 中定义的 size

    // 计算显示尺寸：EXIF 方向 5、6、7、8 表示 90/270 度旋转，宽高需互换
    let width = metadata.width;
    let height = metadata.height;
    const ori = metadata.orientation || 1;
    if (ori >= 5 && ori <= 8) {
      [width, height] = [height, width];
    }
    const maxDimension = Math.max(width, height);

    if (maxDimension > targetSize) {
      const scale = targetSize / maxDimension;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    // 7. 先按 EXIF 方向旋转再缩放，保证缩略图方向与点击查看一致
    await withTimeout(
      sharp(jpgBuffer)
        .rotate() // 无参数时根据 EXIF Orientation 自动旋转
        .resize(width, height, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toFile(dest),
      10000,
    );

    // 8. 更新 item 尺寸信息（使用应用 EXIF 后的显示尺寸）
    if (item && width && height) {
      item.width = width;
      item.height = height;
    }

    return item;
  } catch (error) {
    logError(`Error processing LIVP thumbnail: ${src}`, error);

    // 尝试生成占位图
    try {
      await generatePlaceholderThumbnail(dest);
    } catch (placeholderErr) {
      logError("Failed to create placeholder thumbnail", placeholderErr);
      throw error; // 如果占位图也失败，抛出原始错误
    }

    return item;
  }
};
