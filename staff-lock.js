(function(){
  var KEY='mc_staff_ok';
  var PIN=String.fromCharCode(56,48,56,50);
  function has(){try{return sessionStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function set(){try{sessionStorage.setItem(KEY,'1');}catch(e){}}
  function clr(){try{sessionStorage.removeItem(KEY);}catch(e){}}
  function ask(){var p=prompt('Enter staff PIN'); if(p===PIN){set();return true;} if(p!==null) alert('Incorrect PIN'); return false;}
  function open(){if(!has()&&!ask())return; if(window.__oldGoStaff)window.__oldGoStaff(); else if(window.showScreen)window.showScreen('s-staff');}
  function addLoginNote(){
    var login=document.getElementById('s-login');
    if(!login||document.getElementById('loyaltyGameLoginNote'))return;
    var card=login.querySelector('.card');
    if(!card)return;
    var note=document.createElement('div');
    note.id='loyaltyGameLoginNote';
    note.style.cssText='background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:8px 10px;margin-bottom:10px;text-align:center;color:#0D47A1;font-size:12px;font-weight:900;line-height:1.35;';
    note.innerHTML='🔐 Same login for <strong>MiniCuts Loyalty</strong> & <strong>Games</strong><br><span style="font-size:11px;color:#1565C0;font-weight:800;">Use the same child name and parent mobile number.</span>';
    card.insertBefore(note,card.firstChild.nextSibling);
    var sub=login.querySelector('.sub');
    if(sub)sub.textContent='One MiniCuts account · Loyalty + Games';
  }
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
    addLoginNote();
  }
  apply();setTimeout(apply,500);setTimeout(apply,1500);
})();