/**
 * MusicBox renderer entry.
 */

import '@utils/index.js';
import '@api/api';

import '@utils/md5';
import '@utils/shortcuts/ShortcutConfig';
import '@utils/shortcuts/ShortcutRecorder';

import '@extensions/core/Lifecycle.js';
import '@extensions/core/Event.js';
import '@extensions/core/Instantiation.js';
import '@extensions/core/ExtensionsRegistry.js';
import '@extensions/core/ExtensionActivator.js';
import '@extensions/core/ExtensionService.js';
import '@extensions/core/index.js';

import '@extensions/api/index.js';

import './app';

console.log('✅ MusicBox 应用已通过 Vite 加载完成');
