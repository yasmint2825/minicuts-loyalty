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
      '.v16-roadmap{margin:8px 0 10px;background:linear-gradient(135deg,#FFF7CC,#fff);border:2px solid rgba(255,214,0,.75);border-radius:16px;padding:12px 12px 18px;box-shadow:0 6px 18px rgba(0,0,0,.12)}',
      '.v16-road-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:16px;color:#0D47A1}',
      '.v16-road-head strong{display:block;font-size:13px;font-weight:900}.v16-road-head span{display:block;font-size:11px;font-weight:800;color:#FF8C00;margin-top:2px}',
      '.v16-rank-mini{font-size:11px;font-weight:900;color:#1565C0;background:#EAF2FF;border-radius:999px;padding:5px 8px;white-space:nowrap}',
      '.v16-road-track{position:relative;height:18px;background:#E5E7EB;border-radius:999px;margin:30px 8px 34px}',
      '.v16-road-fill{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,#FFD600,#FF8C00);border-radius:999px;z-index:1}',
      '.v16-marker{position:absolute;top:50%;transform:translate(-50%,-50%);text-align:center;z-index:3}',
      '.v16-dot{width:31px;height:31px;border-radius:50%;background:#fff;border:3px solid #D1D5DB;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 3px 8px rgba(0,0,0,.15)}',
      '.v16-dot.done{border-color:#FF8C00;background:#FFF2B8}.v16-m-label{font-size:10px;font-weight:900;color:#0D47A1;margin-top:4px}.v16-m-pts{font-size:9px;font-weight:800;color:#6B7280}',
      '.v16-you{position:absolute;top:-29px;transform:translateX(-50%);z-index:5;text-align:center}.v16-you-pin{background:#0D47A1;color:#fff;border:2px solid #FFD600;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:900;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25)}.v16-you-line{width:3px;height:26px;background:#0D47A1;margin:0 auto;border-radius:2px}',
      '.v16-road-next{font-size:12px;font-weight:900;color:#0D47A1;text-align:center;background:#F3F8FF;border-radius:10px;padding:6px}',
      '.v16-level-guide{background:rgba(255,255,255,.96);border-radius:14px;padding:12px;margin-top:10px;color:#0D47A1;box-shadow:0 4px 12px rgba(0,0,0,.12)}',
      '.v16-level-guide h3{margin:0 0 8px;font-size:16px;color:#0D47A1}.v16-level-row{display:flex;gap:8px;align-items:flex-start;padding:8px;border-radius:10px;background:#F8FAFC;margin-bottom:7px;border:1px solid #E5E7EB}',
      '.v16-level-icon{font-size:19px;width:24px;text-align:center}.v16-level-title{font-size:12px;font-weight:900;color:#0D47A1}.v16-level-desc{font-size:11px;line-height:1.3;color:#374151;margin-top:2px;font-weight:800}',
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
  function addRoadmap(){var name=el('profileName');if(!name||!window.player)return;var old=el('v16Roadmap');if(old)old.remove();name.insertAdjacentHTML('afterend',roadmap(Number(player.game_points||0)));renderRankMini();}
  function cleanupOldLevelSystems(){try{var tier=el('tierList');if(tier)tier.innerHTML='';var mt=el('milestoneTrack');if(mt)mt.style.display='none';var cards=document.querySelectorAll('[id*="tier"], [class*="tier"], [id*="milestone"], [class*="milestone"]');for(var i=0;i<cards.length;i++){if(cards[i].id!=='v16Roadmap'&&!cards[i].closest('#v16Roadmap'))cards[i].style.display='none';}}catch(e){}}
  function addLeftGuide(){var left=document.querySelector('.left-panel');if(!left)return;var old=el('v16LevelGuide');if(old)old.remove();var rows=LEVELS.map(function(l){return '<div class="v16-level-row"><div class="v16-level-icon">'+l.icon+'</div><div><div class="v16-level-title">L'+l.level+' · '+l.badge+' · '+l.pts+' pts</div><div class="v16-level-desc">Prize: Mini Surprise Gift</div></div></div>';}).join('');left.insertAdjacentHTML('beforeend','<div id="v16LevelGuide" class="v16-level-guide"><h3>🏆 Level Roadmap</h3>'+rows+'</div>');}
  function rankCount(url){return fetch(url,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,Prefer:'count=exact'}}).then(function(r){var cr=r.headers.get('content-range')||'';return parseInt((cr.split('/')[1]||'0'),10)||0;});}
  function renderRankMini(){var mini=el('v16RankMini');if(!mini||!window.player)return;var pts=Number(player.game_points||0);rankCount(SB_URL+'/rest/v1/customers?select=id&game_points=gt.'+pts+'&limit=1').then(function(greater){return rankCount(SB_URL+'/rest/v1/customers?select=id&game_points=not.is.null&limit=1').then(function(total){mini.textContent='Global #'+(greater+1)+' of '+Math.max(total,1);});}).catch(function(){mini.textContent='Rank unavailable';});}
  function patchProfile(){if(window.__v16ProfilePatched)return;window.__v16ProfilePatched=true;var oldRender=window.renderProfile;if(typeof oldRender==='function')window.renderProfile=function(){oldRender();setTimeout(function(){cleanupOldLevelSystems();addRoadmap();addLeftGuide();},80);};var oldGo=window.goProfile;if(typeof oldGo==='function')window.goProfile=function(){oldGo();setTimeout(function(){cleanupOldLevelSystems();addRoadmap();addLeftGuide();},100);};var oldSide=window.loadSidebarLb;if(typeof oldSide==='function')window.loadSidebarLb=function(){return Promise.resolve(oldSide()).then(function(){try{var rows=sidebarData||[],list=el('sideLbList');if(list&&rows.length){list.innerHTML=rows.map(function(c,idx){var pts=c.game_points||0;return '<div style="padding:7px 6px;margin-bottom:5px;border-radius:9px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.06)"><div style="display:flex;justify-content:space-between;gap:6px"><div class="sb-name">#'+(idx+1)+' '+(c.name||'Player')+'</div><div class="sb-pts">'+pts+'</div></div>'+miniBar(pts)+'</div>';}).join('');}}catch(e){}});};}

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
  function patchBasicFixes(){if(typeof window.saveAndShowResult==='function')window.saveAndShowResult=function(pts,gameType){showResult(pts);};patchRegistration();}
  safe(addCss);safe(patchBasicFixes);safe(patchProfile);setTimeout(function(){safe(patchRegistration);safe(cleanupOldLevelSystems);safe(addRoadmap);safe(addLeftGuide);safe(renderRankMini);},800);
})();