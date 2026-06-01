(function(){
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
    }catch(e){console.warn('Loyalty Games Club text patch:',e.message);}
  }
  applyText();
  setTimeout(applyText,500);
  setTimeout(applyText,1500);
  document.addEventListener('click',function(){setTimeout(applyText,80);});
})();