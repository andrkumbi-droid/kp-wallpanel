// Seed lagertest/ with sales test data for the 6 test partners (multi-path update).
const fs=require('fs');
let seed=20261011; function rnd(){ seed=(seed*1103515245+12345)%2147483648; return seed/2147483648; }
const pick=a=>a[Math.floor(rnd()*a.length)];
const now=Date.now(), DAY=864e5;
const P=[
  {k:'nok',name:'นก',brand:'Nok Home Deco',polite:'ka',phone:'0800000001'},
  {k:'ploy',name:'พลอย',brand:'Ploy Interior Studio',polite:'ka',phone:'0800000002'},
  {k:'bank',name:'แบงค์',brand:'Bank Wall Design',polite:'krub',phone:'0800000003'},
  {k:'mint',name:'มิ้นท์',brand:'Mint Living',polite:'ka',phone:'0800000004'},
  {k:'bee',name:'บี',brand:'Bee Decor Shop',polite:'ka',phone:'0800000005'},
  {k:'golf',name:'กอล์ฟ',brand:'Golf Renovate',polite:'krub',phone:'0800000006'}];
const PANELS=[['KP009',179,'WPC','L09'],['KP011',199,'WPC','L11'],['KP028',179,'WPC','L28'],['KP042',179,'WPC','L42'],['KP049',199,'WPC','L49'],['KP052',199,'WPC','L52'],['KP055',199,'WPC','L55'],['K-PVC-06',189,'PVC','L-P-06'],['K-PVC-07',249,'PVC','L-P-07']];
const CUST=['คุณสมศรี ใจดี','คุณวิชัย ทองดี','คุณมาลี สุขสวัสดิ์','คุณประเสริฐ มั่นคง','คุณอรุณี แสงทอง','คุณธนา ศรีสุข','คุณกาญจนา พรมมา','คุณสมชาย รักไทย','คุณนภา วงศ์ใหญ่','ร้านกาแฟบ้านสวน','คุณปิยะ เจริญผล','คุณรัตนา บุญมา','คลินิกฟันยิ้มสวย','คุณเอกชัย นาคสุข','คุณศิริพร คำแก้ว','คอนโด The Base ห้อง 1205'];
const PROV=['กรุงเทพมหานคร','นนทบุรี','ปทุมธานี','สมุทรปราการ','ชลบุรี','เชียงใหม่','ขอนแก่น','นครราชสีมา','ภูเก็ต','สุราษฎร์ธานี','ระยอง','อยุธยา'.replace('อยุธยา','พระนครศรีอยุธยา')];
// every stage at least once over all partners
const STAGES=['pending','pending','rejected','new','packing','ready','loaded','shipped','delivered','paid','paid','paid','paid','cancelled'];
const up={}; let oNo=301;
P.forEach(function(p,pi){
  const uid='test_'+p.k;
  up['sales/members/'+uid]={uid:uid,name:p.name,brand:p.brand,phone:p.phone,email:p.k+'@test.kp',line:'@'+p.k+'deco',status:'active',polite:p.polite,test:true,
    fb:'https://facebook.com/'+p.k+'.deco',bank:'SCB 123-4-'+String(10000+pi*1111).slice(0,5)+'-'+pi+' '+p.name,createdAt:now-40*DAY+pi*DAY};
  const n=4+Math.floor(rnd()*4);
  for(let i=0;i<n;i++){
    const stage = i<STAGES.length && pi===0 ? STAGES[i] : pick(STAGES);
    const pan=pick(PANELS), qty=pick([12,18,24,30,40,55,80,120]), lq=Math.max(2,Math.round(qty/8));
    const goods=qty*pan[1]+lq*89, ship=qty>=25?0:400, total=goods+ship;
    const created=now-Math.floor(rnd()*34)*DAY-Math.floor(rnd()*8)*3600e3;
    const rid='tr'+p.k+i;
    const cu={name:pick(CUST),phone:'08'+String(10000000+Math.floor(rnd()*89999999)),address:(10+Math.floor(rnd()*300))+'/'+(1+Math.floor(rnd()*99))+' หมู่ '+(1+Math.floor(rnd()*9))+' ต.ทดสอบ อ.ทดสอบ',province:pick(PROV),maps:''};
    const li=[{type:'panel',code:pan[0],name:'',qty:qty,unitPrice:pan[1],amount:qty*pan[1]},{type:'lcorner',code:pan[3],name:'',qty:lq,unitPrice:89,amount:lq*89}];
    const req={uid:uid,brand:p.brand,seller:p.name,sellerPhone:p.phone,customer:cu,wantDate:'',payment:rnd()<0.8?'cod':'transfer',note:pick(['','','ส่งช่วงบ่าย','โทรก่อนส่ง','ลูกค้าอยู่บ้านวันเสาร์']),
      lineItems:li,totals:{goods:goods,delivery:ship,panels:qty,freeClips:qty*10,total:total},status:'pending',createdAt:created,test:true};
    if(stage==='rejected'){ req.status='rejected'; req.rejectReason=pick(['สินค้าหมดชั่วคราว','ที่อยู่ไม่ครบ กรุณาส่งใหม่']); req.rejectedAt=created+3600e3; }
    else if(stage!=='pending'){
      const oid='T-'+(oNo++), approvedAt=created+2*3600e3;
      req.status='approved'; req.orderId=oid; req.approvedAt=approvedAt; req.approvedBy='Pim';
      req.rule = p.k==='bank' ? {mode:'perPanel',pct:5,perPanel:12} : (p.k==='mint' ? {mode:'pct',pct:6,perPanel:10} : {mode:'pct',pct:5,perPanel:10});
      const st = stage==='paid' ? 'delivered' : stage;
      const o={id:oid,date:new Date(created).toISOString().slice(0,10),zone:'1',customer:cu.name,phone:cu.phone,address:cu.address+' '+cu.province,province:cu.province,
        status:st,total:total,lineItems:li.concat(ship?[{type:'delivery',code:'',name:'ค่าส่ง',qty:1,unitPrice:ship,amount:ship}]:[]),
        salesUid:uid,salesBrand:p.brand,salesSeller:p.name,salesPhone:p.phone,salesReq:uid+'/'+rid,createdBy:'Pim',test:true,
        deliveryRound:(st==='packing'||st==='ready'||st==='new')?pick(['ส่งวันจันทร์','ส่งวันพุธ','ส่งวันศุกร์']):''};
      if(stage==='paid'){ const pd=new Date(approvedAt+(2+Math.floor(rnd()*4))*DAY); o.payMethod=req.payment==='transfer'?'online':'cash'; o.paidAmount=total; o.payDate=pd.toISOString().slice(0,10); }
      if(stage==='cancelled'){ o.status='cancelled'; }
      up['orders/'+oid.replace(/[^a-zA-Z0-9]/g,'_')]=o;
    }
    up['sales/requests/'+uid+'/'+rid]=req;
  }
  // individual rules
  if(p.k==='bank') up['sales/memberRules/'+uid]={mode:'perPanel',perPanel:12,pct:null,ts:now};
  if(p.k==='mint') up['sales/memberRules/'+uid]={mode:'pct',pct:6,perPanel:null,ts:now};
  // chats
  const chats=[[['partner','สวัสดีค่ะ KP028 มีของพร้อมส่งไหมคะ ลูกค้าต้องการ 40 แผ่น'],['kp','มีค่ะ พร้อมส่ง สั่งในแอปได้เลยค่ะ']],
    [['partner','ลูกค้าขอดูของจริงที่ร้านวันเสาร์ได้ไหมครับ'],['kp','ได้ครับ แจ้งเวลามาก่อนนะครับ ดูได้ที่โชว์รูม']],
    [['partner','ส่งเกาะสมุยคิดค่าส่งเพิ่มเท่าไหร่คะ'],['kp','กล่องละ 400 บาทค่ะ'],['partner','ขอบคุณค่ะ']],
    [['partner','ออเดอร์ล่าสุดส่งวันไหนครับ']]];
  const thread=chats[pi%chats.length]; let t=now-(5-pi)*3600e3;
  thread.forEach(function(m,j){ up['sales/chat/'+uid+'/m'+p.k+j]={from:m[0],text:m[1],ts:t+j*600e3,by:m[0]==='kp'?'KP':null}; });
  up['sales/chatSeen/'+uid]={partner:t, kp: pi%2? t+thread.length*600e3 : t};
  // payouts
  if(p.k==='nok'||p.k==='ploy') up['sales/payouts/'+uid+'/tp1']={amount:p.k==='nok'?850:420,note:'โอน SCB (ทดสอบ)',ts:now-6*DAY,date:new Date(now-6*DAY).toISOString().slice(0,10)};
});
fs.writeFileSync(process.argv[2], JSON.stringify(up));
console.log('paths',Object.keys(up).length,'orders',Object.keys(up).filter(k=>k.startsWith('orders/')).length);
