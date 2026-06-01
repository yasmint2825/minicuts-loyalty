(function(){
  var KEY='mc_staff_ok';
  var PIN=String.fromCharCode(56,48,56,50);
  function has(){try{return sessionStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function set(){try{sessionStorage.setItem(KEY,'1');}catch(e){}}
  function clr(){try{sessionStorage.removeItem(KEY);}catch(e){}}
  function ask(){var p=prompt('Enter staff PIN'); if(p===PIN){set();return true;} if(p!==null) alert('Incorrect PIN'); return false;}
  function open(){if(!has()&&!ask())return; if(window.__oldGoStaff)window.__oldGoStaff(); else if(window.showScreen)window.showScreen('s-staff');}
  function apply(){
    if(!window.__staffGateApplied){window.__oldGoStaff=window.goStaff||null;window.__oldStaffReset=window.staffReset||null;window.__staffGateApplied=true;}
    window.goStaff=function(){open();};
    window.staffReset=function(){if(!has()&&!ask())return; if(window.__oldStaffReset)return window.__oldStaffReset.apply(this,arguments);};
    var screen=document.getElementById('s-staff');
    if(screen&&!document.getElementById('staffLockBtn')){
      var b=document.createElement('button');b.id='staffLockBtn';b.className='home-btn';b.textContent='Lock';b.onclick=function(){clr();if(window.showScreen)showScreen('s-login');};
      var bar=screen.querySelector('.home-bar'); if(bar)bar.appendChild(b);
    }
    document.querySelectorAll('button').forEach(function(btn){if(btn.textContent&&btn.textContent.trim()==='Staff'){btn.onclick=open;btn.title='Staff PIN required';}});
  }
  apply();setTimeout(apply,500);setTimeout(apply,1500);
})();