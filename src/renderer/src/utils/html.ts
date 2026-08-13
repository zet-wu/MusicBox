/**
 * 转义双引号属性值中的特殊字符。
 */
export function escapeHtmlAttribute(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
