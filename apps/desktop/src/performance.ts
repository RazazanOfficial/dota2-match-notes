export interface PerformanceSample {frames:number;approximateFps:number;p95FrameMs:number;longTasks:number;longTaskMs:number;heapMiB:number|null;domNodes:number;durationMs:number}
export function samplePerformance(durationMs=5000):Promise<PerformanceSample>{
  return new Promise((resolve,reject)=>{
    if(document.visibilityState==="hidden"){reject(new Error("window_hidden"));return;}
    const frames:number[]=[],start=performance.now();let previous=start,raf=0,longTasks=0,longTaskMs=0,done=false;
    let observer:PerformanceObserver|undefined;
    const finish=(failed=false)=>{if(done)return;done=true;cancelAnimationFrame(raf);window.clearTimeout(timeout);document.removeEventListener("visibilitychange",visibility);observer?.disconnect();
      if(failed){reject(new Error("window_hidden"));return;}
      const sorted=[...frames].sort((a,b)=>a-b),elapsed=performance.now()-start;
      const memory=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory;
      resolve({frames:frames.length,approximateFps:Math.round(frames.length/elapsed*10000)/10,p95FrameMs:Math.round((sorted[Math.floor(sorted.length*.95)]||0)*10)/10,longTasks,longTaskMs:Math.round(longTaskMs),heapMiB:memory?Math.round(memory.usedJSHeapSize/1048576):null,domNodes:document.getElementsByTagName("*").length,durationMs:Math.round(elapsed)});
    };
    const visibility=()=>{if(document.visibilityState==="hidden")finish(true);};
    try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){longTasks++;longTaskMs+=entry.duration;}});observer.observe({entryTypes:["longtask"]});}catch{}
    const tick=(time:number)=>{frames.push(time-previous);previous=time;if(time-start>=durationMs)finish();else raf=requestAnimationFrame(tick);};
    const timeout=window.setTimeout(()=>finish(document.visibilityState==="hidden"),durationMs+1000);
    document.addEventListener("visibilitychange",visibility);raf=requestAnimationFrame(tick);
  });
}
