import React, { useState, useEffect } from 'react';
import { decodedAudioCache } from '../../lib/decodedAudioCache';

export function AudioWaveform({ url }: { url?: string }) {
   const [peaks, setPeaks] = useState<number[]>([]);
   
   useEffect(() => {
       if (!url) {
           const p = [];
           for(let i=0; i<40; i++) p.push(20 + (Math.sin(i * 0.5) * 40 + 40));
           setPeaks(p);
           return;
       }
       
       let isCancelled = false;
       decodedAudioCache.acquire(url)
         .then(audioBuf => {
             if (isCancelled) return;
             const channelData = audioBuf.getChannelData(0);
             const step = Math.max(1, Math.ceil(channelData.length / 80));
             const p = [];
             for(let i=0; i<80; i++) {
                 let min = 1.0;
                 let max = -1.0;
                 const start = i * step;
                 const end = Math.min(channelData.length, start + step);
                 for (let j=start; j<end; j++) {
                     const val = channelData[j];
                     if (val < min) min = val;
                     if (val > max) max = val;
                 }
                 p.push(Math.max(10, Math.abs(max - min) * 100));
             }
             setPeaks(p);
         })
         .catch(() => {
             if(!isCancelled) {
                 const p = [];
                 for(let i=0; i<80; i++) p.push(20 + (Math.sin(i * 0.5) * 40 + 40));
                 setPeaks(p);
             }
         });
         
       return () => {
         isCancelled = true;
         decodedAudioCache.release(url);
         decodedAudioCache.evictReleased();
       };
   }, [url]);

   return (
       <div className="w-full h-full object-cover px-1 flex items-center justify-between gap-[1px]">
          {peaks.map((p, i) => (
             <div key={i} className="flex-1 bg-black/60 dark:bg-white/80 rounded-full transition-all" style={{ height: `${p}%` }} />
          ))}
       </div>
   );
}
