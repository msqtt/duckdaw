import React, { useRef, useEffect, useState } from 'react';
import * as Tone from 'tone';

export function MasterVisualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<'waveform' | 'fft'>('waveform');

    useEffect(() => {
        const analyser = new Tone.Analyser(mode, 128);
        Tone.getDestination().connect(analyser);

        let animationId: number;
        
        const draw = () => {
            animationId = requestAnimationFrame(draw);
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const values = analyser.getValue();
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (mode === 'waveform') {
                ctx.beginPath();
                ctx.strokeStyle = '#10b981'; // emerald-500
                ctx.lineWidth = 2;
                
                for (let i = 0; i < values.length; i++) {
                    const x = (i / values.length) * canvas.width;
                    const v = values[i] as number; 
                    // v is mostly between -1 and 1
                    const y = (0.5 - v * 0.5) * canvas.height;
                    
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            } else {
                ctx.fillStyle = '#10b981';
                const barWidth = canvas.width / values.length;
                for (let i = 0; i < values.length; i++) {
                    const x = i * barWidth;
                    // value is in decibels from -100 to 0 usually
                    const db = values[i] as number;
                    // map -100 to 0 -> 0 to 1
                    const normalized = Math.max(0, (db + 100) / 100);
                    const h = normalized * canvas.height;
                    ctx.fillRect(x, canvas.height - h, barWidth - 1, h);
                }
            }
        };

        draw();

        return () => {
            cancelAnimationFrame(animationId);
            analyser.dispose();
        };
    }, [mode]);

    return (
        <div 
           className="relative group bg-neutral-200 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 w-48 h-8 flex-shrink-0 overflow-hidden cursor-pointer rounded grid place-items-center" 
           onClick={() => setMode(m => m === 'waveform' ? 'fft' : 'waveform')} 
           title={`Visualizer: ${mode.toUpperCase()} (Click to toggle)`}
        >
           <canvas ref={canvasRef} width={192} height={32} className="w-full h-full block" />
        </div>
    );
}
