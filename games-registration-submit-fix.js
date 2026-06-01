(function(){
  function $(id){return document.getElementById(id);}

  function isRegisterScreenVisible(){
    var s=$('s-register');
    if(!s) return false;
    var cs=window.getComputedStyle(s);
    return cs.display!=='none' && cs.visibility!=='hidden';
  }

  function fixLoginRegisterButtons(){
    try{
      var login=$('s-login');
      if(!login) return;
      login.querySelectorAll('button').forEach(function(btn){
        var t=(btn.textContent||'').toLowerCase();
        if(t.indexOf('register')>-1){
          btn.onclick=function(){
            if(typeof window.goToRegister==='function') window.goToRegister('','','Register below!');
          };
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
      var btn=reg.querySelector('.btn-y, button');
      if(!btn) return;
      var txt=(btn.textContent||'').toLowerCase();
      if(txt.indexOf('register')>-1 || txt.indexOf('start')>-1){
        btn.onclick=function(ev){
          if(ev){ev.preventDefault();ev.stopPropagation();}
          if(typeof window.doRegister==='function') window.doRegister();
          return false;
        };
        btn.textContent='Register & Play! 🎮';
        btn.style.pointerEvents='auto';
      }
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
      };
    }catch(e){console.warn('goToRegister wrap:',e.message);}
  }

  function protectDoRegister(){
    try{
      if(window.__doRegisterGuardPatched || typeof window.doRegister!=='function') return;
      window.__doRegisterGuardPatched=true;
      var old=window.doRegister;
      window.doRegister=function(){
        var name=$('regName')&&$('regName').value;
        var mobile=$('regMobile')&&$('regMobile').value;
        var parent=$('regParent')&&$('regParent').value;
        var d=$('dobDay')&&$('dobDay').value;
        var m=$('dobMonth')&&$('dobMonth').value;
        var y=$('dobYear')&&$('dobYear').value;
        if(!isRegisterScreenVisible()) return old.apply(this,arguments);
        var result=old.apply(this,arguments);
        setTimeout(function(){
          if(isRegisterScreenVisible()){
            if($('regName')&&!$('regName').value) $('regName').value=name||'';
            if($('regMobile')&&!$('regMobile').value) $('regMobile').value=mobile||'';
            if($('regParent')&&!$('regParent').value) $('regParent').value=parent||'';
            if($('dobDay')&&!$('dobDay').value) $('dobDay').value=d||'';
            if($('dobMonth')&&!$('dobMonth').value) $('dobMonth').value=m||'';
            if($('dobYear')&&!$('dobYear').value) $('dobYear').value=y||'';
            fixRegisterSubmitButton();
          }
        },120);
        return result;
      };
    }catch(e){console.warn('doRegister guard:',e.message);}
  }

  function apply(){
    wrapGoToRegister();
    protectDoRegister();
    fixLoginRegisterButtons();
    fixRegisterSubmitButton();
  }

  apply();
  setTimeout(apply,300);
  setTimeout(apply,900);
  setTimeout(apply,1800);
  document.addEventListener('click',function(){setTimeout(apply,80);});
})();