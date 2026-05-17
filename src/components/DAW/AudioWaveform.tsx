import React, { useState, useEffect } from 'react';

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
       const ctx = new window.AudioContext();
       fetch(url)
         .then(res => res.arrayBuffer())
         .then(buf => ctx.decodeAudioData(buf))
         .then(audioBuf => {
             if (isCancelled) return;
             const channelData = audioBuf.getChannelData(0);
             const step = Math.ceil(channelData.length / 80); // higher res
             const p = [];
             for(let i=0; i<80; i++) {
                 let min = 1.0;
                 let max = -1.0;
                 for (let j=0; j<step; j++) {
                     const val = channelData[i*step + j];
                     if (val < min) min = val;
                     if (val > max) max = val;
                 }
                 p.push(Math.max(10, Math.abs(max - min) * 100));
             }
             setPeaks(p);
             ctx.close();
         })
         .catch((err) => {
             if(!isCancelled) {
                 const p = [];
                 for(let i=0; i<80; i++) p.push(20 + (Math.sin(i * 0.5) * 40 + 40));
                 setPeaks(p);
             }
             ctx.close();
         });
         
       return () => { isCancelled = true; };
   }, [url]);

   return (
       <div className="w-full h-full object-cover px-1 flex items-center justify-between gap-[1px]">
          {peaks.map((p, i) => (
             <div key={i} className="flex-1 bg-black dark:bg-white rounded-full transition-all" style={{ height: `${p}%` }} />
          ))}
       </div>
   );
}
