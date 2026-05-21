// Browser stub for the optional `re2` native module that email-reply-parser
// tries to require. The library's regex.js wraps `require('re2')` in a
// try/catch and falls back to native RegExp when the require throws — but
// Vite/Rollup can't see inside the try/catch and embeds a runtime-throwing
// stub at the require site, crashing module init before the catch fires.
// Resolving `re2` to this empty object means `typeof RE2 === 'function'`
// returns false and the library uses RegExp, which is what we want in a
// browser anyway.
export default {};
