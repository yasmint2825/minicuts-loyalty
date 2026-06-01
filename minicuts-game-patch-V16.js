(function(){
  var LEVELS=[
    {level:1,pts:50,badge:'Panda Explorer',icon:'🌟',reward:'Small surprise / Mini gift'},
    {level:2,pts:100,badge:'Panda Adventurer',icon:'🏅',reward:'Special sticker / Treat'},
    {level:3,pts:150,badge:'Panda Hero',icon:'🦸',reward:'Mini gift upgrade'},
    {level:4,pts:200,badge:'Panda Superstar',icon:'⭐',reward:'Premium surprise'},
    {level:5,pts:250,badge:'Panda Legend',icon:'🔥',reward:'Big surprise gift'},
    {level:6,pts:300,badge:'Dragon Warrior',icon:'🐉',reward:'Top level reward'}
  ];
  function el(id){return document.getElementById(id);}
  function safe(fn){try{fn();}catch(e){console.warn('V16 stable patch:',e.message);}}

  function addCss(){
    if(el('v16StableCss'))return;
    var css=[
      '.mem-grid{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:6px!important;margin-bottom:8px!important}',
      '.mem-card{aspect-ratio:1!important;border-radius:10px!important;font-size:28px!important;min-height:64px!important}',
      '.v16-roadmap{margin:8px 0 10px;background:linear-gradient(135deg,#FFF7CC,#fff);border:2px solid rgba(255,214,0,.75);border-radius:16px;padding:12px 12px 16px;box-shadow:0 6px 18px rgba(0,0,0,.12)}',
      '.v16-road-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:18px;color:#0D47A1}',
      '.v16-road-head strong{display:block;font-size:13px;font-weight:900}.v16-road-head span{display:block;font-size:11px;font-weight:800;color:#FF8C00;margin-top:2px}',
      '.v16-rank-mini{font-size:11px;font-weight:900;color:#1565C0;background:#EAF2FF;border-radius:999px;padding:5px 8px;white-space:nowrap}',
      '.v16-road-track{position:relative;height:18px;background:#E5E7EB;border-radius:999px;margin:24px 6px 24px}',
      '.v16-road-fill{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px}',
      '.v16-marker{position:absolute;top:50%;transform:translate(-50%,-50%);text-align:center;z-index:3}',
      '.v16-dot{width:30px;height:30px;border-radius:50%;background:#fff;border:3px solid #D1D5DB;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 3px 8px rgba(0,0,0,.15)}',
      '.v16-dot.done{border-color:#FF8C00;background:#FFF2B8}.v16-m-label{font-size:10px;font-weight:900;color:#0D47A1;margin-top:4px}.v16-m-pts{font-size:9px;font-weight:800;color:#6B7280}',
      '.v16-road-next{font-size:12px;font-weight:900;color:#0D47A1;text-align:center;background:#F3F8FF;border-radius:10px;padding:6px}',
      '.v16-level-guide{background:rgba(255,255,255,.96);border-radius:14px;padding:12px;margin-top:10px;color:#0D47A1;box-shadow:0 4px 12px rgba(0,0,0,.12)}',
      '.v16-level-guide h3{margin:0 0 8px;font-size:16px;color:#0D47A1}.v16-level-row{display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:10px;background:#F8FAFC;margin-bottom:7px;border:1px solid #E5E7EB}',
      '.v16-level-icon{font-size:19px;width:24px;text-align:center}.v16-level-title{font-size:12px;font-weight:900;color:#0D47A1}.v16-level-desc{font-size:11px;line-height:1.3;color:#374151;margin-top:2px}',
      '.v16-mini-bar{height:6px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;margin-top:4px}.v16-mini-fill{height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px}.v16-mini-txt{font-size:9px;color:rgba(255,255,255,.65);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '@media(min-width:901px){.layout{display:block!important;width:100%!important;height:100vh!important;overflow:hidden!important}.left-panel{position:fixed!important;left:0!important;top:0!important;bottom:0!important;width:290px!important;height:100vh!important;z-index:20!important;box-shadow:6px 0 18px rgba(0,0,0,.12)!important;overflow-y:auto!important;padding:14px!important}.lb-sidebar{position:fixed!important;right:0!important;top:0!important;bottom:0!important;width:260px!important;height:100vh!important;z-index:20!important;box-shadow:-6px 0 18px rgba(0,0,0,.12)!important}.game-area{position:fixed!important;left:290px!important;right:260px!important;top:0!important;bottom:0!important;width:auto!important;height:100vh!important;display:flex!important;justify-content:center!important;align-items:flex-start!important;padding:10px 8px!important;overflow-y:auto!important}}'
    ].join('\n');
    var st=document.createElement('style');st.id='v16StableCss';st.textContent=css;document.head.appendChild(st);
  }

  function levelInfo(points){
    var pts=Number(points||0),cur={level:0,pts:0,badge:'Starter Panda',icon:'🐼'},next=null;
    for(var i=0;i<LEVELS.length;i++){if(pts>=LEVELS[i].pts)cur=LEVELS[i];else{next=LEVELS[i];break;}}
    var base=cur.pts||0,target=next?next.pts:300,pct=target>base?Math.min(100,Math.max(0,((pts-base)/(target-base))*100)):100;
    return{pts:pts,cur:cur,next:next,pct:pct,needed:next?Math.max(0,next.pts-pts):0};
  }

  function miniBar(points){
    var i=levelInfo(points);
    return '<div class="v16-mini-bar"><div class="v16-mini-fill" style="width:'+i.pct+'%"></div></div><div class="v16-mini-txt">L'+i.cur.level+' '+i.cur.badge+(i.next?' · '+i.needed+' pts to L'+i.next.level:' · Max')+'</div>';
  }

  function roadmap(points){
    var i=levelInfo(points),pct=Math.min(100,Math.max(0,(i.pts/300)*100));
    var marks=LEVELS.map(function(l){var left=Math.min(100,Math.max(0,(l.pts/300)*100)),done=i.pts>=l.pts;return '<div class="v16-marker" style="left:'+left+'%"><div class="v16-dot '+(done?'done':'')+'">'+l.icon+'</div><div class="v16-m-label">L'+l.level+'</div><div class="v16-m-pts">'+l.pts+'</div></div>';}).join('');
    return '<div id="v16Roadmap" class="v16-roadmap"><div class="v16-road-head"><div><strong>'+i.cur.icon+' Level '+i.cur.level+' · '+i.cur.badge+'</strong><span>'+i.pts+' pts total</span></div><div class="v16-rank-mini" id="v16RankMini">Rank loading...</div></div><div class="v16-road-track"><div class="v16-road-fill" style="width:'+pct+'%"></div>'+marks+'</div><div class="v16-road-next">'+(i.next?i.needed+' points to Level '+i.next.level+' · '+i.next.badge:'Top level reached 🎉')+'</div></div>';
  }

  function addRoadmap(){
    var name=el('profileName');if(!name||!window.player)return;
    var old=el('v16Roadmap');if(old)old.remove();
    name.insertAdjacentHTML('afterend',roadmap(Number(player.game_points||0)));
    renderRankMini();
  }

  function addLeftGuide(){
    var left=document.querySelector('.left-panel');if(!left||el('v16LevelGuide'))return;
    var rows=LEVELS.map(function(l){return '<div class="v16-level-row"><div class="v16-level-icon">'+l.icon+'</div><div><div class="v16-level-title">Level '+l.level+' · '+l.badge+' · '+l.pts+' pts</div><div class="v16-level-desc">'+l.reward+'</div></div></div>';}).join('');
    left.insertAdjacentHTML('beforeend','<div id="v16LevelGuide" class="v16-level-guide"><h3>🏆 Level Roadmap</h3>'+rows+'</div>');
  }

  async function rankCount(url){var r=await fetch(url,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,Prefer:'count=exact'}});var cr=r.headers.get('content-range')||'';return parseInt((cr.split('/')[1]||'0'),10)||0;}
  async function renderRankMini(){
    var mini=el('v16RankMini');if(!mini||!window.player)return;
    try{var pts=Number(player.game_points||0),greater=await rankCount(SB_URL+'/rest/v1/customers?select=id&game_points=gt.'+pts+'&limit=1'),total=await rankCount(SB_URL+'/rest/v1/customers?select=id&game_points=not.is.null&limit=1');mini.textContent='Global #'+(greater+1)+' of '+Math.max(total,1);}catch(e){mini.textContent='Rank unavailable';}
  }

  function patchProfile(){
    if(window.__v16ProfilePatched)return;window.__v16ProfilePatched=true;
    var oldRender=window.renderProfile;if(typeof oldRender==='function')window.renderProfile=function(){oldRender();setTimeout(function(){addRoadmap();addLeftGuide();},80);};
    var oldGo=window.goProfile;if(typeof oldGo==='function')window.goProfile=function(){oldGo();setTimeout(function(){addRoadmap();addLeftGuide();},100);};
    var oldSide=window.loadSidebarLb;if(typeof oldSide==='function')window.loadSidebarLb=async function(){await oldSide();try{var rows=sidebarData||[],list=el('sideLbList');if(list&&rows.length){list.innerHTML=rows.map(function(c,idx){var pts=c.game_points||0;return '<div style="padding:7px 6px;margin-bottom:5px;border-radius:9px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.06)"><div style="display:flex;justify-content:space-between;gap:6px"><div class="sb-name">#'+(idx+1)+' '+(c.name||'Player')+'</div><div class="sb-pts">'+pts+'</div></div>'+miniBar(pts)+'</div>';}).join('');}}catch(e){}};
  }

  function patchBasicFixes(){
    if(typeof window.saveAndShowResult==='function')window.saveAndShowResult=async function(pts,gameType){showResult(pts);};
    window.regGender=window.regGender||'boy';
    window.setRegGender=function(g){window.regGender=g;var b=el('regBoy'),x=el('regGirl');if(b){b.style.borderColor=g==='boy'?'#FFD600':'#E5E7EB';b.style.background=g==='boy'?'#FFF7CC':'#fff';}if(x){x.style.borderColor=g==='girl'?'#FFD600':'#E5E7EB';x.style.background=g==='girl'?'#FFF7CC':'#fff';}};
  }

  safe(addCss);safe(patchBasicFixes);safe(patchProfile);
  setTimeout(function(){safe(addRoadmap);safe(addLeftGuide);safe(renderRankMini);},800);
})();