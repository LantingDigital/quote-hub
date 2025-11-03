// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// [FIX (TASK 2.2.2)]: Add TextEncoder/TextDecoder polyfills
// This is required by Firebase v9+ auth and is not
// included in JSDOM (Jest's test environment).
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// [FIX 2 (TASK 2.2.2)]: Add ReadableStream polyfill
// This is also required by Firebase/Undici and not in JSDOM.
import { ReadableStream } from 'stream/web';
global.ReadableStream = ReadableStream;
