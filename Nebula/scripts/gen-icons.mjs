import { writeFileSync } from 'fs';

function svgIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#000000"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.35}" fill="#7c3aed" opacity="0.8"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.22}" fill="#a78bfa" opacity="0.9"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.10}" fill="#ffffff" opacity="1"/>
</svg>`;
}

writeFileSync('public/icon-192.svg', svgIcon(192));
writeFileSync('public/icon-512.svg', svgIcon(512));

console.log('SVG icons written to public/');
console.log('Convert to PNG manually or use an online SVG→PNG tool');
console.log('https://svgtopng.com — upload both files');