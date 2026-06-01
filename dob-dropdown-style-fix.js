(function(){
  function styleDobBoxes(){
    try{
      var ids=['CRDOB_D','CRDOB_M','CRDOB_Y'];
      ids.forEach(function(id){
        var s=document.getElementById(id);
        if(!s) return;
        s.style.width='100%';
        s.style.height='48px';
        s.style.minHeight='48px';
        s.style.border='2px solid #E5E7EB';
        s.style.borderRadius='12px';
        s.style.background='#fff';
        s.style.padding='0 8px';
        s.style.fontSize='15px';
        s.style.fontWeight='700';
        s.style.color='#374151';
        s.style.lineHeight='48px';
        s.style.textAlign='center';
        s.style.textAlignLast='center';
        s.style.boxShadow='none';
        s.style.outline='none';
        s.style.appearance='auto';
      });
      var wrap=document.getElementById('CRDOB_WRAP');
      if(wrap){
        wrap.style.marginBottom='12px';
        var label=wrap.querySelector('label');
        if(label){
          label.style.fontSize='13px';
          label.style.fontWeight='800';
          label.style.color='#6B7280';
          label.style.marginBottom='7px';
          label.style.display='block';
        }
        var grid=wrap.querySelector('div[style*="grid-template-columns"]');
        if(grid){
          grid.style.gap='8px';
          grid.style.gridTemplateColumns='1fr 1fr 1.15fr';
        }
      }
    }catch(e){console.warn('DOB style patch:',e.message);}
  }
  styleDobBoxes();
  setTimeout(styleDobBoxes,300);
  setTimeout(styleDobBoxes,900);
  setTimeout(styleDobBoxes,1800);
  document.addEventListener('click',function(){setTimeout(styleDobBoxes,120);});
  document.addEventListener('change',styleDobBoxes);
})();