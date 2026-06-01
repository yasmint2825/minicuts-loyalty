(function(){
  function $(id){return document.getElementById(id);}

  function isRegisterScreenVisible(){
    var s=$('s-register');
    if(!s) return false;
    var cs=window.getComputedStyle(s);
    return cs.display!=='none' && cs.visibility!=='hidden';
  }

  function isInsideRegisterSubmit(target){
    try{
      var reg=$('s-register');
      if(!reg || !target || !reg.contains(target)) return false;
      var btn=target.closest ? target.closest('button') : null;
      if(!btn) return false;
      var txt=(btn.textContent||'').toLowerCase();
      return txt.indexOf('register')>-1;
    }catch(e){return false;}
  }

  function showRegMsg(text,ok){
    var r=$('regMsg');
    if(!r) return;
    r.textContent=text;
    r.style.display='block';
    r.style.background=ok?'#DCFCE7':'#FEE2E2';
    r.style.color=ok?'#166534':'#DC2626';
  }

  function readForm(){
    return {
      name:(($('regName')&&$('regName').value)||'').trim(),
      mobile:(($('regMobile')&&$('regMobile').value)||'').trim(),
      parent:(($('regParent')&&$('regParent').value)||'').trim(),
      day:($('dobDay')&&$('dobDay').value)||'',
      month:($('dobMonth')&&$('dobMonth').value)||'',
      year:($('dobYear')&&$('dobYear').value)||'',
      gender:window.regGender||'boy'
    };
  }

  function restoreForm(v){
    if(!v) return;
    if($('regName')) $('regName').value=v.name||'';
    if($('regMobile')) $('regMobile').value=v.mobile||'';
    if($('regParent')) $('regParent').value=v.parent||'';
    if($('dobDay')) $('dobDay').value=v.day||'';
    if($('dobMonth')) $('dobMonth').value=v.month||'';
    if($('dobYear')) $('dobYear').value=v.year||'';
  }

  function safeRegister(){
    var v=readForm();
    var dob=(v.year&&v.month&&v.day)?(v.year+'-'+v.month+'-'+v.day):null;
    if(!v.name){showRegMsg('Please enter child name',false);restoreForm(v);return;}
    if(v.mobile.length<7){showRegMsg('Please enter valid parent mobile',false);restoreForm(v);return;}
    if(!dob){showRegMsg('Date of birth is required!',false);restoreForm(v);return;}
    var btn=document.querySelector('#s-register .btn-y') || document.querySelector('#s-register button');
    if(btn){btn.disabled=true;btn.style.opacity='0.65';btn.style.pointerEvents='none';btn.textContent='Registering...';}
    var payload={name:v.name,mobile:v.mobile,parent:v.parent,dob:dob,gender:v.gender,stamps:0,redemptions:0,game_points:0,game_spins:0};
    fetch(SB_URL+'/rest/v1/customers',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)})
      .then(function(res){return res.text().then(function(text){if(!res.ok){throw new Error(text||('HTTP '+res.status));}if(!text)return [payload];try{return JSON.parse(text);}catch(e){throw new Error('Registration response was not valid JSON. Please try again.');}});})
      .then(function(data){
        window.player=Array.isArray(data)?data[0]:data;
        player.game_points=Number(player.game_points||0);
        player.game_spins=Number(player.game_spins||0);
        showRegMsg('Welcome to MiniCuts!',true);
        if(btn) btn.textContent='Starting game...';
        window.spinCount=0; window.bestSpinPts=0;
        return Promise.resolve(typeof checkTodaySessions==='function'?checkTodaySessions():null).then(function(){return Promise.resolve(typeof fetchGlobalBests==='function'?fetchGlobalBests():null);});
      })
      .then(function(){setTimeout(function(){if(typeof goProfile==='function')goProfile();},450);})
      .catch(function(e){
        restoreForm(v);
        showRegMsg('Error: '+(e&&e.message?e.message:'Registration failed'),false);
        if(btn){btn.disabled=false;btn.style.opacity='1';btn.style.pointerEvents='auto';btn.textContent='Register for Loyalty & Games! 🎮';}
      });
  }

  function fixLoginRegisterButtons(){
    try{
      var login=$('s-login');
      if(!login) return;
      login.querySelectorAll('button').forEach(function(btn){
        var t=(btn.textContent||'').toLowerCase();
        if(t.indexOf('register')>-1){
          btn.onclick=function(){if(typeof window.goToRegister==='function') window.goToRegister('','','Register below!');};
          btn.innerHTML='🐼 Register';
          btn.style.color='#0D47A1';
          btn.style.background='linear-gradient(135deg,#FFD600,#FF8C00)';
          btn.style.border='2px solid #FFD600';
        }
      });
    }catch(e){console.warn('login register button fix:',e.message);}
  }

  function fixRegisterSubmitButton(){
    try{
      var reg=$('s-register');
      if(!reg) return;
      var btn=reg.querySelector('.btn-y') || reg.querySelector('button');
      if(!btn) return;
      btn.onclick=function(ev){
        if(ev){ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();}
        safeRegister();
        return false;
      };
      btn.textContent='Register for Loyalty & Games! 🎮';
      btn.style.pointerEvents='auto';
    }catch(e){console.warn('register submit button fix:',e.message);}
  }

  function wrapGoToRegister(){
    try{
      if(window.__goToRegisterPreservePatched || typeof window.goToRegister!=='function') return;
      window.__goToRegisterPreservePatched=true;
      var old=window.goToRegister;
      window.goToRegister=function(){
        old.apply(this,arguments);
        setTimeout(fixRegisterSubmitButton,60);
        setTimeout(fixRegisterSubmitButton,200);
        setTimeout(fixRegisterSubmitButton,600);
      };
    }catch(e){console.warn('goToRegister wrap:',e.message);}
  }

  function apply(){
    wrapGoToRegister();
    fixLoginRegisterButtons();
    fixRegisterSubmitButton();
  }

  document.addEventListener('click',function(ev){
    if(isInsideRegisterSubmit(ev.target)){
      ev.preventDefault();
      ev.stopPropagation();
      if(ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      safeRegister();
      return false;
    }
  },true);

  apply();
  setTimeout(apply,300);
  setTimeout(apply,900);
  setTimeout(apply,1800);
  setTimeout(apply,3000);
  document.addEventListener('click',function(){setTimeout(apply,80);});
})();