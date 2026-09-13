import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
// Code-native app/tray mark: a cream paw in a sage speech bubble.
// Supersample each target size instead of enlarging a 32px tray bitmap.
const spots = [[16,20,5.5,4.4],[8.8,13,2.4,3],[14,9.6,2.4,3],[20.1,10.1,2.4,3],[24.4,14.4,2.2,2.8]];
function crc(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type), length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);}
function png(size) {
  const pixels=Buffer.alloc((size*4+1)*size),samples=4;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const sum=[0,0,0];let coverage=0;
    for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
      const px=(x+(sx+.5)/samples)/size*32,py=(y+(sy+.5)/samples)/size*32;
      const circle=Math.hypot(px-16,py-15.2)<14.3;
      const tail=py>=22&&py<=30&&px>=5&&px<=14-(py-22)*.85;
      if(!circle&&!tail)continue;
      const paw=spots.some(([cx,cy,rx,ry])=>((px-cx)/rx)**2+((py-cy)/ry)**2<1);
      const t=Math.min(1,py/30),color=paw?[250,250,234]:[125-39*t,155-40*t,106-32*t];
      coverage++;for(let c=0;c<3;c++)sum[c]+=color[c];
    }
    const i=y*(size*4+1)+1+x*4;
    if(coverage)pixels.set([...sum.map(v=>Math.round(v/coverage)),Math.round(255*coverage/(samples*samples))],i);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
const sizes=[16,24,32,48,64,128,256],images=sizes.map(png);
const header=Buffer.alloc(6);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=6+16*sizes.length;
const entries=sizes.map((size,i)=>{const entry=Buffer.alloc(16);entry[0]=entry[1]=size===256?0:size;entry.writeUInt16LE(1,4);entry.writeUInt16LE(32,6);entry.writeUInt32LE(images[i].length,8);entry.writeUInt32LE(offset,12);offset+=images[i].length;return entry;});
mkdirSync(new URL('../assets/',import.meta.url),{recursive:true});
writeFileSync(new URL('../assets/icon.ico',import.meta.url),Buffer.concat([header,...entries,...images]));
writeFileSync(new URL('../public/app-icon.png',import.meta.url),images.at(-1));
writeFileSync(new URL('../public/tray.png',import.meta.url),images[2]);
