const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {after, before, test} = require('node:test');
const assert = require('node:assert/strict');

const {
    isDangerousPath,
    isPathWithin,
    isSafePath
} = require('../../dist/main/utils/pathSecurity.js');

let temporaryRoot;
let allowedRoot;
let siblingRoot;

before(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'musicbox-path-security-'));
    allowedRoot = path.join(temporaryRoot, 'music');
    siblingRoot = path.join(temporaryRoot, 'music-backup');
    fs.mkdirSync(allowedRoot);
    fs.mkdirSync(siblingRoot);
});

after(() => {
    fs.rmSync(temporaryRoot, {recursive: true, force: true});
});

test('允许文件名包含连续点号', () => {
    const instrumentalPath = path.join(allowedRoot, 'Fateful... -instrumental-.m4a');
    const regularPath = path.join(allowedRoot, 'Fateful....m4a');
    fs.writeFileSync(instrumentalPath, 'audio');
    fs.writeFileSync(regularPath, 'audio');

    assert.equal(isDangerousPath(instrumentalPath), false);
    assert.equal(isDangerousPath(regularPath), false);
    assert.equal(isSafePath(instrumentalPath, [allowedRoot]), true);
    assert.equal(isSafePath(regularPath, [allowedRoot]), true);
});

test('拒绝解析后位于允许目录之外的路径', () => {
    const outsidePath = path.join(siblingRoot, 'outside.m4a');
    fs.writeFileSync(outsidePath, 'audio');

    assert.equal(isSafePath(path.join(allowedRoot, '..', 'music-backup', 'outside.m4a'), [allowedRoot]), false);
    assert.equal(isPathWithin(outsidePath, allowedRoot), false);
});

test('不会把同前缀的相邻目录误判为允许目录', () => {
    const siblingPath = path.join(siblingRoot, 'track.m4a');
    fs.writeFileSync(siblingPath, 'audio');

    assert.equal(isSafePath(siblingPath, [allowedRoot]), false);
});

test('无法规范化的路径按失败关闭处理', () => {
    const invalidPath = `invalid${String.fromCharCode(0)}path.m4a`;

    assert.equal(isSafePath(invalidPath, [allowedRoot]), false);
    assert.equal(isDangerousPath(invalidPath), true);
});

test('尚未创建的子路径仍可进行包含关系判断', () => {
    const futurePath = path.join(allowedRoot, 'new-album', 'future.m4a');

    assert.equal(isSafePath(futurePath, [allowedRoot]), true);
});

test('拒绝通过符号链接或目录联接逃逸允许目录', (context) => {
    const outsidePath = path.join(siblingRoot, 'linked.m4a');
    const linkPath = path.join(allowedRoot, 'linked-directory');
    fs.writeFileSync(outsidePath, 'audio');

    try {
        fs.symlinkSync(siblingRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
        if (error?.code === 'EPERM' || error?.code === 'EACCES') {
            context.skip('当前环境不允许创建符号链接或目录联接');
            return;
        }
        throw error;
    }

    assert.equal(isSafePath(path.join(linkPath, 'linked.m4a'), [allowedRoot]), false);
});
