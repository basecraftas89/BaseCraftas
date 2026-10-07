(() => {
  'use strict';
  window.TOTONOE_ATTACH_PLAYBACK = async (video,lesson,onComplete,onError) => {
    const client=window.TOTONOE_DELIVERY;
    let session=await client.api('/lessons/'+encodeURIComponent(lesson.id)+'/playback',{});
    let watched=session.resumeSeconds;
    let pending=null;
    let stopped=false;
    let lastAttempt=null;
    const resume=()=>{if(session.resumeSeconds>0)video.currentTime=Math.min(session.resumeSeconds,video.duration||session.durationSeconds);};
    if(video.readyState>=1)resume();else video.addEventListener('loadedmetadata',resume,{once:true});
    if(session.videoCompletedAt)onComplete();
    video.addEventListener('seeking',()=>{if(video.currentTime>watched+0.5)video.currentTime=watched;});
    video.addEventListener('timeupdate',()=>{if(!video.seeking)watched=Math.max(watched,video.currentTime);});
    video.addEventListener('ratechange',()=>{if(video.playbackRate>2)video.playbackRate=2;});
    async function send(ended=false) {
      if(stopped)return;
      if(pending){await pending;if(ended && !stopped)return send(true);return;}
      const position=Math.min(video.currentTime,session.durationSeconds);
      const attempt=lastAttempt || {sequence:session.sequence+1,positionSeconds:position,ended};
      lastAttempt=attempt;
      pending=(async()=>{
        try {
          const result=await client.api('/playback/'+encodeURIComponent(session.sessionId),attempt);
          session.sequence=result.sequence;lastAttempt=null;
          if(result.videoCompletedAt)onComplete();
        }catch(error){stopped=true;video.pause();onError(error);}
        finally{pending=null;}
      })();
      await pending;
    }
    const timer=setInterval(()=>{if(!video.paused && !video.seeking)send();},15000);
    video.addEventListener('play',()=>send());
    video.addEventListener('pause',()=>{if(!video.ended && !stopped)send();});
    video.addEventListener('ended',()=>send(true));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();});
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    return {send};
  };
})();
