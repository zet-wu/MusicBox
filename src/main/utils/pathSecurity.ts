/**
 * 路径安全工具函数
 * 防止路径遍历攻击和访问系统敏感目录
 */

import * as path from 'path';
import {realpathSync} from 'fs';

/**
 * 获取用于安全比较的规范路径。
 * 已存在路径会解析符号链接；尚未创建的路径会从最近存在的父目录继续解析。
 */
function resolveCanonicalPath(filePath: string): string {
    const resolvedPath = path.resolve(filePath);

    try {
        return realpathSync.native(resolvedPath);
    } catch (error: any) {
        if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') {
            throw error;
        }

        const parentPath = path.dirname(resolvedPath);
        if (parentPath === resolvedPath) {
            return resolvedPath;
        }

        return path.join(resolveCanonicalPath(parentPath), path.basename(resolvedPath));
    }
}

/**
 * 判断目标路径是否位于指定根目录内（包含根目录本身）。
 */
function isCanonicalPathWithin(filePath: string, rootPath: string): boolean {
    const canonicalPath = resolveCanonicalPath(filePath);
    const canonicalRoot = resolveCanonicalPath(rootPath);
    const relativePath = path.relative(canonicalRoot, canonicalPath);

    return relativePath === '' || (
        relativePath !== '..'
        && !relativePath.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relativePath)
    );
}

export function isPathWithin(filePath: string, rootPath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    if (!rootPath || typeof rootPath !== 'string') return false;

    try {
        return isCanonicalPathWithin(filePath, rootPath);
    } catch {
        return false;
    }
}

/**
 * 检查路径是否在允许的根目录范围内，防止路径遍历攻击
 * @param filePath - 待检查的文件路径
 * @param allowedRoots - 允许的根目录列表
 * @returns 是否为安全路径
 */
export function isSafePath(filePath: string, allowedRoots: string[]): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    if (!allowedRoots || allowedRoots.length === 0) return false;

    return allowedRoots.some(root => isPathWithin(filePath, root));
}

/**
 * 获取系统允许的音乐文件根目录列表
 * 包括所有盘符根目录（Windows）或 / （Unix）
 * 用于宽松模式：只要不是系统敏感目录即可
 */
export function getSafeMediaRoots(): string[] {
    if (process.platform === 'win32') {
        // Windows: 允许所有盘符，但排除系统目录
        const roots: string[] = [];
        for (let i = 65; i <= 90; i++) {
            roots.push(String.fromCharCode(i) + ':\\');
        }
        return roots;
    }
    return ['/'];
}

/**
 * 检查路径是否为系统敏感路径（黑名单模式）
 * @param filePath - 待检查的文件路径
 * @returns true 表示危险，应拒绝
 */
export function isDangerousPath(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return true;

    try {
        if (process.platform === 'win32') {
            const dangerousRoots = [
                'c:\\windows',
                'c:\\program files',
                'c:\\program files (x86)',
                'c:\\programdata',
                'c:\\users\\default',
            ];
            return dangerousRoots.some(root => isCanonicalPathWithin(filePath, root));
        } else {
            const dangerousRoots = ['/etc', '/sys', '/proc', '/boot', '/dev'];
            return dangerousRoots.some(root => isCanonicalPathWithin(filePath, root));
        }
    } catch {
        return true;
    }
}
