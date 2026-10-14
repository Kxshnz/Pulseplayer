(() => {
  const $ = id => document.getElementById(id);
  const audio = $('audio');
  if (!audio || !$('lyrics-file')) return;
  let entries = [], activeIndex = -1, mode = 'cinematic', savedLyrics = {};
  const storeKey = 'pulse-player-lyrics-v1';
  try { savedLyrics = JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch {}
  const titleNow = () => $('player-title')?.textContent || 'Untitled';
  const artistNow = () => $('player-artist')?.textContent || 'Unknown artist';
  const keyNow = () => `${titleNow()}::${artistNow()}`;
  const timeToMs = s => { const m = String(s).match(/(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?/); if (!m) return null; return (+m[1]*60 + +m[2])*1000 + +(String(m[3]||'0').padEnd(3,'0').slice(0,3)); };
  function parseLrc(raw) {
    const out=[];
    for (const sourceLine of raw.split(/\r?\n/)) {
      const stamps=[...sourceLine.matchAll(/\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g)];
      if (!stamps.length) continue;
      const body=sourceLine.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g,'').trim();
      if (!body) continue;
      const words=[]; const token=/<(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)>([^<]+)/g; let match;
      while((match=token.exec(body))!==null){ const ms=timeToMs(match[1]); if(ms!==null) words.push({time:ms/1000,text:match[2]}); }
      const clean=body.replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g,'').trim();
      for(const stamp of stamps){const time=timeToMs(stamp[1]);if(time!==null)out.push({time:time/1000,text:clean,words});}
    }
    return out.sort((a,b)=>a.time-b.time);
  }
  function renderEmpty(message='Import a timed lyrics file') {
    $('lyrics-content').innerHTML=`<p class="lyric-line muted">Let the music find its words.</p><p class="lyric-line active">${message}</p><p class="lyric-line muted">to follow along with the song.</p>`;
  }
  function syncTrackMeta(){
    const title=titleNow(), artist=artistNow(), cover=$('player-cover')?.src || '';
    $('lyrics-track-title').textContent=title; $('lyrics-track-artist').textContent=artist; $('lyrics-cover').src=cover; $('lyrics-backdrop').style.backgroundImage=`linear-gradient(90deg,#100e12ed,#100e12d9 54%,#100e12c9),url("${cover}")`;
    const cached=savedLyrics[keyNow()];
    if(cached?.length){entries=cached;activeIndex=-1;$('lyrics-sync-state').textContent='LYRICS READY';drawLines(-1);} else {entries=[];activeIndex=-1;$('lyrics-sync-state').textContent='LYRICS NOT LOADED';renderEmpty();}
  }
  function drawLines(index){
    const root=$('lyrics-content');
    root.replaceChildren();
    if(!entries.length){renderEmpty();return;}
    entries.forEach((entry,i)=>{
      const p=document.createElement('p');
      p.className='lyric-line'+(i===index?' active':Math.abs(i-index)===1?' near':' muted');
      p.dataset.index=String(i);
      p.tabIndex=0;
      p.setAttribute('role','button');
      p.setAttribute('aria-label',`Play from ${Math.floor(entry.time/60)}:${String(Math.floor(entry.time%60)).padStart(2,'0')} — ${entry.text}`);
      if(mode==='karaoke' && entry.words?.length){
        for(let w=0;w<entry.words.length;w++){
          const span=document.createElement('span');span.className='lyric-word';span.dataset.time=entry.words[w].time;span.textContent=entry.words[w].text;p.append(span);
          if(w<entry.words.length-1)p.append(document.createTextNode(' '));
        }
      } else p.textContent=entry.text;
      const seekToLine=()=>{
        // Apply the highlight immediately; update() alone won't repaint when
        // activeIndex already equals the clicked line.
        audio.currentTime=entry.time;
        activeIndex=i;
        updateLineStates(i,true);
        audio.play().catch(()=>{});
      };
      p.addEventListener('click',seekToLine);
      p.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();seekToLine();}});
      root.append(p);
    });
    updateLineStates(index,false);
  }
  function updateLineStates(index, scrollActive=true){
    const root=$('lyrics-content');
    const lines=[...root.querySelectorAll('.lyric-line[data-index]')];
    lines.forEach((line,i)=>{
      line.classList.toggle('active',i===index);
      line.classList.toggle('near',Math.abs(i-index)===1);
      line.classList.toggle('muted',Math.abs(i-index)>1);
      if(i===index && mode==='karaoke' && entries[i]?.words?.length){
        const words=[...line.querySelectorAll('.lyric-word')];
        words.forEach((el,n)=>{const begin=entries[i].words[n]?.time ?? Infinity;const finish=entries[i].words[n+1]?.time ?? (entries[i+1]?.time ?? begin+1);el.classList.toggle('sung',audio.currentTime>=begin && audio.currentTime<finish);});
      }
    });
    if(scrollActive && index>=0){
      const active=lines[index];
      if(active){
        // Keep the active lyric centered vertically inside the lyrics viewport.
        // Use viewport rectangles so nested layout/padding cannot offset the calculation.
        const rootRect=root.getBoundingClientRect();
        const lineRect=active.getBoundingClientRect();
        const delta=(lineRect.top-rootRect.top)+(lineRect.height/2)-(root.clientHeight/2);
        root.scrollTo({top:root.scrollTop+delta,behavior:'smooth'});
      }
    }
  }
  function update(){
    if(!entries.length || !Number.isFinite(audio.currentTime))return;
    let i=-1;for(let n=0;n<entries.length;n++){if(entries[n].time<=audio.currentTime)i=n;else break;}
    if(i!==activeIndex){activeIndex=i;updateLineStates(i,true);}
    else if(i>=0 && mode==='karaoke' && entries[i].words?.length)updateLineStates(i,false);
  }
  $('lyrics-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const parsed=parseLrc(await file.text());if(!parsed.length){$('lyrics-sync-state').textContent='FILE NOT RECOGNISED';renderEmpty('No timed lyrics found');return;}entries=parsed;activeIndex=-1;savedLyrics[keyNow()]=entries;try{localStorage.setItem(storeKey,JSON.stringify(savedLyrics));}catch{}$('lyrics-sync-state').textContent=entries.some(x=>x.words.length)?'WORD TIMING AVAILABLE':'LINE SYNC READY';drawLines(-1);update();$('lyrics-room').scrollIntoView({behavior:'smooth',block:'start'});}catch{$('lyrics-sync-state').textContent='COULD NOT READ FILE';}e.target.value='';});
  $('lyrics-mode-cinematic').addEventListener('click',()=>{mode='cinematic';$('lyrics-mode-cinematic').classList.add('active');$('lyrics-mode-karaoke').classList.remove('active');$('lyrics-stage').classList.remove('karaoke-mode');drawLines(activeIndex);});
  $('lyrics-mode-karaoke').addEventListener('click',()=>{mode='karaoke';$('lyrics-mode-karaoke').classList.add('active');$('lyrics-mode-cinematic').classList.remove('active');$('lyrics-stage').classList.add('karaoke-mode');drawLines(activeIndex);});
  audio.addEventListener('timeupdate',update);
  const observer=new MutationObserver(()=>{if($('player-title').textContent!==$('lyrics-track-title').textContent || $('player-artist').textContent!==$('lyrics-track-artist').textContent)syncTrackMeta();});
  observer.observe($('player-title'),{childList:true,characterData:true,subtree:true});observer.observe($('player-artist'),{childList:true,characterData:true,subtree:true});
  $('player-cover').addEventListener('load',()=>{if($('lyrics-track-title').textContent===titleNow())$('lyrics-backdrop').style.backgroundImage=`linear-gradient(90deg,#100e12ed,#100e12d9 54%,#100e12c9),url("${$('player-cover').src}")`;});
  syncTrackMeta();
})();