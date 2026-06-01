(function(){
  var KEY='mc_staff_ok';
  var PIN=String.fromCharCode(56,48,56,50);
  function has(){try{return sessionStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function set(){try{sessionStorage.setItem(KEY,'1');}catch(e){}}
  function clr(){try{sessionStorage.removeItem(KEY);}catch(e){}}
  function ask(){var p=prompt('Enter staff PIN'); if(p===PIN){set();return true;} if(p!==null) alert('Incorrect PIN'); return false;}
  function open(){if(!has()&&!ask())return; if(window.__oldGoStaff)window.__oldGoStaff(); else if(window.showScreen)window.showScreen('s-staff');}
  function infoBox(id,title,body){
    var box=document.createElement('div');
    box.id=id;
    box.style.cssText='background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:8px 10px;margin-bottom:10px;text-align:center;color:#0D47A1;font-size:12px;font-weight:900;line-height:1.35;';
    box.innerHTML=title+'<br><span style="font-size:11px;color:#1565C0;font-weight:800;">'+body+'</span>';
    return box;
  }
  function addLoginNote(){
    var login=document.getElementById('s-login');
    if(login&&!document.getElementById('loyaltyGameLoginNote')){
      var card=login.querySelector('.card');
      if(card){
        var note=infoBox('loyaltyGameLoginNote','🔐 Same login for <strong>MiniCuts Loyalty</strong> & <strong>MiniCuts Games Club</strong>','Use the same child name and parent mobile number.');
        card.insertBefore(note,card.firstChild.nextSibling);
      }
      var sub=login.querySelector('.sub');
      if(sub)sub.textContent='One MiniCuts account · Loyalty + Games Club';
      var title=login.querySelector('.card-title');
      if(title)title.textContent='Login for Loyalty & Games Club 🎮';
      var btn=document.getElementById('loginBtn');
      if(btn)btn.textContent='Login & Play! 🎮';
    }
  }
  function addRegisterNote(){
    var reg=document.getElementById('s-register');
    if(!reg)return;
    var brand=reg.querySelector('.brand');
    if(brand)brand.textContent='Join MiniCuts Club 🐼';
    var card=reg.querySelector('.card');
    if(card&&!document.getElementById('loyaltyGameRegisterNote')){
      var note=infoBox('loyaltyGameRegisterNote','📝 One-time registration for <strong>Loyalty</strong> & <strong>MiniCuts Games Club</strong>','This same account will be used for stamps, rewards, game points and levels.');
      card.insertBefore(note,card.firstChild);
    }
    var oldInfo=card?card.querySelector('div[style*="EFF6FF"]'):null;
    if(oldInfo&&oldInfo.id!=='loyaltyGameRegisterNote'){
      oldInfo.innerHTML='🐼 Register once to use <strong>MiniCuts Loyalty</strong> and <strong>MiniCuts Games Club</strong>.';
    }
    var btn=card?card.querySelector('.btn-y'):null;
    if(btn)btn.textContent='Register for Loyalty & Games! 🎮';
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
    addRegisterNote();
  }
  apply();setTimeout(apply,500);setTimeout(apply,1500);setTimeout(apply,3000);
})();