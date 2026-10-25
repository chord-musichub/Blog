(function(){
  'use strict';
  // Cached log bands, one canvas and no continuous DOM/layout work in the frame loop.
  function createRenderer(options){
    var root=options.root,canvas=options.canvas,ctx=options.ctx;
    if(!root || !canvas || !ctx) return null;
    var width=0,height=0,dpr=1,dirty=true,raf=0,running=false,last=0,settleUntil=0;
    var budget=null,count=0,rate=0,bins=0,gradient=null,baseline=0,barStep=0;
    var smooth=new Float32Array(80),peaks=new Float32Array(80);
    var firstBin=new Uint16Array(80),endBin=new Uint16Array(80),waveIndex=new Uint16Array(241);
    var waveLength=0,points=0,live=false,smoothedEnergy=0,lastPulse=0,pulse=1;
    var cover=root.querySelector('[data-av-cover]');
    var palette={ink:'#49bfba',warm:'#f0a5c6',line:'rgba(51,85,92,.18)'};
    var motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
    var resizeObserver=window.ResizeObserver?new ResizeObserver(invalidate):null;
    var themeObserver=new MutationObserver(invalidate);
    var stateObserver=new MutationObserver(stateChanged);
    var drawCost=0,slowFrames=0,fastFrames=0,throttled=false;

    function wake(){if(running && !document.hidden && !raf)raf=requestAnimationFrame(frame);}
    function invalidate(){dirty=true;wake();}
    function stateChanged(){
      var next=root.classList.contains('is-playing');
      if(live && !next)settleUntil=performance.now()+450;
      if(!live && next){last=0;settleUntil=0;}
      live=next;
      invalidate();
    }
    function resize(){
      if(!dirty && width && height)return;
      var rect=canvas.getBoundingClientRect();
      var w=Math.max(1,Math.floor(rect.width)),h=Math.max(1,Math.floor(rect.height));
      budget=options.perfBudget();
      var pixelRatio=Math.min(window.devicePixelRatio || 1,budget.dpr);
      if(w!==width || h!==height || dpr!==pixelRatio){
        width=w;height=h;dpr=pixelRatio;
        canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);
        ctx.setTransform(dpr,0,0,dpr,0,0);
        count=budget.low?48:80;barStep=width/count;baseline=height*.72;
        rate=0;waveLength=0;
      }
      var css=getComputedStyle(root);
      palette.ink=css.getPropertyValue('--av-accent').trim() || palette.ink;
      palette.warm=css.getPropertyValue('--av-highlight').trim() || palette.warm;
      palette.line=css.getPropertyValue('--av-line').trim() || palette.line;
      gradient=ctx.createLinearGradient(0,0,width,baseline);
      gradient.addColorStop(0,palette.ink);gradient.addColorStop(.55,palette.ink);gradient.addColorStop(1,palette.warm);
      dirty=false;
    }
    function prepareBands(data){
      var sampleRate=data.sampleRate || 48000,length=data.freqData?data.freqData.length:0;
      if(rate!==sampleRate || bins!==length){
        rate=sampleRate;bins=length;
        var maxHz=Math.min(20000,rate/2);
        for(var i=0;i<count;i++){
          var lo=20*Math.pow(maxHz/20,i/count),hi=20*Math.pow(maxHz/20,(i+1)/count);
          firstBin[i]=Math.min(length,Math.floor(lo/(rate/2)*length));
          endBin[i]=Math.min(length,Math.max(firstBin[i]+1,Math.ceil(hi/(rate/2)*length)));
        }
      }
      var n=data.waveData?data.waveData.length:0;
      if(waveLength!==n){
        waveLength=n;points=Math.min(240,Math.floor(width));
        for(var p=0;p<=points;p++)waveIndex[p]=Math.max(0,Math.min(n-1,Math.floor(p/points*n)));
      }
    }
    function frame(now){
      raf=0;
      if(!running || document.hidden)return;
      var reduced=motionQuery.matches;
      var interval=reduced?125:throttled?1000/30:budget?budget.interval:1000/60;
      if(!dirty && last && now-last<interval-.8){wake();return;}
      var started=performance.now(),dt=last?Math.min(100,now-last):interval;
      // Retain timing remainder; a 60 Hz display must not round 40 ms to 50 ms.
      var elapsed=last?now-last:interval;
      var periods=Math.max(1,Math.floor((elapsed+.8)/interval));
      last=now-Math.max(0,elapsed-periods*interval);
      resize();
      var data=options.getAudioData(),freq=data.freqData,wave=data.waveData;
      prepareBands(data);
      if(live && data.analyser && freq && wave){
        data.analyser.getByteFrequencyData(freq);data.analyser.getByteTimeDomainData(wave);
      }
      ctx.clearRect(0,0,width,height);
      ctx.fillStyle=gradient;
      var bass=0,blend=1-Math.exp(-dt/(live?55:90));
      var moving=live || now<settleUntil;
      for(var i=0;i<count;i++){
        var value=0;
        if(live && freq){for(var j=firstBin[i];j<endBin[i];j++)value=Math.max(value,freq[j]/255);}
        smooth[i]=moving?smooth[i]+(value-smooth[i])*blend:0;
        peaks[i]=moving?Math.max(smooth[i],peaks[i]-dt*.0006):0;
        if(i<count*.24)bass+=smooth[i];
        var h=Math.max(1.5,smooth[i]*height*.66),x=i*barStep,bw=Math.max(1,barStep-2);
        ctx.globalAlpha=.5+smooth[i]*.5;
        ctx.fillRect(x,baseline-h,bw,h);
        ctx.globalAlpha=.7;ctx.fillRect(x,baseline-peaks[i]*height*.66-4,bw,1.5);
        if(!budget.low){ctx.globalAlpha=.08;ctx.fillRect(x,baseline+5,bw,h*.1);}
      }
      ctx.globalAlpha=1;ctx.beginPath();ctx.strokeStyle=gradient;ctx.lineWidth=1.5;
      var center=height*.94;
      for(var p=0;p<=points;p++){
        var amplitude=live && wave?(wave[waveIndex[p]]-128)/128:0;
        var xWave=p/Math.max(1,points)*width,yWave=center+amplitude*height*.08;
        if(!p)ctx.moveTo(xWave,yWave);else ctx.lineTo(xWave,yWave);
      }
      ctx.stroke();
      // Beat updates affect the artwork subtree only, not inherited variables on the whole page.
      if(cover && now-lastPulse>=80){
        lastPulse=now;
        smoothedEnergy+=(bass/Math.max(1,Math.ceil(count*.24))-smoothedEnergy)*(1-Math.exp(-dt/160));
        var nextPulse=live && !reduced?1+smoothedEnergy*.035:1;
        if(Math.abs(nextPulse-pulse)>.001 || nextPulse===1 && pulse!==1){
          pulse=nextPulse;cover.style.transform='scale('+pulse.toFixed(4)+')';
        }
      }
      options.updateLocalAudioMeta(now);
      // Actual drawing cost, not merely device hints. Hysteresis avoids oscillating quality.
      drawCost=drawCost*.9+(performance.now()-started)*.1;
      if(live && !reduced){
        if(drawCost>5){slowFrames++;fastFrames=0;}else if(drawCost<2){fastFrames++;slowFrames=0;}else{slowFrames=0;fastFrames=0;}
        if(slowFrames>=30){throttled=true;slowFrames=0;}
        if(throttled && fastFrames>=180){throttled=false;fastFrames=0;}
      }
      if(live || now<settleUntil)wake();
    }
    function start(){
      if(!running){
        running=true;dirty=true;last=0;
        if(resizeObserver)resizeObserver.observe(canvas);
        themeObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
        stateObserver.observe(root,{attributes:true,attributeFilter:['class']});
        if(motionQuery.addEventListener)motionQuery.addEventListener('change',invalidate);
      }
      stateChanged();
    }
    function stop(){
      running=false;if(raf)cancelAnimationFrame(raf);raf=0;
      if(resizeObserver)resizeObserver.disconnect();themeObserver.disconnect();stateObserver.disconnect();
      if(motionQuery.removeEventListener)motionQuery.removeEventListener('change',invalidate);
    }
    function handleVisibility(hidden){
      if(hidden){if(raf)cancelAnimationFrame(raf);raf=0;}
      else if(running){last=0;invalidate();}
    }
    function syncVisualPhase(){last=0;}
    function softenAnimationResume(){syncVisualPhase();invalidate();}
    return {resize:resize,start:start,stop:stop,invalidate:invalidate,handleVisibility:handleVisibility,syncVisualPhase:syncVisualPhase,softenAnimationResume:softenAnimationResume};
  }
  window.SonglineCreateAudioVisualizerRenderer=createRenderer;
})();
