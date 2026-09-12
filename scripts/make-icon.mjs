import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
// Small code-native tray glyph: cream paw on a sage circle.
const size = 32, pixels = Buffer.alloc((size * 4 + 1) * size);
const spots = [[16,20,6,4.6],[8.5,13,2.5,3.2],[14,9.5,2.5,3.2],[20.4,10,2.5,3.2],[25,15,2.2,3]];
for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
  const i=y*(size*4+1)+1+x*4;
  const inside=Math.hypot(x-15.5,y-15.5)<15.4;
  const paw=spots.some(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<1);
  const color=paw?[249,250,231]:[105,133,86];
  pixels.set([...color,inside?255:0],i);
}
function crc(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type), length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);}
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
writeFileSync(new URL('../public/tray.png',import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
