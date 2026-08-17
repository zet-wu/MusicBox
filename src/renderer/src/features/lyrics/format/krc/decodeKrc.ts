import {inflate} from 'pako';

const KRC_HEADER = new Uint8Array([0x6b, 0x72, 0x63, 0x31]);
const KRC_XOR_KEY = new Uint8Array([
    0x40, 0x47, 0x61, 0x77,
    0x5e, 0x32, 0x74, 0x47,
    0x51, 0x36, 0x31, 0x2d,
    0xce, 0xd2, 0x6e, 0x69
]);

export function decodeKrc(bytes: Uint8Array): string {
    if (bytes.length <= KRC_HEADER.length || !hasHeader(bytes)) {
        throw new Error('无效的 KRC 文件头');
    }

    const encrypted = bytes.subarray(KRC_HEADER.length);
    const compressed = new Uint8Array(encrypted.length);
    for (let index = 0; index < encrypted.length; index += 1) {
        compressed[index] = encrypted[index] ^ KRC_XOR_KEY[index % KRC_XOR_KEY.length];
    }

    try {
        return inflate(compressed, {to: 'string'});
    } catch (error) {
        throw new Error('KRC 解压失败', {cause: error});
    }
}

function hasHeader(bytes: Uint8Array): boolean {
    return KRC_HEADER.every((value, index) => bytes[index] === value);
}
