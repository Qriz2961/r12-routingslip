#!/usr/bin/env node
/* Inline data.js, engine.js and app.js into index.html to produce a single
 * self-contained page. Used for offline distribution and for embedding the app
 * where only one file can be served.
 *
 *   node t4cast/build-standalone.js [outfile] [--fragment]
 *
 * --fragment omits the doctype/html/head/body wrapper and the PWA hooks,
 * emitting just <title> + <style> + markup + <script>, for hosts that supply
 * their own document skeleton.
 */
var fs = require('fs');
var path = require('path');

var dir = __dirname;
var args = process.argv.slice(2);
var fragment = args.indexOf('--fragment') !== -1;
var out = args.filter(function (a) { return a.charAt(0) !== '-'; })[0] ||
          path.join(dir, 'routecast-standalone.html');

var html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
var js = ['data.js', 'engine.js', 'app.js'].map(function (f) {
  return '<script>\n/* ===== ' + f + ' ===== */\n' +
         fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script>/gi, '<\\/script>') +
         '\n</script>';
}).join('\n');

// swap the three external <script src> tags for the inlined sources
html = html.replace(
  /<script src="data\.js"><\/script>\s*<script src="engine\.js"><\/script>\s*<script src="app\.js"><\/script>/,
  js);
if (html.indexOf('/* ===== app.js ===== */') === -1) {
  console.error('Could not find the script tags to inline — did index.html change?');
  process.exit(1);
}

if (fragment) {
  // drop the document skeleton and anything that needs sibling files
  html = html.replace(/<link rel="manifest"[^>]*>\s*/, '')
             .replace(/<link rel="icon"[^>]*>\s*/, '')
             .replace(/^[\s\S]*?<title>/, '<title>')
             .replace(/<\/head>\s*<body>\s*/, '\n')
             .replace(/\s*<\/body>\s*<\/html>\s*$/, '\n');
  // the service worker lives in a sibling file that a fragment host will not have
  html = html.replace(
    /\s*if \('serviceWorker' in navigator\) \{[\s\S]*?\n    \}\n/,
    '\n');
  if (/serviceWorker/.test(html)) {
    console.error('Service worker registration was not removed from the fragment build.');
    process.exit(1);
  }
}

fs.writeFileSync(out, html);
console.log('wrote ' + out + '  (' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB' +
            (fragment ? ', fragment' : ', full document') + ')');
