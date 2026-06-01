(function(){
  function noteHtml(id,kind){
    var title = kind === 'register'
      ? '📝 One-time registration for <strong>MiniCuts Loyalty</strong> & <strong>MiniCuts Games Club</strong>'
      : '🔐 Same login for <strong>MiniCuts Loyalty</strong> & <strong>MiniCuts Games Club</strong>';
    var body = kind === 'register'
      ? 'This same account is used for stamps, rewards, game points and levels.'
      : 'Use the same child name and parent mobile number to check stamps and play games.';
    return '<div id="'+id+'" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:8px 10px;margin-bottom:14px;text-align:center;color:#0D47A1;font-size:12px;font-weight:900;line-height:1.35;">'+title+'<br><span style="font-size:11px;color:#1565C0;font-weight:800;">'+body+'</span></div>';
  }

  function enhanceCustomerPortalDom(){
    try{
      var cp=document.getElementById('CP');
      if(cp){
        var title=cp.querySelector('div[style*="font-family"][style*="25px"]');
        if(title) title.textContent='MiniCuts Loyalty + Games Club';
        var sub=title ? title.nextElementSibling : null;
        if(sub) sub.textContent='One account for stamps, rewards, game points and levels';
      }

      var cpa=document.getElementById('CPA');
      if(!cpa) return;

      var boxes=cpa.querySelectorAll('.cbox');
      boxes.forEach(function(box){
        var heading=box.querySelector('div[style*="Baloo 2"], div[style*="Baloo"]');
        var text=heading ? heading.textContent.trim().toLowerCase() : '';
        if(text.indexOf('check your stamps')>-1 && !box.querySelector('#lgcCustomerPortalNote')){
          heading.textContent='Check Stamps & Games Club';
          var sub=heading.nextElementSibling;
          if(sub) sub.textContent='Enter your mobile number — same account for Loyalty and Games Club';
          box.insertAdjacentHTML('afterbegin', noteHtml('lgcCustomerPortalNote','lookup'));
          var link=box.querySelector('a[onclick="showReg()"]');
          if(link) link.textContent='Register for Loyalty & Games Club →';
        }
        if((text.indexOf('join minicuts loyalty')>-1 || text.indexOf('join minicuts')>-1) && !box.querySelector('#lgcCustomerRegisterNote')){
          heading.textContent='Join MiniCuts Loyalty + Games Club';
          var sub2=heading.nextElementSibling;
          if(sub2) sub2.textContent='Register once for stamps, rewards and MiniCuts Games Club';
          box.insertAdjacentHTML('afterbegin', noteHtml('lgcCustomerRegisterNote','register'));
          var btn=box.querySelector('button[onclick="custRegister()"]');
          if(btn) btn.textContent='Create Loyalty & Games Account 🐼';
          var back=box.querySelector('a[onclick="showLookup()"]');
          if(back) back.textContent='Check Loyalty & Games login →';
        }
      });
    }catch(e){console.warn('Customer portal wording patch:',e.message);}
  }

  function patchBuildFunctions(){
    try{
      if(window.__lgcBuildFunctionsPatched) return;
      if(typeof window.buildLookup !== 'function' || typeof window.buildRegister !== 'function') return;
      window.__lgcBuildFunctionsPatched=true;

      var oldLookup=window.buildLookup;
      window.buildLookup=function(msg){
        var html=oldLookup(msg);
        html=html.replace('Check your stamps','Check Stamps & Games Club');
        html=html.replace('Enter your mobile number','Enter your mobile number — same account for Loyalty and Games Club');
        html=html.replace('Register here →','Register for Loyalty & Games Club →');
        html=html.replace('<div class="cbox">','<div class="cbox">'+noteHtml('lgcCustomerPortalNote','lookup'));
        return html;
      };

      var oldRegister=window.buildRegister;
      window.buildRegister=function(pf){
        var html=oldRegister(pf);
        html=html.replace('🐼 Join MiniCuts Loyalty!','Join MiniCuts Loyalty + Games Club');
        html=html.replace('Register to start earning stamps','Register once for stamps, rewards and MiniCuts Games Club');
        html=html.replace('Create My Passport 🐼','Create Loyalty & Games Account 🐼');
        html=html.replace('Check stamps →','Check Loyalty & Games login →');
        html=html.replace('<div class="cbox">','<div class="cbox">'+noteHtml('lgcCustomerRegisterNote','register'));
        return html;
      };
    }catch(e){console.warn('Build function patch:',e.message);}
  }

  function applyText(){
    try{
      var login=document.getElementById('LS');
      if(login){
        var header=login.querySelector('div[style*="text-align:center"]');
        if(header && !document.getElementById('lgcLoginNote')){
          var sub=header.querySelector('div[style*="color:#6B7280"]');
          if(sub) sub.textContent='Loyalty Passport + MiniCuts Games Club · Staff Panel';
          var note=document.createElement('div');
          note.id='lgcLoginNote';
          note.style.cssText='background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:8px 10px;margin-top:12px;text-align:center;color:#0D47A1;font-size:12px;font-weight:900;line-height:1.35;';
          note.innerHTML='🔐 Same account for <strong>MiniCuts Loyalty</strong> & <strong>MiniCuts Games Club</strong><br><span style="font-size:11px;color:#1565C0;font-weight:800;">Use the same child name and parent mobile number.</span>';
          header.appendChild(note);
        }
        var loginBtn=login.querySelector('button[onclick="doLogin()"]');
        if(loginBtn) loginBtn.textContent='Login to Loyalty & Games Club';
        var portalLink=login.querySelector('a[href="?customer=1"]');
        if(portalLink) portalLink.textContent='→ Customer Portal: Loyalty + Games Club';
      }

      var newPage=document.getElementById('page-newcustomer');
      if(newPage){
        var title=newPage.querySelector('div[style*="font-family:var(--fh)"]');
        if(title) title.textContent='New Customer Registration';
        var subtitle=title ? title.nextElementSibling : null;
        if(subtitle) subtitle.textContent='Create one account for MiniCuts Loyalty and MiniCuts Games Club';
        var card=newPage.querySelector('.card');
        if(card && !document.getElementById('lgcRegisterNote')){
          var note2=document.createElement('div');
          note2.id='lgcRegisterNote';
          note2.style.cssText='background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:8px 10px;margin-bottom:14px;text-align:center;color:#0D47A1;font-size:12px;font-weight:900;line-height:1.35;';
          note2.innerHTML='📝 One-time registration for <strong>MiniCuts Loyalty</strong> & <strong>MiniCuts Games Club</strong><br><span style="font-size:11px;color:#1565C0;font-weight:800;">This same account will be used for stamps, rewards, game points and levels.</span>';
          card.insertBefore(note2,card.firstChild);
        }
        var createBtn=newPage.querySelector('button[onclick="createC()"]');
        if(createBtn) createBtn.textContent='Create Loyalty & Games Account 🐼';
      }

      var qr=document.getElementById('page-qrpage');
      if(qr){
        var qrTitle=qr.querySelector('.card div[style*="font-family:var(--fh)"]');
        if(qrTitle) qrTitle.textContent='MiniCuts Loyalty + Games Club';
        var qrSub=qrTitle ? qrTitle.nextElementSibling : null;
        if(qrSub) qrSub.textContent='Scan to register, collect stamps, earn rewards and play MiniCuts games!';
      }

      patchBuildFunctions();
      enhanceCustomerPortalDom();
    }catch(e){console.warn('Loyalty Games Club text patch:',e.message);}
  }

  applyText();
  setTimeout(applyText,300);
  setTimeout(applyText,900);
  setTimeout(applyText,1800);
  document.addEventListener('click',function(){setTimeout(applyText,80);setTimeout(enhanceCustomerPortalDom,250);});
})();