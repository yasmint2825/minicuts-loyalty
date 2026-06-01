(function(){
  function byId(id){ return document.getElementById(id); }
  function safe(fn){ try{ fn(); }catch(e){ console.warn('V16 patch:', e.message); } }

  var LEVELS = [
    {level:1, pts:50,  badge:'Panda Explorer',   icon:'🌟', reward:'Small surprise / Mini gift'},
    {level:2, pts:100, badge:'Panda Adventurer', icon:'🏅', reward:'Special sticker / Treat'},
    {level:3, pts:150, badge:'Panda Hero',       icon:'🦸', reward:'Mini gift upgrade'},
    {level:4, pts:200, badge:'Panda Superstar',  icon:'⭐', reward:'Premium surprise'},
    {level:5, pts:250, badge:'Panda Legend',     icon:'🔥', reward:'Big surprise gift'},
    {level:6, pts:300, badge:'Dragon Warrior',   icon:'🐉', reward:'Top level reward'}
  ];

  function levelInfo(points){
    var pts = Number(points || 0);
    var current = {level:0, pts:0, badge:'Starter Panda', icon:'🐼', reward:'Start playing'};
    var next = null;
    for(var i=0;i<LEVELS.length;i++){
      if(pts >= LEVELS[i].pts) current = LEVELS[i];
      else { next = LEVELS[i]; break; }
    }
    var base = current.pts || 0;
    var target = next ? next.pts : 300;
    var pct = target > base ? Math.min(100, Math.max(0, ((pts-base)/(target-base))*100)) : 100;
    return {pts:pts,current:current,next:next,pct:pct,needed: next ? Math.max(0,next.pts-pts) : 0};
  }

  function roadmapHtml(points){
    var info = levelInfo(points);
    var pts = info.pts;
    var maxPts = 300;
    var overallPct = Math.min(100, Math.max(0, (pts/maxPts)*100));
    var markers = LEVELS.map(function(l){
      var left = Math.min(100, Math.max(0, (l.pts/maxPts)*100));
      var reached = pts >= l.pts;
      return '<div class="v16-marker" style="left:'+left+'%">'
        + '<div class="v16-dot '+(reached?'done':'')+'">'+l.icon+'</div>'
        + '<div class="v16-m-label">L'+l.level+'</div>'
        + '<div class="v16-m-pts">'+l.pts+'</div>'
        + '</div>';
    }).join('');
    return '<div id="v16Roadmap" class="v16-roadmap">'
      + '<div class="v16-road-head"><div><strong>'+info.current.icon+' Level '+info.current.level+' · '+info.current.badge+'</strong><span>'+pts+' pts total</span></div><div class="v16-rank-mini" id="v16RankMini">Rank loading...</div></div>'
      + '<div class="v16-road-track"><div class="v16-road-fill" style="width:'+overallPct+'%"></div>'+markers+'</div>'
      + '<div class="v16-road-next">'+(info.next ? info.needed+' points to Level '+info.next.level+' · '+info.next.badge : 'Top level reached 🎉')+'</div>'
      + '</div>';
  }

  function miniBar(points){
    var i = levelInfo(points);
    return '<div class="v16-mini-bar"><div class="v16-mini-fill" style="width:'+i.pct+'%"></div></div>'
      + '<div class="v16-mini-txt">L'+i.current.level+' '+i.current.badge+(i.next?' · '+i.needed+' pts to L'+i.next.level:' · Max')+'</div>';
  }
  window.v16MiniBar = miniBar;

  function injectCss(){
    if(byId('v16Css')) return;
    var style = document.createElement('style');
    style.id = 'v16Css';
    style.textContent = '\
      @keyframes v16pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}\
      .mem-grid{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:6px!important;margin-bottom:8px!important}.mem-card{aspect-ratio:1!important;border-radius:10px!important;font-size:28px!important;min-height:64px!important}\
      .v16-roadmap{margin:8px 0 10px;background:linear-gradient(135deg,#FFF7CC,#fff);border:2px solid rgba(255,214,0,.75);border-radius:16px;padding:12px 12px 16px;box-shadow:0 6px 18px rgba(0,0,0,.12)}\
      .v16-road-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:18px;color:#0D47A1}.v16-road-head strong{display:block;font-size:13px;font-weight:900}.v16-road-head span{display:block;font-size:11px;font-weight:800;color:#FF8C00;margin-top:2px}.v16-rank-mini{font-size:11px;font-weight:900;color:#1565C0;background:#EAF2FF;border-radius:999px;padding:5px 8px;white-space:nowrap}\
      .v16-road-track{position:relative;height:18px;background:#E5E7EB;border-radius:999px;margin:24px 6px 22px}.v16-road-fill{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px}.v16-marker{position:absolute;top:50%;transform:translate(-50%,-50%);text-align:center;z-index:3}.v16-dot{width:30px;height:30px;border-radius:50%;background:#fff;border:3px solid #D1D5DB;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 3px 8px rgba(0,0,0,.15)}.v16-dot.done{border-color:#FF8C00;background:#FFF2B8}.v16-m-label{font-size:10px;font-weight:900;color:#0D47A1;margin-top:4px}.v16-m-pts{font-size:9px;font-weight:800;color:#6B7280}\
      .v16-road-next{font-size:12px;font-weight:900;color:#0D47A1;text-align:center;background:#F3F8FF;border-radius:10px;padding:6px}.v16-mini-bar{height:6px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;margin-top:4px}.v16-mini-fill{height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px}.v16-mini-txt{font-size:9px;color:rgba(255,255,255,.65);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
      .v16-level-guide{background:rgba(255,255,255,.96);border-radius:14px;padding:10px;margin-top:10px;color:#0D47A1;box-shadow:0 4px 12px rgba(0,0,0,.12)}.v16-level-guide h3{margin:0 0 8px;font-size:15px;color:#0D47A1}.v16-level-row{display:flex;gap:8px;align-items:flex-start;padding:7px;border-radius:10px;background:#F8FAFC;margin-bottom:6px;border:1px solid #E5E7EB}.v16-level-icon{font-size:18px;width:24px;text-align:center}.v16-level-title{font-size:12px;font-weight:900;color:#0D47A1}.v16-level-desc{font-size:11px;line-height:1.25;color:#374151;margin-top:2px}.v16-how-title{font-size:16px!important}.v16-readable{font-size:12px!important;line-height:1.35!important}\
      @media(min-width:901px){.layout{display:block!important;width:100%!important;height:100vh!important;overflow:hidden!important}.left-panel{position:fixed!important;left:0!important;top:0!important;bottom:0!important;width:285px!important;height:100vh!important;z-index:20!important;box-shadow:6px 0 18px rgba(0,0,0,.12)!important;overflow-y:auto!important;padding:14px!important}.lb-sidebar{position:fixed!important;right:0!important;top:0!important;bottom:0!important;width:260px!important;height:100vh!important;z-index:20!important;box-shadow:-6px 0 18px rgba(0,0,0,.12)!important}.game-area{position:fixed!important;left:285px!important;right:260px!important;top:0!important;bottom:0!important;width:auto!important;height:100vh!important;display:flex!important;justify-content:center!important;align-items:flex-start!important;padding:10px 8px!important;overflow-y:auto!important}}\
    ';
    document.head.appendChild(style);
  }

  function addRoadmap(){
    var nameEl = byId('profileName');
    if(!nameEl || !window.player) return;
    var old = byId('v16Roadmap');
    if(old) old.remove();
    nameEl.insertAdjacentHTML('afterend', roadmapHtml(Number(player.game_points||0)));
    renderRankMini();
  }

  function addLeftGuide(){
    var left = document.querySelector('.left-panel');
    if(!left || byId('v16LevelGuide')) return;
    Array.from(left.querySelectorAll('*')).forEach(function(el){
      if(el.textContent && el.textContent.toLowerCase().includes('how to')) el.classList.add('v16-how-title');
      if(el.tagName==='P' || el.tagName==='LI' || el.tagName==='DIV') el.classList.add('v16-readable');
    });
    var html = '<div id="v16LevelGuide" class="v16-level-guide"><h3>🏆 Level Roadmap</h3>'
      + LEVELS.map(function(l){ return '<div class="v16-level-row"><div class="v16-level-icon">'+l.icon+'</div><div><div class="v16-level-title">Level '+l.level+' · '+l.badge+' · '+l.pts+' pts</div><div class="v16-level-desc">'+l.reward+'</div></div></div>'; }).join('')
      + '</div>';
    left.insertAdjacentHTML('beforeend', html);
  }

  async function getExactCount(url){
    var res = await fetch(url,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,Prefer:'count=exact'}});
    if(!res.ok) throw new Error('HTTP '+res.status);
    var cr = res.headers.get('content-range') || '';
    var total = parseInt((cr.split('/')[1] || '0'),10);
    return isNaN(total) ? 0 : total;
  }
  async function refreshCurrentPlayer(){
    if(!player || !player.id) return;
    try{
      var rows = await sb('customers','GET',null,'select=id,name,mobile,game_points,best_memory_time&id=eq.'+encodeURIComponent(player.id)+'&limit=1');
      if(rows && rows.length) player = Object.assign(player, rows[0]);
    }catch(e){}
  }
  async function calculateGlobalRank(){
    await refreshCurrentPlayer();
    if(!player || !player.id) return null;
    var pts = Number(player.game_points || 0);
    var greater = await getExactCount(SB_URL+'/rest/v1/customers?select=id&game_points=gt.'+pts+'&limit=1');
    var total = await getExactCount(SB_URL+'/rest/v1/customers?select=id&game_points=not.is.null&limit=1');
    return {rank: greater+1, total: Math.max(total,1), points: pts};
  }
  async function renderRankMini(){
    var mini = byId('v16RankMini');
    if(!mini) return;
    mini.textContent = 'Rank loading...';
    try{
      var r = await calculateGlobalRank();
      if(r) mini.textContent = 'Global #'+r.rank+' of '+r.total;
    }catch(e){ mini.textContent = 'Rank unavailable'; }
  }

  function patchRegister(){
    window.regGender = window.regGender || 'boy';
    window.setRegGender = function(g){
      window.regGender = g;
      var boy=byId('regBoy'), girl=byId('regGirl');
      if(boy){ boy.style.borderColor=g==='boy'?'#FFD600':'#E5E7EB'; boy.style.background=g==='boy'?'#FFF7CC':'#fff'; }
      if(girl){ girl.style.borderColor=g==='girl'?'#FFD600':'#E5E7EB'; girl.style.background=g==='girl'?'#FFF7CC':'#fff'; }
    };
    window.showRegMsg=function(msg,ok){var el=byId('regMsg');if(!el)return;el.textContent=msg;el.style.display='block';el.style.background=(ok==='ok'||ok===true)?'#DCFCE7':'#FEE2E2';el.style.color=(ok==='ok'||ok===true)?'#166534':'#DC2626';};
    window.showLoginMsg=function(msg,ok){var el=byId('loginMsg');if(!el)return;el.textContent=msg;el.style.display='block';el.style.background=(ok==='ok'||ok===true)?'#DCFCE7':'#FEE2E2';el.style.color=(ok==='ok'||ok===true)?'#166534':'#DC2626';};
    Array.from(document.querySelectorAll('button')).forEach(function(btn){
      if(btn.textContent && btn.textContent.includes('Register') && !btn.textContent.includes('Play')) btn.onclick=function(){goToRegister('', '', 'Register below!');};
    });
    window.doRegister = async function(){
      var name=byId('regName').value.trim(), mobile=byId('regMobile').value.trim(), parent=byId('regParent').value.trim();
      var d=byId('dobDay').value, m=byId('dobMonth').value, y=byId('dobYear').value;
      var dob=(y&&m&&d)?(y+'-'+m+'-'+d):null, gender=window.regGender||'boy';
      if(!name){showRegMsg("Please enter child's name",false);return;}
      if(mobile.length<7){showRegMsg('Please enter valid parent mobile',false);return;}
      if(!dob){showRegMsg('Date of birth is required! 🎂',false);return;}
      var btn=document.querySelector('#s-register .btn-y');
      if(btn){btn.disabled=true;btn.style.opacity='.65';btn.style.pointerEvents='none';btn.textContent='Registering... 🐼';}
      try{
        var res=await sb('customers','POST',{name:name,mobile:mobile,parent:parent,dob:dob,gender:gender,stamps:0,redemptions:0,game_points:0,game_spins:0});
        player=Array.isArray(res)?res[0]:res; player.game_points=0; player.game_spins=0;
        showRegMsg('Welcome to MiniCuts! 🎉','ok'); if(btn) btn.textContent='Starting game... 🎮';
        spinCount=0; bestSpinPts=0; await checkTodaySessions(); await fetchGlobalBests(); setTimeout(function(){goProfile();},450);
      }catch(e){ showRegMsg('Error: '+e.message,false); if(btn){btn.disabled=false;btn.style.opacity='1';btn.style.pointerEvents='auto';btn.textContent='Register & Play! 🎮';} }
    };
  }

  function patchSidebar(){
    window.loadSidebarLb = async function(){
      try{
        await refreshCurrentPlayer();
        var rows = await sb('customers','GET',null,'select=id,name,mobile,game_points&order=game_points.desc&limit=10');
        sidebarData = rows || [];
        var listEl = byId('sideLbList');
        if(listEl){
          if(!sidebarData.length){ listEl.innerHTML='<div style="text-align:center;padding:16px;color:rgba(255,255,255,.35);font-size:11px;">No scores yet<br>Play to be first! 🎮</div>'; }
          else{
            var medals=['🥇','🥈','🥉'];
            listEl.innerHTML = sidebarData.map(function(c,i){
              var pts=c.game_points||0;
              var isMe=(player && player.id && c.id===player.id);
              var icon=medals[i] || '#'+(i+1);
              return '<div style="display:flex;align-items:flex-start;gap:7px;padding:7px 6px;margin-bottom:5px;border-radius:9px;background:'+(isMe?'rgba(255,214,0,.16)':'rgba(255,255,255,.055)')+';border:1px solid '+(isMe?'rgba(255,214,0,.35)':'rgba(255,255,255,.06)')+';"><div style="font-size:15px;width:24px;text-align:center;font-weight:900;color:#FFD600;">'+icon+'</div><div style="flex:1;min-width:0;"><div class="sb-name">'+(c.name||'Player')+(isMe?' ⭐':'')+'</div>'+miniBar(pts)+'</div><div class="sb-pts">'+pts+'</div></div>';
            }).join('');
          }
        }
        var rankEl = byId('sideRankBadge');
        if(rankEl){
          rankEl.innerHTML='<div class="rank-badge"><div class="rank-badge-txt">Calculating global rank...</div></div>';
          var r = await calculateGlobalRank();
          if(r) rankEl.innerHTML='<div class="rank-badge"><div class="rank-badge-txt">Global rank: #'+r.rank+' of '+r.total+'</div><div style="font-size:10px;color:rgba(255,214,0,.7);">'+r.points+' pts total</div></div>';
        }
        renderRankMini();
      }catch(e){ console.warn('Sidebar error:',e.message); }
    };
    window.renderSidebar=function(){ loadSidebarLb(); };
  }

  function patchMemory(){
    window.buildMemGrid=function(reveal){
      var symbols=['🌟','🎡','🎈','🍭'];
      var pairs=symbols.concat(symbols).sort(function(){return Math.random()-.5;});
      memCards=pairs;
      var grid=byId('memGrid'); if(!grid) return;
      grid.innerHTML=pairs.map(function(e,i){ return '<div class="mem-card'+(reveal?' flipped':'')+'" id="mc'+i+'" onclick="flipCard('+i+')">'+(reveal?e:'🐼')+'</div>'; }).join('');
    };
    window.endMemory=async function(){
      clearInterval(memTimerInt); memStarted=false;
      var globalBestTime=null, globalBestName=null;
      try{
        var r=await fetch(SB_URL+'/rest/v1/customers?select=name,best_memory_time&best_memory_time=not.is.null&order=best_memory_time.asc&limit=50',{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});
        var rows=await r.json();
        var best=(Array.isArray(rows)?rows:[]).filter(function(c){return Number(c.best_memory_time)>0;}).sort(function(a,b){return Number(a.best_memory_time)-Number(b.best_memory_time);})[0];
        if(best){globalBestTime=Number(best.best_memory_time);globalBestName=best.name;}
      }catch(e){ if(globalBestMemory&&globalBestMemory.time){globalBestTime=Number(globalBestMemory.time);globalBestName=globalBestMemory.name;} }
      var isGlobalBest=!globalBestTime||memSeconds<globalBestTime;
      var isPersonalBest=!player.best_memory_time||memSeconds<Number(player.best_memory_time);
      var pts=8+(isGlobalBest?2:0);
      if(isPersonalBest) player.best_memory_time=memSeconds;
      if(isGlobalBest) globalBestMemory={time:memSeconds,name:player.name};
      var hintEl=byId('memBestHint');
      if(hintEl){
        hintEl.style.display='block';
        if(isGlobalBest){ hintEl.innerHTML='<span style="font-size:18px;font-weight:900;">🏆 NEW ALL-TIME RECORD: '+memSeconds+'s!</span><br><span style="font-size:14px;">Fastest among all players. +2 bonus!</span>'; hintEl.style.background='rgba(22,163,74,.2)';hintEl.style.borderColor='rgba(22,163,74,.5)';hintEl.style.color='#4ADE80'; }
        else{ hintEl.innerHTML='<span style="font-size:16px;font-weight:900;">⏱️ Your time: '+memSeconds+'s</span><br><span style="font-size:13px;">All-time best is <strong>'+globalBestTime+'s</strong>'+(globalBestName?' by '+globalBestName:'')+'. Earned 8 pts.</span>'; hintEl.style.background='rgba(255,214,0,.15)';hintEl.style.borderColor='rgba(255,214,0,.3)';hintEl.style.color='var(--y)'; }
      }
      var btn=byId('memStartBtn'); if(btn){btn.style.display='block';btn.textContent='See my '+pts+' pts! 🎉';btn.disabled=false;btn.onclick=function(){saveAndShowResult(pts,'memory');};}
      savePoints(pts,'memory',isPersonalBest?memSeconds:null);
    };
  }

  function patchSpin(){
    function showSpinPointsPopup(earned){
      var old=byId('spinPointsPopup'); if(old) old.remove();
      var overlay=document.createElement('div'); overlay.id='spinPointsPopup';
      overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML='<div style="background:#fff;border-radius:20px;padding:22px 22px;max-width:290px;width:100%;text-align:center;animation:v16pop .16s ease-out;box-shadow:0 14px 40px rgba(0,0,0,.35);"><div style="font-size:46px;margin-bottom:0;">🎉</div><div style="font-family:Baloo 2, Nunito, sans-serif;font-size:20px;font-weight:900;color:#0D47A1;margin-bottom:0;">Great Spin!</div><div style="font-family:Baloo 2, Nunito, sans-serif;font-size:46px;font-weight:900;color:#FF8C00;line-height:1;">+'+earned+'</div><div style="font-size:14px;font-weight:800;color:#1565C0;margin-top:4px;">points gained</div></div>';
      document.body.appendChild(overlay);
    }
    window.startSpin=function(){
      if(isSpinning) return; isSpinning=true;
      var spinBtn=byId('spinBtn'), panda=byId('pandaReact');
      if(spinBtn){spinBtn.disabled=true;spinBtn.textContent='Spinning... 🎡';spinBtn.onclick=null;}
      if(panda) panda.style.animation='jump 0.4s ease infinite';
      var startAngle=spinAngle||0, targetAngle=startAngle+(6+Math.random()*4)*2*Math.PI+Math.random()*2*Math.PI;
      var duration=4200, startedAt=performance.now(), lastTick=0;
      function easeOutCubic(t){return 1-Math.pow(1-t,3);}
      function animate(now){
        var progress=Math.min((now-startedAt)/duration,1);
        spinAngle=startAngle+(targetAngle-startAngle)*easeOutCubic(progress); drawWheel(spinAngle);
        if(now-lastTick>120&&progress<.92){lastTick=now; try{soundSpin();}catch(e){}}
        if(progress<1){requestAnimationFrame(animate);return;}
        spinAngle=targetAngle; drawWheel(spinAngle); isSpinning=false; if(panda)panda.style.animation='';
        var arc=(2*Math.PI)/SEGS.length, norm=((spinAngle%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
        var idx=Math.floor((((-Math.PI/2-norm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)/arc)%SEGS.length;
        var earned=SEGS[idx].pts; bestSpinPts=earned; spinCount=1;
        var best=byId('bestSoFar'), label=byId('spinChanceLabel'); if(best)best.textContent=earned+'pts'; if(label)label.textContent='You won: '+earned+' pts!';
        if(panda)panda.textContent=earned>=13?'🤩':earned>=11?'😄':'😊'; try{soundSpinResult(earned);}catch(e){}
        if(spinBtn){spinBtn.disabled=true;spinBtn.textContent='Saved '+earned+' pts! 🎉';}
        showSpinPointsPopup(earned); savePoints(earned,'spin').catch(function(e){console.warn('Spin save failed:',e.message);});
        setTimeout(function(){var old=byId('spinPointsPopup');if(old)old.remove();goProfile();},450);
      }
      requestAnimationFrame(animate);
    };
    var btn=byId('spinBtn'); if(btn){btn.disabled=false;btn.textContent='SPIN! 🎡';btn.onclick=startSpin;}
  }

  function patchResults(){ window.saveAndShowResult=async function(pts,gameType){ showResult(pts); }; }
  function patchProfile(){
    var oldRenderProfile=window.renderProfile;
    window.renderProfile=function(){ oldRenderProfile(); setTimeout(function(){addRoadmap();addLeftGuide();},50); };
    var oldShowResult=window.showResult;
    window.showResult=function(pts){ oldShowResult(pts); setTimeout(addRoadmap,50); };
    var oldGoProfile=window.goProfile;
    window.goProfile=function(){ oldGoProfile(); setTimeout(function(){addRoadmap();addLeftGuide();renderRankMini();},80); };
  }

  safe(injectCss); safe(patchRegister); safe(patchSidebar); safe(patchResults); safe(patchMemory); safe(patchSpin); safe(patchProfile);
  setTimeout(function(){ safe(addRoadmap); safe(addLeftGuide); safe(renderRankMini); }, 700);
})();