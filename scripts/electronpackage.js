const process = require('process');
const path = require('path');
const electronPackager = require('electron-packager');

const baseDir = path.join(__dirname, '..');

//include parametrized build
const args = process.argv.slice(2);
const re = /\-\-([\w|\d]*)\=([\w|\d]*)/;
let obj = {};
args.forEach(e => {
    const ar = e.match(re);
    obj[ar[1]] = ar[2];
})

console.log('PARAMS: ', obj);

electronPackager({
  ...obj,
  dir: baseDir,
  out: path.join(baseDir, 'build'),
  icon: path.join(baseDir, 'public/images/icon'),
  //all: process.argv.includes('--all'),
  asar: true,
  overwrite: true,
  ignore: [
    /^\/(?:[^/]+?\/)*(?:\..+|.+\.less)$/, // dot-files and less files anywhere
    /^\/(?:\..+|assets|clicktests|coverage|dist|scripts|test)\//, // folders in root
    /^\/[^/]+?\.(?:js|md|png|tgz|yml)$/, // files in root
    /^\/public\/(?:source|vendor)\//, // folders in /public
  ],
});