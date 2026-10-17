import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root));
const readText = async path => (await read(path)).toString('utf8');

function inspectPng(buffer) {
    assert.deepEqual([...buffer.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
    let pos = 8;
    let width, height, colorType, bitDepth;
    const chunks = [];
    const idat = [];
    while (pos < buffer.length) {
        const n = buffer.readUInt32BE(pos);
        const kind = buffer.toString('ascii', pos + 4, pos + 8);
        const bytes = buffer.subarray(pos + 8, pos + 8 + n);
        assert.ok(pos + 12 + n <= buffer.length, 'PNG has truncated chunks');
        if (kind === 'IHDR') {
            width = bytes.readUInt32BE(0);
            height = bytes.readUInt32BE(4);
            bitDepth = bytes[8];
            colorType = bytes[9];
        }
        if (kind === 'IDAT') idat.push(bytes);
        chunks.push(kind);
        pos += 12 + n;
        if (kind === 'IEND') break;
    }
    assert.equal(pos, buffer.length, 'no unparsed bytes after IEND');
    assert.deepEqual(chunks, ['IHDR','PLTE','IDAT','IEND']);
    assert.equal(colorType, 3, 'indexed color icon');
    assert.equal(bitDepth, 2);
    const pixels = inflateSync(Buffer.concat(idat));
    assert.equal(pixels.length, height * (1 + Math.ceil(width * 2 / 8)));
    return {width, height};
}

test('installable PWA manifest contains icons and standalone behavior on iPhone and Android', async () => {
    const manifest = JSON.parse(await readText('manifest.webmanifest'));
    assert.equal(manifest.name,'HomeGym Diary');
    assert.equal(manifest.display,'standalone');
    assert.equal(manifest.start_url,'/');
    assert.equal(manifest.scope,'/');
    assert.equal(manifest.theme_color,'#0f172a');
    assert.equal(manifest.icons.length,2);
    for (const px of [192,512]) {
        const icon = manifest.icons.find(icon=>icon.sizes===px+'x'+px);
        assert.ok(icon,'missing '+px+'px install icon');
        assert.equal(icon.type,'image/png');
        assert.match(icon.purpose,/maskable/);
        assert.deepEqual(inspectPng(await read(icon.src.slice(1))),{width:px,height:px});
    }
    assert.deepEqual(inspectPng(await read('icons/apple-touch-icon.png')),{width:180,height:180});
});

test('iPhone startup metadata and safe area styles do not change workout logic',async()=>{
    const html=await readText('index.html');
    const css=await readText('css/style.css');
    const sw=await readText('sw.js');
    assert.match(html,/<link rel="manifest" href="\/manifest\.webmanifest">/);
    assert.match(html,/<link rel="apple-touch-icon" sizes="180x180" href="\/icons\/apple-touch-icon\.png">/);
    assert.match(html,/apple-mobile-web-app-capable" content="yes"/);
    assert.match(html,/viewport-fit=cover/);
    assert.match(html,/updateViaCache: 'none'/);
    assert.match(css,/safe-area-inset-top/);
    assert.match(css,/safe-area-inset-bottom/);
    assert.match(css,/#floating-timer\s*\{\s*bottom: calc\(20px \+ env\(safe-area-inset-bottom/);
    for(const asset of ['/manifest.webmanifest','/icons/apple-touch-icon.png','/icons/icon-192.png','/icons/icon-512.png']) {
        assert.ok(sw.includes("'"+asset+"'"),asset+' not included in offline static cache');
    }
    assert.match(sw,/key\.startsWith\('workout-app-'\)/,
        'cleanup must only remove app-specific caches');
    assert.match(sw,/const CACHE_NAME = 'workout-app-v50-/);
});
