import { webcrypto } from 'node:crypto';

// 如果没有全局 crypto，添加一个 polyfill
if (!global.crypto) {
  global.crypto = webcrypto as any;
}