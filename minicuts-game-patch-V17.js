(function(){
  const LEVELS = [
    {level:1, pts:50, badge:'Panda Explorer', icon:'🌟', reward:'Small surprise / Mini gift'},
    {level:2, pts:100, badge:'Panda Adventurer', icon:'🏅', reward:'Special sticker / Treat'},
    {level:3, pts:150, badge:'Panda Hero', icon:'🦸', reward:'Mini gift upgrade'},
    {level:4, pts:200, badge:'Panda Superstar', icon:'⭐', reward:'Premium surprise'},
    {level:5, pts:250, badge:'Panda Legend', icon:'🔥', reward:'Big surprise gift'},
    {level:6, pts:300, badge:'Dragon Warrior', icon:'🐉', reward:'Top level reward'}
  ];
  const $ = id => document.getElementById(id);
  const safe = fn => { try { fn(); } catch(e) { console.warn('V17 patch:', e.message); } };

  function levelInfo(points){
    const pts = Number(points || 0);
    let current = {level:0, pts:0, badge:'Starter Panda', icon:'🐼', reward:'Start playing'};
    let next = null;
    for(const l of LEVELS){ if(pts >= l.pts) current = l; else { next = l; break; } }
    const base = current.pts || 0;
    const target = next ? next.pts : 300;
    const pct = target > base ? Math.min(100, Math.max(0, ((pts - base) / (target - base)) * 100)) : 100;
    return {pts, current, next, pct, needed: next ? Math.max(0, next.pts - pts) : 0};
  }

  function injectCss(){
    if($('v17Css')) return;
    const css = `
      .mem-grid{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:6px!important;margin-bottom:8px!important;}
      .mem-card{aspect-ratio:1!important;border-radius:10px!important;font-size:28px!important;min-height:64px!important;}
      @keyframes v17pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
      .v17-roadmap{margin:8px 0 10px;background:linear-gradient(135deg,#FFF7CC,#fff);border:2px solid rgba(255,214,0,.75);border-radius:16px;padding:12px 12px 16px;box-shadow:0 6px 18px rgba(0,0,0,.12);}
      .v17-road-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:18px;color:#0D47A1;}
      .v17-road-head strong{display:block;font-size:13px;font-weight:900;}
      .v17-road-head span{display:block;font-size:11px;font-weight:800;color:#FF8C00;margin-top:2px;}
      .v17-rank-mini{font-size:11px;font-weight:900;color:#1565C0;background:#EAF2FF;border-radius:999px;padding:5px 8px;white-space:nowrap;}
      .v17-road-track{position:relative;height:18px;background:#E5E7EB;border-radius:999px;margin:24px 6px 24px;}
      .v17-road-fill{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px;}
      .v17-marker{position:absolute;top:50%;transform:translate(-50%,-50%);text-align:center;z-index:3;}
      .v17-dot{width:30px;height:30px;border-radius:50%;background:#fff;border:3px solid #D1D5DB;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 3px 8px rgba(0,0,0,.15);}
      .v17-dot.done{border-color:#FF8C00;background:#FFF2B8;}
      .v17-m-label{font-size:10px;font-weight:900;color:#0D47A1;margin-top:4px;}
      .v17-m-pts{font-size:9px;font-weight:800;color:#6B7280;}
      .v17-road-next{font-size:12px;font-weight:900;color:#0D47A1;text-align:center;background:#F3F8FF;border-radius:10px;padding:6px;}
      .v17-mini-bar{height:6px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;margin-top:4px;}
      .v17-mini-fill{height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px;}
      .v17-mini-txt{font-size:9px;color:rgba(255,255,255,.65);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .v17-level-guide{background:rgba(255,255,255,.96);border-radius:14px;padding:12px;margin-top:10px;color:#0D47A1;box-shadow:0 4px 12px rgba(0,0,0,.12);}
      .v17-level-guide h3{margin:0 0 8px;font-size:16px;color:#0D47A1;}
      .v17-level-row{display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:10px;background:#F8FAFC;margin-bottom:7px;border:1px solid #E5E7EB;}
      .v17-level-icon{font-size:19px;width:24px;text-align:center;}
      .v17-level-title{font-size:12px;font-weight:900;color:#0D47A1;}
      .v17-level-desc{font-size:11px;line-height:1.3;color:#374151;margin-top:2px;}
      .v17-readable{font-size:12px!important;line-height:1.35!important;}
      @media(min-width:901px){
        .layout{display:block!important;width:100%!important;height:100vh!important;overflow:hidden!important;}
        .left-panel{position:fixed!important;left:0!important;top:0!important;bottom:0!important;width:290px!important;height:100vh!important;z-index:20!important;box-shadow:6px 0 18px rgba(0,0,0,.12)!important;overflow-y:auto!important;padding:14px!important;}
        .lb-sidebar{position:fixed!important;right:0!important;top:0!important;bottom:0!important;width:260px!important;height:100vh!important;z-index:20!important;box-shadow:-6px 0 18px rgba(0,0,0,.12)!important;}
        .game-area{position:fixed!important;left:290px!important;right:260px!important;top:0!important;bottom:0!important;width:auto!important;height:100vh!important;display:flex!important;justify-content:center!important;align-items:flex-start!important;padding:10px 8px!important;overflow-y:auto!important;}
      }
    `;
    const style = document.createElement('style');
    style.id = 'v17Css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function miniBar(points){
    const i = levelInfo(points);
    return `<div class="v17-mini-bar"><div class="v17-mini-fill" style="width:${i.pct}%"></div></div><div class="v17-mini-txt">L${i.current.level} ${i.current.badge}${i.next ? ' · '+i.needed+' pts to L'+i.next.level : ' · Max'}</div>`;
  }
  window.v17MiniBar = miniBar;

  function roadmapHtml(points){
    const info = levelInfo(points);
    const overallPct = Math.min(100, Math.max(0, (info.pts / 300) * 100));
    const markers = LEVELS.map(l => {
      const left = Math.min(100, Math.max(0, (l.pts / 300) * 100));
      const reached = info.pts >= l.pts;
      return `<div class="v17-marker" style="left:${left}%"><div class="v17-dot ${reached?'done':''}">${l.icon}</div><div class="v17-m-label">L${l.level}</div><div class="v17-m-pts">${l.pts}</div></div>`;
    }).join('');
    return `<div id="v17Roadmap" class="v17-roadmap"><div class="v17-road-head"><div><strong>${info.current.icon} Level ${info.current.level} · ${info.current.badge}</strong><span>${info.pts} pts total</span></div><div class="v17-rank-mini" id="v17RankMini">Rank loading...</div></div><div class="v17-road-track"><div class="v17-road-fill" style="width:${overallPct}%"></div>${markers}</div><div class="v17-road-next">${info.next ? info.needed+' points to Level '+info.next.level+' · '+info.next.badge : 'Top level reached 🎉'}</div></div>`;
  }

  function addRoadmap(){
    const nameEl = $('profileName');
    if(!nameEl || !window.player) return;
    const old = $('v17Roadmap');
    if(old) old.remove();
    nameEl.insertAdjacentHTML('afterend', roadmapHtml(Number(player.game_points||0)));
    renderRankMini();
  }

  function addLeftGuide(){
    const left = document.querySelector('.left-panel');
    if(!left || $('v17LevelGuide')) return;
    Array.from(left.querySelectorAll('*')).forEach(el => {
      if(['P','LI','DIV','SPAN'].includes(el.tagName)) el.classList.add('v17-readable');
    });
    const rows = LEVELS.map(l => `<div class="v17-level-row"><div class="v17-level-icon">${l.icon}</div><div><div class="v17-level-title">Level ${l.level} · ${l.badge} · ${l.pts} pts</div><div class="v17-level-desc">${l.reward}</div></div></div>`).join('');
    left.insertAdjacentHTML('beforeend', `<div id="v17LevelGuide" class="v17-level-guide"><h3>🏆 Level Roadmap</h3>${rows}</div>`);
  }

  async function getExactCount(url){
    const res = await fetch(url,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,Prefer:'count=exact'}});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const cr = res.headers.get('content-range') || '';
    const total = parseInt((cr.split('/')[1] || '0'),10);
    return isNaN(total) ? 0 : total;
  }
  async function refreshCurrentPlayer(){
    if(!player || !player.id) return;
    try{
      const rows = await sb('customers','GET',null,'select=id,name,mobile,game_points,best_memory_time&id=eq.'+encodeURIComponent(player.id)+'&limit=1');
      if(rows && rows.length) player = Object.assign(player, rows[0]);
    }catch(e){}
  }
  async function calculateGlobalRank(){
    await refreshCurrentPlayer();
    if(!player || !player.id) return null;
    const pts = Number(player.game_points || 0);
    const greater = await getExactCount(SB_URL+'/rest/v1/customers?select=id&game_points=gt.'+pts+'&limit=1');
    const total = await getExactCount(SB_URL+'/rest/v1/customers?select=id&game_points=not.is.null&limit=1');
    return {rank: greater+1, total: Math.max(total,1), points: pts};
  }
  async function renderRankMini(){
    const mini = $('v17RankMini');
    if(!mini) return;
    mini.textContent = 'Rank loading...';
    try{
      const r = await calculateGlobalRank();
      if(r) mini.textContent = 'Global #'+r.rank+' of '+r.total;
    }catch(e){ mini.textContent = 'Rank unavailable'; }
  }

  function patchRegister(){
    window.regGender = window.regGender || 'boy';
    window.setRegGender = function(g){
      window.regGender = g;
      const boy=$('regBoy'), girl=$('regGirl');
      if(boy){ boy.style.borderColor=g==='boy'?'#FFD600':'#E5E7EB'; boy.style.background=g==='boy'?'#FFF7CC':'#fff'; }
      if(girl){ girl.style.borderColor=g==='girl'?'#FFD600':'#E5E7EB'; girl.style.background=g==='girl'?'#FFF7CC':'#fff'; }
    };
    window.showRegMsg=function(msg,ok){const el=$('regMsg');if(!el)return;el.textContent=msg;el.style.display='block';el.style.background=(ok==='ok'||ok===true)?'#DCFCE7':'#FEE2E2';el.style.color=(ok==='ok'||ok===true)?'#166534':'#DC2626';};
    window.showLoginMsg=function(msg,ok){const el=$('loginMsg');if(!el)return;el.textContent=msg;el.style.display='block';el.style.background=(ok==='ok'||ok===true)?'#DCFCE7':'#FEE2E2';el.style.color=(ok==='ok'||ok===true)?'#166534':'#DC2626';};
    Array.from(document.querySelectorAll('button')).forEach(btn => {
      if(btn.textContent && btn.textContent.includes('Register') && !btn.textContent.includes('Play')) btn.onclick=()=>goToRegister('', '', 'Register below!');
    });
    window.doRegister = async function(){
      const name=$('regName').value.trim(), mobile=$('regMobile').value.trim(), parent=$('regParent').value.trim();
      const d=$('dobDay').value, m=$('dobMonth').value, y=$('dobYear').value;
      const dob=(y&&m&&d)?(y+'-'+m+'-'+d):null, gender=window.regGender||'boy';
      if(!name){showRegMsg("Please enter child's name",false);return;}
      if(mobile.length<7){showRegMsg('Please enter valid parent mobile',false);return;}
      if(!dob){showRegMsg('Date of birth is required! 🎂',false);return;}
      const btn=document.querySelector('#s-register .btn-y');
      if(btn){btn.disabled=true;btn.style.opacity='.65';btn.style.pointerEvents='none';btn.textContent='Registering... 🐼';}
      try{
        const res=await sb('customers','POST',{name,mobile,parent,dob,gender,stamps:0,redemptions:0,game_points:0,game_spins:0});
        player=Array.isArray(res)?res[0]:res; player.game_points=0; player.game_spins=0;
        showRegMsg('Welcome to MiniCuts! 🎉','ok'); if(btn) btn.textContent='Starting game... 🎮';
        spinCount=0; bestSpinPts=0; await checkTodaySessions(); await fetchGlobalBests(); setTimeout(()=>goProfile(),450);
      }catch(e){ showRegMsg('Error: '+e.message,false); if(btn){btn.disabled=false;btn.style.opacity='1';btn.style.pointerEvents='auto';btn.textContent='Register & Play! 🎮';} }
    };
  }

  function patchSidebar(){
    window.loadSidebarLb = async function(){
      try{
        await refreshCurrentPlayer();
        const rows = await sb('customers','GET',null,'select=id,name,mobile,game_points&order=game_points.desc&limit=10');
        sidebarData = rows || [];
        const listEl = $('sideLbList');
        if(listEl){
          if(!sidebarData.length) listEl.innerHTML='<div style="text-align:center;padding:16px;color:rgba(255,255,255,.35);font-size:11px;">No scores yet<br>Play to be first! 🎮</div>';
          else{
            const medals=['🥇','🥈','🥉'];
            listEl.innerHTML = sidebarData.map((c,i) => {
              const pts=c.game_points||0;
              const isMe=(player && player.id && c.id===player.id);
              const icon=medals[i] || '#'+(i+1);
              return `<div style="display:flex;align-items:flex-start;gap:7px;padding:7px 6px;margin-bottom:5px;border-radius:9px;background:${isMe?'rgba(255,214,0,.16)':'rgba(255,255,255,.055)'};border:1px solid ${isMe?'rgba(255,214,0,.35)':'rgba(255,255,255,.06)'};"><div style="font-size:15px;width:24px;text-align:center;font-weight:900;color:#FFD600;">${icon}</div><div style="flex:1;min-width:0;"><div class="sb-name">${c.name||'Player'}${isMe?' ⭐':''}</div>${miniBar(pts)}</div><div class="sb-pts">${pts}</div></div>`;
            }).join('');
          }
        }
        const rankEl=$('sideRankBadge');
        if(rankEl){
          rankEl.innerHTML='<div class="rank-badge"><div class="rank-badge-txt">Calculating global rank...</div></div>';
          const r = await calculateGlobalRank();
          if(r) rankEl.innerHTML='<div class="rank-badge"><div class="rank-badge-txt">Global rank: #'+r.rank+' of '+r.total+'</div><div style="font-size:10px;color:rgba(255,214,0,.7);">'+r.points+' pts total</div></div>';
        }
        renderRankMini();
      }catch(e){ console.warn('Sidebar error:',e.message); }
    };
    window.renderSidebar=()=>loadSidebarLb();
  }

  function patchMemory(){
    window.buildMemGrid=function(reveal){
      const symbols=['🌟','🎡','🎈','🍭'];
      const pairs=symbols.concat(symbols).sort(()=>Math.random()-.5);
      memCards=pairs;
      const grid=$('memGrid'); if(!grid) return;
      grid.innerHTML=pairs.map((e,i)=>`<div class="mem-card${reveal?' flipped':''}" id="mc${i}" onclick="flipCard(${i})">${reveal?e:'🐼'}</div>`).join('');
    };
    window.endMemory=async function(){
      clearInterval(memTimerInt); memStarted=false;
      let globalBestTime=null, globalBestName=null;
      try{
        const r=await fetch(SB_URL+'/rest/v1/customers?select=name,best_memory_time&best_memory_time=not.is.null&order=best_memory_time.asc&limit=50',{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});
        const rows=await r.json();
        const best=(Array.isArray(rows)?rows:[]).filter(c=>Number(c.best_memory_time)>0).sort((a,b)=>Number(a.best_memory_time)-Number(b.best_memory_time))[0];
        if(best){globalBestTime=Number(best.best_memory_time);globalBestName=best.name;}
      }catch(e){ if(globalBestMemory&&globalBestMemory.time){globalBestTime=Number(globalBestMemory.time);globalBestName=globalBestMemory.name;} }
      const isGlobalBest=!globalBestTime||memSeconds<globalBestTime;
      const isPersonalBest=!player.best_memory_time||memSeconds<Number(player.best_memory_time);
      const pts=8+(isGlobalBest?2:0);
      if(isPersonalBest) player.best_memory_time=memSeconds;
      if(isGlobalBest) globalBestMemory={time:memSeconds,name:player.name};
      const hintEl=$('memBestHint');
      if(hintEl){
        hintEl.style.display='block';
        if(isGlobalBest){ hintEl.innerHTML='<span style="font-size:18px;font-weight:900;">🏆 NEW ALL-TIME RECORD: '+memSeconds+'s!</span><br><span style="font-size:14px;">Fastest among all players. +2 bonus!</span>'; hintEl.style.background='rgba(22,163,74,.2)';hintEl.style.borderColor='rgba(22,163,74,.5)';hintEl.style.color='#4ADE80'; }
        else{ hintEl.innerHTML='<span style="font-size:16px;font-weight:900;">⏱️ Your time: '+memSeconds+'s</span><br><span style="font-size:13px;">All-time best is <strong>'+globalBestTime+'s</strong>'+(globalBestName?' by '+globalBestName:'')+'. Earned 8 pts.</span>'; hintEl.style.background='rgba(255,214,0,.15)';hintEl.style.borderColor='rgba(255,214,0,.3)';hintEl.style.color='var(--y)'; }
      }
      const btn=$('memStartBtn'); if(btn){btn.style.display='block';btn.textContent='See my '+pts+' pts! 🎉';btn.disabled=false;btn.onclick=()=>saveAndShowResult(pts,'memory');}
      savePoints(pts,'memory',isPersonalBest?memSeconds:null);
    };
  }

  function patchSpin(){
    function popup(earned){
      const old=$('spinPointsPopup'); if(old) old.remove();
      const overlay=document.createElement('div'); overlay.id='spinPointsPopup';
      overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML='<div style="background:#fff;border-radius:20px;padding:22px 22px;max-width:290px;width:100%;text-align:center;animation:v17pop .16s ease-out;box-shadow:0 14px 40px rgba(0,0,0,.35);"><div style="font-size:46px;margin-bottom:0;">🎉</div><div style="font-family:Baloo 2, Nunito, sans-serif;font-size:20px;font-weight:900;color:#0D47A1;margin-bottom:0;">Great Spin!</div><div style="font-family:Baloo 2, Nunito, sans-serif;font-size:46px;font-weight:900;color:#FF8C00;line-height:1;">+'+earned+'</div><div style="font-size:14px;font-weight:800;color:#1565C0;margin-top:4px;">points gained</div></div>';
      document.body.appendChild(overlay);
    }
    window.startSpin=function(){
      if(isSpinning) return; isSpinning=true;
      const spinBtn=$('spinBtn'), panda=$('pandaReact');
      if(spinBtn){spinBtn.disabled=true;spinBtn.textContent='Spinning... 🎡';spinBtn.onclick=null;}
      if(panda) panda.style.animation='jump 0.4s ease infinite';
      const startAngle=spinAngle||0, targetAngle=startAngle+(6+Math.random()*4)*2*Math.PI+Math.random()*2*Math.PI;
      const duration=4200, startedAt=performance.now(); let lastTick=0;
      const ease=t=>1-Math.pow(1-t,3);
      function animate(now){
        const progress=Math.min((now-startedAt)/duration,1);
        spinAngle=startAngle+(targetAngle-startAngle)*ease(progress); drawWheel(spinAngle);
        if(now-lastTick>120&&progress<.92){lastTick=now; try{soundSpin();}catch(e){}}
        if(progress<1){requestAnimationFrame(animate);return;}
        spinAngle=targetAngle; drawWheel(spinAngle); isSpinning=false; if(panda)panda.style.animation='';
        const arc=(2*Math.PI)/SEGS.length, norm=((spinAngle%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
        const idx=Math.floor((((-Math.PI/2-norm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)/arc)%SEGS.length;
        const earned=SEGS[idx].pts; bestSpinPts=earned; spinCount=1;
        const best=$('bestSoFar'), label=$('spinChanceLabel'); if(best)best.textContent=earned+'pts'; if(label)label.textContent='You won: '+earned+' pts!';
        if(panda)panda.textContent=earned>=13?'🤩':earned>=11?'😄':'😊'; try{soundSpinResult(earned);}catch(e){}
        if(spinBtn){spinBtn.disabled=true;spinBtn.textContent='Saved '+earned+' pts! 🎉';}
        popup(earned); savePoints(earned,'spin').catch(e=>console.warn('Spin save failed:',e.message));
        setTimeout(()=>{const old=$('spinPointsPopup');if(old)old.remove();goProfile();},450);
      }
      requestAnimationFrame(animate);
    };
    const btn=$('spinBtn'); if(btn){btn.disabled=false;btn.textContent='SPIN! 🎡';btn.onclick=startSpin;}
  }

  function patchResults(){ window.saveAndShowResult=async function(pts,gameType){ showResult(pts); }; }
  function patchProfile(){
    const oldRenderProfile=window.renderProfile;
    window.renderProfile=function(){ oldRenderProfile(); setTimeout(()=>{addRoadmap();addLeftGuide();},50); };
    const oldShowResult=window.showResult;
    window.showResult=function(pts){ oldShowResult(pts); setTimeout(addRoadmap,50); };
    const oldGoProfile=window.goProfile;
    window.goProfile=function(){ oldGoProfile(); setTimeout(()=>{addRoadmap();addLeftGuide();renderRankMini();},80); };
  }

  safe(injectCss); safe(patchRegister); safe(patchSidebar); safe(patchResults); safe(patchMemory); safe(patchSpin); safe(patchProfile);
  setTimeout(()=>{ safe(addRoadmap); safe(addLeftGuide); safe(renderRankMini); },700);
})();