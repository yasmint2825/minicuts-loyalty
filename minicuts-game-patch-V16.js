(function(){
  var LEVELS=[
    {level:1,pts:50,badge:'Panda Explorer',icon:'🌟',reward:'Mini Surprise Gift'},
    {level:2,pts:100,badge:'Panda Adventurer',icon:'🏅',reward:'Mini Surprise Gift'},
    {level:3,pts:150,badge:'Panda Hero',icon:'🦸',reward:'Mini Surprise Gift'},
    {level:4,pts:200,badge:'Panda Superstar',icon:'⭐',reward:'Mini Surprise Gift'},
    {level:5,pts:250,badge:'Panda Legend',icon:'🔥',reward:'Mini Surprise Gift'},
    {level:6,pts:300,badge:'Dragon Warrior',icon:'🐉',reward:'Mini Surprise Gift'}
  ];
  function el(id){return document.getElementById(id);}
  function safe(fn){try{fn();}catch(e){console.warn('V16 patch:',e.message);}}
  function msg(id,text,ok){var r=el(id);if(!r)return;r.textContent=text;r.style.display='block';r.style.background=ok?'#DCFCE7':'#FEE2E2';r.style.color=ok?'#166534':'#DC2626';}

  function addCss(){
    var old=el('v16StableCss');if(old)old.remove();
    var css=[
      '.mem-grid{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:6px!important;margin-bottom:8px!important}',
      '.mem-card{aspect-ratio:1!important;border-radius:10px!important;font-size:28px!important;min-height:64px!important}',
      '#s-login .btn-ghost{background:#1565C0!important;color:#fff!important;border:2px solid #1565C0!important;box-shadow:0 4px 12px rgba(21,101,192,.25)!important}',
      '#s-login .btn-b{background:#FFD600!important;color:#0D47A1!important;border:2px solid #FFD600!important;box-shadow:0 4px 12px rgba(255,214,0,.25)!important}',
      '.v16-roadmap{margin:8px 0 10px;background:linear-gradient(135deg,#FFF7CC,#fff);border:2px solid rgba(255,214,0,.75);border-radius:16px;padding:12px 12px 18px;box-shadow:0 6px 18px rgba(0,0,0,.12)}',
      '.v16-road-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:16px;color:#0D47A1}',
      '.v16-road-head strong{display:block;font-size:13px;font-weight:900}.v16-road-head span{display:block;font-size:11px;font-weight:800;color:#FF8C00;margin-top:2px}',
      '.v16-rank-mini{font-size:11px;font-weight:900;color:#1565C0;background:#EAF2FF;border-radius:999px;padding:5px 8px;white-space:nowrap}',
      '.v16-rank-card{margin:8px 0 10px;background:linear-gradient(135deg,#0D47A1,#1565C0);border:2px solid rgba(255,214,0,.75);border-radius:16px;padding:12px;color:#fff;box-shadow:0 8px 22px rgba(13,71,161,.28)}',
      '.v16-rank-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.v16-rank-title{font-family:"Baloo 2",cursive;font-size:17px;font-weight:900;color:#FFD600;line-height:1}.v16-rank-sub{font-size:11px;color:rgba(255,255,255,.75);font-weight:800;margin-top:2px}.v16-rank-pill{background:#FFD600;color:#0D47A1;border-radius:999px;padding:6px 10px;font-family:"Baloo 2",cursive;font-size:16px;font-weight:900;white-space:nowrap}',
      '.v16-rank-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:8px 0}.v16-rank-stat{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:7px;text-align:center}.v16-rank-num{font-family:"Baloo 2",cursive;font-size:17px;font-weight:900;color:#fff}.v16-rank-lbl{font-size:9px;color:rgba(255,255,255,.65);font-weight:800;text-transform:uppercase;letter-spacing:.3px}',
      '.v16-rank-insight{background:rgba(255,214,0,.14);border:1px solid rgba(255,214,0,.25);border-radius:10px;padding:8px;font-size:12px;font-weight:900;line-height:1.35;color:#fff;text-align:center}.v16-mobile-lb-btn{display:block;width:100%;margin-top:8px;background:#FFD600;color:#0D47A1;border:none;border-radius:12px;padding:10px;font-family:"Baloo 2",cursive;font-size:15px;font-weight:900;box-shadow:0 4px 12px rgba(255,214,0,.25)}',
      '.v16-lb-modal{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px}.v16-lb-box{background:#fff;border-radius:18px;max-width:360px;width:100%;max-height:82vh;overflow:auto;padding:14px;color:#0D47A1}.v16-lb-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.v16-lb-close{background:#FEE2E2;color:#DC2626;border:none;border-radius:999px;padding:6px 10px;font-weight:900}',
      '.v16-road-track{position:relative;height:18px;background:#E5E7EB;border-radius:999px;margin:30px 8px 34px}',
      '.v16-road-fill{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px;z-index:1}',
      '.v16-marker{position:absolute;top:50%;transform:translate(-50%,-50%);text-align:center;z-index:3}',
      '.v16-dot{width:31px;height:31px;border-radius:50%;background:#fff;border:3px solid #D1D5DB;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 3px 8px rgba(0,0,0,.15)}',
      '.v16-dot.done{border-color:#FF8C00;background:#FFF2B8}.v16-m-label{font-size:10px;font-weight:900;color:#0D47A1;margin-top:4px}.v16-m-pts{font-size:9px;font-weight:800;color:#6B7280}',
      '.v16-you{position:absolute;top:-29px;transform:translateX(-50%);z-index:5;text-align:center}.v16-you-pin{background:#0D47A1;color:#fff;border:2px solid #FFD600;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:900;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25)}.v16-you-line{width:3px;height:26px;background:#0D47A1;margin:0 auto;border-radius:2px}',
      '.v16-road-next{font-size:12px;font-weight:900;color:#0D47A1;text-align:center;background:#F3F8FF;border-radius:10px;padding:6px}',
      '#v16LevelGuide{display:none!important}',
      '.v16-mini-road{position:relative;height:9px;background:rgba(255,255,255,.18);border-radius:999px;margin-top:5px;overflow:hidden}.v16-mini-road-fill{height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px}.v16-mini-road-pin{position:absolute;top:-2px;width:13px;height:13px;background:#FFD600;border:2px solid #fff;border-radius:50%;transform:translateX(-50%)}.v16-mini-txt{font-size:9px;color:rgba(255,255,255,.65);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '@media(min-width:901px){.layout{display:block!important;width:100%!important;height:100vh!important;overflow:hidden!important}.left-panel{position:fixed!important;left:0!important;top:0!important;bottom:0!important;width:305px!important;height:100vh!important;z-index:20!important;box-shadow:6px 0 18px rgba(0,0,0,.12)!important;overflow-y:auto!important;padding:14px!important}.lb-sidebar{position:fixed!important;right:0!important;top:0!important;bottom:0!important;width:260px!important;height:100vh!important;z-index:20!important;box-shadow:-6px 0 18px rgba(0,0,0,.12)!important}.game-area{position:fixed!important;left:305px!important;right:260px!important;top:0!important;bottom:0!important;width:auto!important;height:100vh!important;display:flex!important;justify-content:center!important;align-items:flex-start!important;padding:10px 8px!important;overflow-y:auto!important}}'
    ].join('\n');
    var st=document.createElement('style');st.id='v16StableCss';st.textContent=css;document.head.appendChild(st);
  }

  function levelInfo(points){
    var pts=Number(points||0),cur={level:0,pts:0,badge:'Starter Panda',icon:'🐼'},next=null;
    for(var i=0;i<LEVELS.length;i++){if(pts>=LEVELS[i].pts)cur=LEVELS[i];else{next=LEVELS[i];break;}}
    var pct=Math.min(100,Math.max(0,(pts/300)*100));
    return{pts:pts,cur:cur,next:next,pct:pct,needed:next?Math.max(0,next.pts-pts):0};
  }
  function miniBar(points){var i=levelInfo(points),pct=i.pct;return '<div class="v16-mini-road"><div class="v16-mini-road-fill" style="width:'+pct+'%"></div><div class="v16-mini-road-pin" style="left:'+pct+'%"></div></div><div class="v16-mini-txt">L1 → L6 · '+i.pts+' pts'+(i.next?' · '+i.needed+' pts to L'+i.next.level:' · Max')+'</div>';}
  function roadmap(points){
    var i=levelInfo(points),pct=i.pct;
    var marks=LEVELS.map(function(l){var left=Math.min(100,Math.max(0,(l.pts/300)*100)),done=i.pts>=l.pts;return '<div class="v16-marker" style="left:'+left+'%"><div class="v16-dot '+(done?'done':'')+'">'+l.icon+'</div><div class="v16-m-label">L'+l.level+'</div><div class="v16-m-pts">'+l.pts+'</div></div>';}).join('');
    var you='<div class="v16-you" style="left:'+pct+'%"><div class="v16-you-pin">YOU · '+i.pts+' pts</div><div class="v16-you-line"></div></div>';
    return '<div id="v16Roadmap" class="v16-roadmap"><div class="v16-road-head"><div><strong>'+i.cur.icon+' Level '+i.cur.level+' · '+i.cur.badge+'</strong><span>'+i.pts+' pts total · Mini Surprise Gift at every level</span></div><div class="v16-rank-mini" id="v16RankMini">Rank loading...</div></div><div class="v16-road-track"><div class="v16-road-fill" style="width:'+pct+'%"></div>'+marks+you+'</div><div class="v16-road-next">'+(i.next?i.needed+' points to Level '+i.next.level+' · '+i.next.badge:'Top level reached 🎉')+'</div></div>';
  }
  function addRoadmap(){var name=el('profileName');if(!name||!window.player)return;var old=el('v16Roadmap');if(old)old.remove();name.insertAdjacentHTML('afterend',roadmap(Number(player.game_points||0)));renderRankMini();addRankInsights();}
  function cleanupOldLevelSystems(){try{var tier=el('tierList');if(tier)tier.innerHTML='';var mt=el('milestoneTrack');if(mt)mt.style.display='none';var leftGuide=el('v16LevelGuide');if(leftGuide)leftGuide.remove();var cards=document.querySelectorAll('[id*="tier"], [class*="tier"], [id*="milestone"], [class*="milestone"]');for(var i=0;i<cards.length;i++){if(cards[i].id!=='v16Roadmap'&&!cards[i].closest('#v16Roadmap'))cards[i].style.display='none';}}catch(e){}}
  function addLeftGuide(){var old=el('v16LevelGuide');if(old)old.remove();}
  function rankCount(url){return fetch(url,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,Prefer:'count=exact'}}).then(function(r){var cr=r.headers.get('content-range')||'';return parseInt((cr.split('/')[1]||'0'),10)||0;});}
  function fetchTopRows(){return fetch(SB_URL+'/rest/v1/customers?select=id,name,game_points&game_points=gt.0&order=game_points.desc&limit=10',{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}}).then(function(r){return r.json();}).catch(function(){return [];});}
  function renderRankMini(){var mini=el('v16RankMini');if(!mini||!window.player)return;var pts=Number(player.game_points||0);rankCount(SB_URL+'/rest/v1/customers?select=id&game_points=gt.'+pts+'&limit=1').then(function(greater){return rankCount(SB_URL+'/rest/v1/customers?select=id&game_points=not.is.null&limit=1').then(function(total){mini.textContent='Global #'+(greater+1)+' of '+Math.max(total,1);});}).catch(function(){mini.textContent='Rank unavailable';});}
  function addRankInsights(){
    if(!window.player||!el('profileName'))return;
    var old=el('v16RankCard');if(old)old.remove();
    var pts=Number(player.game_points||0);
    var html='<div id="v16RankCard" class="v16-rank-card"><div class="v16-rank-top"><div><div class="v16-rank-title">🏆 Your MiniCuts Rank</div><div class="v16-rank-sub">Compete with all MiniCuts players</div></div><div class="v16-rank-pill" id="v16RankBig">Loading...</div></div><div class="v16-rank-grid"><div class="v16-rank-stat"><div class="v16-rank-num" id="v16RankPts">'+pts+'</div><div class="v16-rank-lbl">Points</div></div><div class="v16-rank-stat"><div class="v16-rank-num" id="v16RankTop">—</div><div class="v16-rank-lbl">Top %</div></div><div class="v16-rank-stat"><div class="v16-rank-num" id="v16RankNext">—</div><div class="v16-rank-lbl">Next Goal</div></div></div><div class="v16-rank-insight" id="v16RankInsight">Calculating your challenge...</div><button class="v16-mobile-lb-btn" onclick="showMobileLeaderboard()">🏆 View Leaderboard</button></div>';
    var rm=el('v16Roadmap');
    if(rm)rm.insertAdjacentHTML('afterend',html);
    else el('profileName').insertAdjacentHTML('afterend',html);
    updateRankInsights();
  }
  function updateRankInsights(){
    if(!window.player)return;
    var pts=Number(player.game_points||0);
    Promise.all([rankCount(SB_URL+'/rest/v1/customers?select=id&game_points=gt.'+pts+'&limit=1'),rankCount(SB_URL+'/rest/v1/customers?select=id&game_points=not.is.null&limit=1'),fetchTopRows()]).then(function(all){
      var greater=all[0],total=Math.max(all[1],1),topRows=all[2]||[],rank=greater+1,topPct=Math.max(1,Math.ceil((rank/total)*100));
      var big=el('v16RankBig'),top=el('v16RankTop'),next=el('v16RankNext'),ins=el('v16RankInsight'),mini=el('v16RankMini');
      if(big)big.textContent='#'+rank+' / '+total;
      if(top)top.textContent='Top '+topPct+'%';
      if(mini)mini.textContent='Global #'+rank+' of '+total;
      var abovePts=null;
      for(var i=0;i<topRows.length;i++){if(Number(topRows[i].game_points||0)>pts){abovePts=Number(topRows[i].game_points||0);break;}}
      if(rank===1){if(next)next.textContent='Champion';if(ins)ins.innerHTML='👑 You are leading the MiniCuts Games Club. Keep playing to protect your #1 spot!';}
      else if(abovePts!==null){var need=Math.max(1,abovePts-pts+1);if(next)next.textContent=need+' pts';if(ins)ins.innerHTML='⚡ You need <strong>'+need+' more pts</strong> to challenge the player above you. One strong game can move you up!';}
      else {if(next)next.textContent='Play more';if(ins)ins.innerHTML='🎯 Keep collecting points to climb the leaderboard and unlock your next level.';}
    }).catch(function(){var big=el('v16RankBig'),ins=el('v16RankInsight');if(big)big.textContent='Rank loading';if(ins)ins.textContent='Rank will appear after your points refresh.';});
  }
  window.showMobileLeaderboard=function(){
    var old=el('v16LbModal');if(old)old.remove();
    var modal=document.createElement('div');modal.id='v16LbModal';modal.className='v16-lb-modal';
    modal.innerHTML='<div class="v16-lb-box"><div class="v16-lb-head"><div style="font-family:Baloo 2,cursive;font-size:20px;font-weight:900;color:#0D47A1;">🏆 Leaderboard</div><button class="v16-lb-close" onclick="document.getElementById(\'v16LbModal\').remove()">Close</button></div><div id="v16LbRows" style="font-size:13px;color:#0D47A1;text-align:center;padding:18px;">Loading scores...</div></div>';
    document.body.appendChild(modal);
    fetchTopRows().then(function(rows){var box=el('v16LbRows');if(!box)return;if(!rows.length){box.innerHTML='No scores yet.';return;}box.innerHTML=rows.map(function(c,i){var isMe=window.player&&player.id&&c.id===player.id;return '<div style="display:flex;align-items:center;gap:8px;padding:9px;border-radius:10px;margin-bottom:6px;background:'+(isMe?'#FFF7CC':'#F3F8FF')+';border:1px solid '+(isMe?'#FFD600':'#DBEAFE')+';"><div style="width:28px;font-weight:900;">#'+(i+1)+'</div><div style="flex:1;text-align:left;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(c.name||'Player')+(isMe?' ⭐':'')+'</div><div style="font-weight:900;color:#FF8C00;">'+(c.game_points||0)+' pts</div></div>';}).join('');});
  };
  function patchLoginButtons(){
    try{
      var buttons=document.querySelectorAll('#s-login button');
      for(var i=0;i<buttons.length;i++){
        var t=(buttons[i].textContent||'').trim();
        if(t.indexOf('Register')>-1){buttons[i].innerHTML='🐼 Register';buttons[i].style.color='#0D47A1';buttons[i].style.background='linear-gradient(135deg,#FFD600,#FF8C00)';buttons[i].style.border='2px solid #FFD600';}
        if(t.indexOf('Scores')>-1||t.indexOf('Leaderboard')>-1){buttons[i].innerHTML='🏆 View Leaderboard';buttons[i].style.color='#fff';buttons[i].style.background='#1565C0';buttons[i].style.border='2px solid #1565C0';buttons[i].onclick=function(){showMobileLeaderboard();};}
      }
    }catch(e){}
  }
  function patchProfile(){if(window.__v16ProfilePatched)return;window.__v16ProfilePatched=true;var oldRender=window.renderProfile;if(typeof oldRender==='function')window.renderProfile=function(){oldRender();setTimeout(function(){cleanupOldLevelSystems();addRoadmap();addLeftGuide();addRankInsights();},80);};var oldGo=window.goProfile;if(typeof oldGo==='function')window.goProfile=function(){oldGo();setTimeout(function(){cleanupOldLevelSystems();addRoadmap();addLeftGuide();addRankInsights();},100);};var oldSide=window.loadSidebarLb;if(typeof oldSide==='function')window.loadSidebarLb=function(){return Promise.resolve(oldSide()).then(function(){try{var rows=sidebarData||[],list=el('sideLbList');if(list&&rows.length){list.innerHTML=rows.map(function(c,idx){var pts=c.game_points||0;return '<div style="padding:7px 6px;margin-bottom:5px;border-radius:9px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.06)"><div style="display:flex;justify-content:space-between;gap:6px"><div class="sb-name">#'+(idx+1)+' '+(c.name||'Player')+'</div><div class="sb-pts">'+pts+'</div></div>'+miniBar(pts)+'</div>';}).join('');}}catch(e){}});};}

  function patchRegistration(){
    window.regGender=window.regGender||'boy';
    window.setRegGender=function(g){window.regGender=g;var b=el('regBoy'),x=el('regGirl');if(b){b.style.borderColor=g==='boy'?'#FFD600':'#E5E7EB';b.style.background=g==='boy'?'#FFF7CC':'#fff';}if(x){x.style.borderColor=g==='girl'?'#FFD600':'#E5E7EB';x.style.background=g==='girl'?'#FFF7CC':'#fff';}};
    window.showRegMsg=function(text,ok){msg('regMsg',text,ok==='ok'||ok===true);};
    window.showLoginMsg=function(text,ok){msg('loginMsg',text,ok==='ok'||ok===true);};
    var buttons=document.querySelectorAll('button');for(var i=0;i<buttons.length;i++){if(buttons[i].textContent&&buttons[i].textContent.indexOf('Register')>-1&&buttons[i].textContent.indexOf('Play')===-1){buttons[i].onclick=function(){goToRegister('','','Register below!');};}}
    window.doRegister=function(){
      var name=(el('regName')&&el('regName').value||'').trim();
      var mobile=(el('regMobile')&&el('regMobile').value||'').trim();
      var parent=(el('regParent')&&el('regParent').value||'').trim();
      var day=el('dobDay')?el('dobDay').value:'';
      var month=el('dobMonth')?el('dobMonth').value:'';
      var year=el('dobYear')?el('dobYear').value:'';
      var dob=(year&&month&&day)?(year+'-'+month+'-'+day):null;
      var gender=window.regGender||'boy';
      if(!name){msg('regMsg','Please enter child name',false);return;}
      if(mobile.length<7){msg('regMsg','Please enter valid parent mobile',false);return;}
      if(!dob){msg('regMsg','Date of birth is required!',false);return;}
      var btn=document.querySelector('#s-register .btn-y');if(btn){btn.disabled=true;btn.style.opacity='0.65';btn.style.pointerEvents='none';btn.textContent='Registering...';}
      var payload={name:name,mobile:mobile,parent:parent,dob:dob,gender:gender,stamps:0,redemptions:0,game_points:0,game_spins:0};
      fetch(SB_URL+'/rest/v1/customers',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)})
      .then(function(res){return res.text().then(function(text){if(!res.ok){throw new Error(text||('HTTP '+res.status));}if(!text){return [payload];}try{return JSON.parse(text);}catch(e){throw new Error('Registration response was not valid JSON. Please try again.');}});})
      .then(function(data){player=Array.isArray(data)?data[0]:data;player.game_points=0;player.game_spins=0;msg('regMsg','Welcome to MiniCuts!','ok');if(btn)btn.textContent='Starting game...';spinCount=0;bestSpinPts=0;return Promise.resolve(checkTodaySessions()).then(function(){return Promise.resolve(fetchGlobalBests());});})
      .then(function(){setTimeout(function(){goProfile();},450);})
      .catch(function(e){msg('regMsg','Error: '+(e&&e.message?e.message:'Registration failed'),false);if(btn){btn.disabled=false;btn.style.opacity='1';btn.style.pointerEvents='auto';btn.textContent='Register & Play!';}});
    };
  }
  function patchBasicFixes(){if(typeof window.saveAndShowResult==='function')window.saveAndShowResult=function(pts,gameType){showResult(pts);};patchRegistration();patchLoginButtons();}
  safe(addCss);safe(patchBasicFixes);safe(patchProfile);setTimeout(function(){safe(patchRegistration);safe(patchLoginButtons);safe(cleanupOldLevelSystems);safe(addRoadmap);safe(addLeftGuide);safe(renderRankMini);safe(addRankInsights);},800);setTimeout(patchLoginButtons,1800);
})();