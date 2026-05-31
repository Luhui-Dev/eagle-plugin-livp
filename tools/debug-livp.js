const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const sharp = require('sharp');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isProbablyMacResourceFork(entryPath) {
  const normalized = entryPath.replace(/\\/g, '/');
  return normalized.startsWith('__MACOSX/') || path.basename(normalized).startsWith('._');
}

function isImagePath(entryPath) {
  const lower = entryPath.toLowerCase();
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.heic') ||
    lower.endsWith('.heif')
  );
}

function detectMagic(buffer) {
  const first12 = buffer.subarray(0, 12);
  const hex = first12.toString('hex');
  const ascii = first12.toString('latin1').replace(/[^\x20-\x7E]/g, '.');

  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { hex, ascii, type: 'jpeg' };
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1');
    const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);
    return { hex, ascii, type: heicBrands.has(brand) ? `heif/heic (${brand})` : `isobmff (${brand})` };
  }

  return { hex, ascii, type: 'unknown' };
}

async function inspectLivp(src) {
  const absoluteSrc = path.resolve(src);
  const buffer = fs.readFileSync(absoluteSrc);
  const fileMagic = detectMagic(buffer);

  console.log(`File: ${absoluteSrc}`);
  console.log(`Size: ${formatBytes(buffer.length)}`);
  console.log(`Magic: ${fileMagic.hex} (${fileMagic.ascii}) => ${fileMagic.type}`);

  const zip = await JSZip.loadAsync(buffer);
  const entries = [];

  zip.forEach((relativePath, file) => {
    entries.push({
      path: relativePath,
      dir: file.dir,
      compressedSize: file._data && file._data.compressedSize,
      uncompressedSize: file._data && file._data.uncompressedSize,
      isImage: !file.dir && isImagePath(relativePath),
      isResourceFork: isProbablyMacResourceFork(relativePath),
    });
  });

  console.log(`Entries: ${entries.length}`);
  for (const entry of entries) {
    const flags = [
      entry.dir ? 'dir' : 'file',
      entry.isImage ? 'image-candidate' : null,
      entry.isResourceFork ? 'mac-resource-fork' : null,
    ].filter(Boolean).join(', ');

    console.log(`- ${entry.path}`);
    console.log(`  ${flags || 'file'}`);
    if (!entry.dir) {
      console.log(`  compressed: ${formatBytes(entry.compressedSize)}, uncompressed: ${formatBytes(entry.uncompressedSize)}`);
    }
  }

  const imageEntries = entries.filter((entry) => entry.isImage && !entry.isResourceFork);
  console.log(`\nImage candidates: ${imageEntries.length}`);

  for (const entry of imageEntries) {
    const file = zip.file(entry.path);
    console.log(`\n[${entry.path}]`);

    try {
      const imageBuffer = await file.async('nodebuffer');
      const imageMagic = detectMagic(imageBuffer);

      console.log(`actual extracted size: ${formatBytes(imageBuffer.length)}`);
      console.log(`magic: ${imageMagic.hex} (${imageMagic.ascii}) => ${imageMagic.type}`);

      const metadata = await sharp(imageBuffer).metadata();
      console.log('sharp: ok');
      console.log(`format: ${metadata.format}`);
      console.log(`width: ${metadata.width}`);
      console.log(`height: ${metadata.height}`);
      console.log(`orientation: ${metadata.orientation || 'none'}`);
      console.log(`space: ${metadata.space || 'unknown'}`);

      try {
        const pngBuffer = await sharp(imageBuffer).rotate().png().toBuffer();
        console.log(`convert-to-png: ok (${formatBytes(pngBuffer.length)})`);
      } catch (error) {
        console.log('convert-to-png: failed');
        console.log(error && error.stack ? error.stack : String(error));

      }
    } catch (error) {
      console.log('extract/metadata: failed');
      console.log(error && error.stack ? error.stack : String(error));
    }
  }
}

const src = process.argv[2];

if (!src) {
  console.error('Usage: node tools/debug-livp.js <path-to-file.livp>');
  process.exit(1);
}

inspectLivp(src).catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
