/* tour-geo.js — WORTGLEICH aus index.html gezogen (Positions-Logik: Gazetteer,
   Adress-Parser, gelernte Pins, Pin-Pruefung). NICHT hier aendern — in index.html
   aendern und mit scratchpad/geo-ext2.cjs neu ziehen, sonst zeigt die Karte
   andere Pins als die App. Stand: 2026-09-15 */

var customerMeta={}, shipperLoc={}, handoverLoc={}, homeLoc=null;
var KP_TH_GEO_URL='data/th-geo.json';
var KP_TH_GEO=null;            // raw gazetteer file
var _kpGeoIdx=null;            // derived lookup indexes (built once, in memory)
var _kpGeoLoading=false, _kpGeoFailed=false, _kpGeoWait=[];
var _KPA_ZIP=/(?:^|[^0-9])([1-9][0-9]{4})(?![0-9])/g;
var _KPA_TAM=/(?:ตำบล|แขวง|ต\s*\.)\s*([\u0E00-\u0E7F][\u0E00-\u0E7F\s]*)/;
var _KPA_AMP=/(?:กิ่งอำเภอ|อำเภอ|เขต|อ\s*\.)\s*([\u0E00-\u0E7F][\u0E00-\u0E7F\s]*)/;
var addrFix={};
var geoLearn={};
var KP_PIN_ADDR_LIMIT = 40;      // km a SHARP address may overrule a pin by
var KP_PROVINCES=['กรุงเทพมหานคร','สมุทรปราการ','นนทบุรี','ปทุมธานี','พระนครศรีอยุธยา','อ่างทอง','ลพบุรี','สิงห์บุรี','ชัยนาท','สระบุรี','นครนายก','นครปฐม','สมุทรสาคร','สมุทรสงคราม','สุพรรณบุรี','ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','ปราจีนบุรี','สระแก้ว','เชียงใหม่','เชียงราย','ลำพูน','ลำปาง','อุตรดิตถ์','แพร่','น่าน','พะเยา','แม่ฮ่องสอน','นครสวรรค์','อุทัยธานี','กำแพงเพชร','ตาก','สุโขทัย','พิษณุโลก','พิจิตร','เพชรบูรณ์','นครราชสีมา','บุรีรัมย์','สุรินทร์','ศรีสะเกษ','อุบลราชธานี','ยโสธร','ชัยภูมิ','อำนาจเจริญ','หนองบัวลำภู','ขอนแก่น','อุดรธานี','เลย','หนองคาย','มหาสารคาม','ร้อยเอ็ด','กาฬสินธุ์','สกลนคร','นครพนม','มุกดาหาร','บึงกาฬ','กาญจนบุรี','ราชบุรี','เพชรบุรี','ประจวบคีรีขันธ์','นครศรีธรรมราช','กระบี่','พังงา','ภูเก็ต','สุราษฎร์ธานี','ระนอง','ชุมพร','สงขลา','สตูล','ตรัง','พัทลุง','ปัตตานี','ยะลา','นราธิวาส'];
var KP_PROV_ALIAS={
  'อยุธยา':'พระนครศรีอยุธยา','กรุงเทพ':'กรุงเทพมหานคร','กทม':'กรุงเทพมหานคร','บางกอก':'กรุงเทพมหานคร',
  'โคราช':'นครราชสีมา','อุบล':'อุบลราชธานี','สุราษฎร์':'สุราษฎร์ธานี','สุราษฏร์ธานี':'สุราษฎร์ธานี',
  'นครศรี':'นครศรีธรรมราช','ประจวบ':'ประจวบคีรีขันธ์','ศรีสะเกส':'ศรีสะเกษ','อยุทธยา':'พระนครศรีอยุธยา',
  'พระนครศรีอยุธยา':'พระนครศรีอยุธยา'
  // deliberately NOT aliased: หนองบัว — there are sub-districts called ต.หนองบัว all over
  // the country, it would drag those addresses into หนองบัวลำภู.
};
var KP_PROV_ZONE=(function(){
  var Z={
    Northern:{th:['เชียงราย','เชียงใหม่','แม่ฮ่องสอน','พะเยา','น่าน','ลำปาง','ลำพูน','แพร่','อุตรดิตถ์','ตาก','สุโขทัย','พิษณุโลก','กำแพงเพชร','เพชรบูรณ์','พิจิตร','นครสวรรค์','อุทัยธานี','ชัยนาท','ลพบุรี','สิงห์บุรี','อ่างทอง'],
      en:['Chiang Rai','Chiang Mai','Mae Hong Son','Phayao','Nan','Lampang','Lamphun','Phrae','Uttaradit','Tak','Sukhothai','Phitsanulok','Kamphaeng Phet','Phetchabun','Phichit','Nakhon Sawan','Uthai Thani','Chai Nat','Lopburi','Sing Buri','Ang Thong']},
    Bangkok:{th:['สระบุรี','สุพรรณบุรี','พระนครศรีอยุธยา','กาญจนบุรี','นครนายก','ปทุมธานี','นนทบุรี','กรุงเทพมหานคร','สมุทรปราการ','นครปฐม','สมุทรสาคร','ราชบุรี','สมุทรสงคราม'],
      en:['Saraburi','Suphan Buri','Ayutthaya','Kanchanaburi','Nakhon Nayok','Pathum Thani','Nonthaburi','Bangkok','Samut Prakan','Nakhon Pathom','Samut Sakhon','Ratchaburi','Samut Songkhram']},
    Northeastern:{th:['บึงกาฬ','หนองคาย','เลย','หนองบัวลำภู','อุดรธานี','สกลนคร','นครพนม','ขอนแก่น','กาฬสินธุ์','มหาสารคาม','มุกดาหาร','ร้อยเอ็ด','ยโสธร','อำนาจเจริญ','ชัยภูมิ','นครราชสีมา','บุรีรัมย์','สุรินทร์','ศรีสะเกษ','อุบลราชธานี'],
      en:['Bueng Kan','Nong Khai','Loei','Nong Bua Lamphu','Udon Thani','Sakon Nakhon','Nakhon Phanom','Khon Kaen','Kalasin','Maha Sarakham','Mukdahan','Roi Et','Yasothon','Amnat Charoen','Chaiyaphum','Nakhon Ratchasima','Buriram','Surin','Sisaket','Ubon Ratchathani']},
    Eastern:{th:['ปราจีนบุรี','ฉะเชิงเทรา','สระแก้ว','ชลบุรี','จันทบุรี','ระยอง','ตราด'],
      en:['Prachin Buri','Chachoengsao','Sa Kaeo','Chon Buri','Chanthaburi','Rayong','Trat']},
    Southern:{th:['เพชรบุรี','ประจวบคีรีขันธ์','ชุมพร','ระนอง','สุราษฎร์ธานี','พังงา','กระบี่','ภูเก็ต','นครศรีธรรมราช','ตรัง','พัทลุง','สตูล','สงขลา','ปัตตานี','ยะลา','นราธิวาส'],
      en:['Phetchaburi','Prachuap Khiri Khan','Chumphon','Ranong','Surat Thani','Phang Nga','Krabi','Phuket','Nakhon Si Thammarat','Trang','Phatthalung','Satun','Songkhla','Pattani','Yala','Narathiwat']}
  };
  var map={}, en2th={}, th2en={};
  function norm(s){ return String(s).toLowerCase().replace(/[\s\-\.]/g,''); }
  Object.keys(Z).forEach(function(zone){
    Z[zone].th.forEach(function(n,i){ map[n]=zone; th2en[n]=Z[zone].en[i]; });   // Thai: exact name
    // th/en arrays run in parallel — the same walk also yields English → Thai
    // canonical, which the tour map needs to place English-typed provinces, and
    // Thai → English, which is the only honest romanisation the app owns.
    Z[zone].en.forEach(function(n,i){ map[norm(n)]=zone; en2th[norm(n)]=Z[zone].th[i]; });
  });
  window.KP_PROV_EN2TH=en2th;
  window.KP_PROV_TH2EN=th2en;
  return map;
})();
var KP_PROV_GEO={
  'กรุงเทพมหานคร':[13.7563,100.5018],'สมุทรปราการ':[13.5991,100.5998],'นนทบุรี':[13.8621,100.5144],
  'ปทุมธานี':[14.0208,100.5250],'พระนครศรีอยุธยา':[14.3532,100.5684],'อ่างทอง':[14.5896,100.4550],
  'ลพบุรี':[14.7995,100.6534],'สิงห์บุรี':[14.8879,100.4049],'ชัยนาท':[15.1855,100.1251],
  'สระบุรี':[14.5289,100.9108],'นครนายก':[14.2069,101.2130],'นครปฐม':[13.8196,100.0645],
  'สมุทรสาคร':[13.5475,100.2745],'สมุทรสงคราม':[13.4098,100.0023],'สุพรรณบุรี':[14.4745,100.1177],
  'ชลบุรี':[13.3611,100.9847],'ระยอง':[12.6814,101.2789],'จันทบุรี':[12.6100,102.1035],
  'ตราด':[12.2428,102.5175],'ฉะเชิงเทรา':[13.6904,101.0780],'ปราจีนบุรี':[14.0509,101.3703],
  'สระแก้ว':[13.8240,102.0645],'เชียงใหม่':[18.7883,98.9853],'เชียงราย':[19.9105,99.8406],
  'ลำพูน':[18.5744,99.0087],'ลำปาง':[18.2888,99.4909],'อุตรดิตถ์':[17.6200,100.0993],
  'แพร่':[18.1445,100.1403],'น่าน':[18.7756,100.7730],'พะเยา':[19.1664,99.9003],
  'แม่ฮ่องสอน':[19.3020,97.9654],'นครสวรรค์':[15.7047,100.1372],'อุทัยธานี':[15.3835,100.0248],
  'กำแพงเพชร':[16.4828,99.5227],'ตาก':[16.8840,99.1259],'สุโขทัย':[17.0078,99.8237],
  'พิษณุโลก':[16.8211,100.2659],'พิจิตร':[16.4429,100.3487],'เพชรบูรณ์':[16.4190,101.1591],
  'นครราชสีมา':[14.9799,102.0977],'บุรีรัมย์':[14.9930,103.1029],'สุรินทร์':[14.8818,103.4936],
  'ศรีสะเกษ':[15.1186,104.3220],'อุบลราชธานี':[15.2287,104.8570],'ยโสธร':[15.7942,104.1452],
  'ชัยภูมิ':[15.8068,102.0315],'อำนาจเจริญ':[15.8656,104.6258],'หนองบัวลำภู':[17.2218,102.4266],
  'ขอนแก่น':[16.4419,102.8360],'อุดรธานี':[17.4139,102.7872],'เลย':[17.4860,101.7223],
  'หนองคาย':[17.8783,102.7413],'มหาสารคาม':[16.1851,103.3027],'ร้อยเอ็ด':[16.0538,103.6520],
  'กาฬสินธุ์':[16.4315,103.5059],'สกลนคร':[17.1545,104.1348],'นครพนม':[17.3948,104.7692],
  'มุกดาหาร':[16.5453,104.7235],'บึงกาฬ':[18.3609,103.6466],'กาญจนบุรี':[14.0227,99.5328],
  'ราชบุรี':[13.5282,99.8134],'เพชรบุรี':[13.1119,99.9399],'ประจวบคีรีขันธ์':[11.8126,99.7957],
  'นครศรีธรรมราช':[8.4304,99.9631],'กระบี่':[8.0863,98.9063],'พังงา':[8.4510,98.5150],
  'ภูเก็ต':[7.8804,98.3923],'สุราษฎร์ธานี':[9.1382,99.3215],'ระนอง':[9.9529,98.6085],
  'ชุมพร':[10.4930,99.1800],'สงขลา':[7.1897,100.5954],'สตูล':[6.6238,100.0674],
  'ตรัง':[7.5563,99.6114],'พัทลุง':[7.6167,100.0743],'ปัตตานี':[6.8692,101.2550],
  'ยะลา':[6.5411,101.2803],'นราธิวาส':[6.4254,101.8253]
};
var KP_WHY_LABEL={
  carrier:{th:'ถ่ายที่ท่ารถขนส่ง',en:'taken on a carrier yard',fix:'ลบหมุด / drop the pin'},
  shop:{th:'ถ่ายที่ร้าน/คลัง',en:'taken at the shop',fix:'ลบหมุด / drop the pin'},
  handover:{th:'อยู่ที่จุดส่งต่อ (ท่าเรือ/ท่ารถ)',en:'at a known handover point',fix:'ลบหมุด — บ้านลูกค้าอยู่ที่อื่น / drop the pin, the customer lives elsewhere'},
  province:{th:'หมุดอยู่คนละจังหวัดกับที่อยู่',en:'pin is in a different province than the address',fix:'ตรวจว่าที่อยู่หรือหมุดผิด / check which of the two is wrong'},
  far:{th:'หมุดห่างจากที่อยู่มาก',en:'pin is far from the address',fix:'ลบหรือย้ายหมุด / drop or move the pin'},
  wide:{th:'ห่างจากกลางตำบลพอสมควร',en:'a bit far from the sub-district centre',fix:'ปกติในตำบลใหญ่ / normal in a large sub-district'},
  vague:{th:'ที่อยู่ไม่มี ต./อ. ที่อ่านออก',en:'no readable sub-district in the address',fix:'เติมที่อยู่ / complete the address'},
  noaddr:{th:'ที่อยู่ไม่มีจังหวัด',en:'address has no province',fix:'เติมจังหวัด / add the province'},
  multi:{th:'เบอร์เดียวกัน 2 ที่อยู่ไกลกัน',en:'one phone, two far-apart addresses',fix:'หมุดเดียวใช้ไม่ได้ / one pin cannot serve both'},
  nogps:{th:'พิกัดไม่ถูกต้อง',en:'invalid coordinates',fix:'ลบหมุด / drop the pin'}
};

function shipKey(name){ return String(name||'').trim().replace(/[.#$\[\]\/]/g,'_'); }

function shipperLatLng(name){
  var e=shipperLoc[shipKey(name)];
  return (e && geoSane(e.lat,e.lng)) ? {lat:e.lat,lng:e.lng} : null;
}

function custGeoGet(phone){
  try{ var k=normPhone(phone); if(!k) return null; var m=customerMeta[k]; return (m&&m.geo&&typeof m.geo.lat==='number')?m.geo:null; }catch(e){ return null; }
}

function geoSane(lat,lng){ return typeof lat==='number'&&typeof lng==='number'&&isFinite(lat)&&isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0); }

function kpKm(aLat,aLng,bLat,bLng){
  var k=Math.cos((aLat+bLat)/2*Math.PI/180);
  var dy=(aLat-bLat)*110.574, dx=(aLng-bLng)*111.320*k;
  return Math.sqrt(dx*dx+dy*dy);
}

function kpGeoNorm(s){
  return String(s==null?'':s).replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[\s.,\-()\/\\'"]+/g,'');
}

function kpThaiFix(s){ return String(s==null?'':s).replace(/\u0E4D\u0E32/g,'\u0E33'); }

function _kpLev(a,b){
  var m=a.length, n=b.length, prev=[], cur=[], i, j;
  for(j=0;j<=n;j++) prev[j]=j;
  for(i=1;i<=m;i++){
    cur[0]=i;
    for(j=1;j<=n;j++){
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a.charAt(i-1)===b.charAt(j-1)?0:1));
    }
    prev=cur.slice();
  }
  return prev[n];
}

function kpProvFix(name){
  if(!_kpGeoIdx) return '';
  var t=kpThaiFix(name).replace(/^(จังหวัด\s*|จ\s*\.\s*)/,'').replace(/[\s.\-]/g,'');
  if(!t) return '';
  var all=Object.keys(_kpGeoIdx.prov);
  if(_kpGeoIdx.prov[t]) return t;
  // a truncated name ("สุราษ") — only if exactly one province starts with it
  if(t.length>=4){
    var pre=all.filter(function(p){ return p.indexOf(t)===0; });
    if(pre.length===1) return pre[0];
  }
  // a misspelling — the winner has to be strictly better than the runner-up,
  // or ตรัง/ตราด and ระยอง/ระนอง would start swapping places
  var lim=Math.min(3, Math.max(1, Math.floor(t.length/3)));
  var best='', bd=99, second=99;
  all.forEach(function(p){
    var d=_kpLev(t,p);
    if(d<bd){ second=bd; bd=d; best=p; } else if(d<second){ second=d; }
  });
  return (bd<=lim && bd<second) ? best : '';
}

function kpGeoReady(){ return !!_kpGeoIdx; }

function kpGeoLoad(cb){
  if(_kpGeoIdx){ if(cb) cb(true); return; }
  if(cb) _kpGeoWait.push(cb);
  if(_kpGeoLoading) return;
  var fin=function(ok){
    _kpGeoLoading=false;
    var w=_kpGeoWait; _kpGeoWait=[];
    w.forEach(function(f){ try{ f(ok); }catch(e){} });
  };
  if(_kpGeoFailed){ fin(false); return; }
  _kpGeoLoading=true;
  fetch(KP_TH_GEO_URL).then(function(r){ return r.ok?r.json():null; })
    .then(function(j){
      if(j&&j.p){ try{ KP_TH_GEO=j; kpGeoBuildIndex(); }catch(e){ _kpGeoFailed=true; } }
      else _kpGeoFailed=true;
      fin(!!_kpGeoIdx);
    })
    .catch(function(){ _kpGeoFailed=true; fin(false); });
}

function kpGeoBuildIndex(){
  var P=KP_TH_GEO.p, idx={prov:{}, zip:{}, flat:[]};
  Object.keys(P).forEach(function(prov){
    var pe={amp:{}, ampN:[], tamN:[]};
    Object.keys(P[prov]).forEach(function(amp){
      var A=P[prov][amp];
      var ae={name:amp, lat:A.c[0], lng:A.c[1], zip:A.z, tam:{}, list:[]};
      Object.keys(A.t).forEach(function(tam){
        var v=A.t[tam];
        var te={name:tam, amp:amp, prov:prov, lat:v[0], lng:v[1], zip:(v[2]||A.z)};
        ae.tam[kpGeoNorm(tam)]=te; ae.list.push(te);
        pe.tamN.push({n:kpGeoNorm(tam), e:te});
        idx.flat.push(te);
        (idx.zip[te.zip]=idx.zip[te.zip]||[]).push(te);
      });
      pe.amp[kpGeoNorm(amp)]=ae;
      pe.ampN.push({n:kpGeoNorm(amp), e:ae});
    });
    // Longest name first, always: "เมืองชัยภูมิ" must win over a bare "เมือง",
    // and "บ้านหันใหม่" over "บ้านหัน".
    pe.ampN.sort(function(a,b){ return b.n.length-a.n.length; });
    pe.tamN.sort(function(a,b){ return b.n.length-a.n.length; });
    idx.prov[prov]=pe;
  });
  // Postal code → mean point of its tambon + the province it belongs to. The zip
  // is the one part of a Thai address customers almost never get wrong.
  Object.keys(idx.zip).forEach(function(z){
    var l=idx.zip[z], la=0, ln=0, pv={};
    l.forEach(function(t){ la+=t.lat; ln+=t.lng; pv[t.prov]=(pv[t.prov]||0)+1; });
    var top='', tn=-1;
    Object.keys(pv).forEach(function(p){ if(pv[p]>tn){ tn=pv[p]; top=p; } });
    idx.zip[z]={lat:la/l.length, lng:ln/l.length, prov:top, n:l.length, list:l};
  });
  // How far apart do sub-districts sit HERE? A khwaeng in Bangkok has neighbours
  // 1.5 km away; ต.แม่ละมุ้ง in อ.อุ้มผาง — the largest district in the country —
  // has them 25 km away. One flat "25 km is too far" therefore means two
  // different things, and it was calling honest rural pins wrong (1-023) while
  // waving through city pins that really were in the wrong street. So every
  // tambon carries its own scale: the distance to its nearest neighbour.
  // Bucketed by 0.1° and searched 3x3, so it stays a few milliseconds.
  var grid={};
  idx.flat.forEach(function(t){
    var k=Math.round(t.lat*10)+':'+Math.round(t.lng*10);
    (grid[k]=grid[k]||[]).push(t);
  });
  idx.flat.forEach(function(t){
    var gy=Math.round(t.lat*10), gx=Math.round(t.lng*10), best=Infinity;
    for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){
      var cell=grid[(gy+dy)+':'+(gx+dx)]; if(!cell) continue;
      for(var i=0;i<cell.length;i++){
        var u=cell[i]; if(u===t) continue;
        var d=kpKm(t.lat,t.lng,u.lat,u.lng);
        if(d<best) best=d;
      }
    }
    // No neighbour inside ~11 km means the place is genuinely remote.
    t.sp=isFinite(best)?+best.toFixed(2):18;
  });
  // An amphoe inherits the median spacing of its own tambon.
  Object.keys(idx.prov).forEach(function(prov){
    var PE=idx.prov[prov];
    Object.keys(PE.amp).forEach(function(k){
      var ae=PE.amp[k];
      var sps=ae.list.map(function(t){ return t.sp; }).sort(function(a,b){ return a-b; });
      ae.sp=sps.length?sps[Math.floor(sps.length/2)]:18;
    });
  });
  _kpGeoIdx=idx;
}

function kpGeoLimit(pred){
  if(!pred) return 150;
  var sp=(typeof pred.sp2==='number'&&pred.sp2>0)?pred.sp2:0;
  if(pred.level==='tambon') return sp?Math.max(25,Math.min(70,4*sp)):25;
  if(pred.level==='amphoe') return sp?Math.max(40,Math.min(90,2.5*sp)):40;
  return pred.level==='zip'?45:150;
}

function kpGeoWideLimit(pred){
  var sp=(pred&&typeof pred.sp2==='number'&&pred.sp2>0)?pred.sp2:0;
  return sp?Math.max(8,Math.min(30,2*sp)):8;
}

function kpAddrHash(s){
  var t=kpGeoNorm(s), h=2166136261;
  for(var i=0;i<t.length;i++){ h^=t.charCodeAt(i); h=(h*16777619)>>>0; }
  return h.toString(36);
}

function kpAddrParse(text, provHint){
  // Zero-width characters come in with pasted LINE addresses and sit INSIDE
  // words ("ต.บ้าน<ZWSP>พรุ"). They are invisible to a human and fatal to the
  // marker capture, which stops at the first non-Thai character — 4-109 read as
  // ต.หาดใหญ่ instead of ต.บ้านพรุ purely because of one of them.
  var raw=kpThaiFix(String(text||'').replace(/[\u200B-\u200D\uFEFF\u00AD]/g,''));
  var out={prov:'',amphoe:'',tambon:'',zip:0,level:'',amb:false,fixed:false,lat:0,lng:0};
  if(!raw && !provHint) return out;

  // ── postcode: the LAST standalone 5-digit group in the Thai range. House
  // numbers ("174/5") and phone fragments are excluded by the digit guards.
  var m, last=0;
  _KPA_ZIP.lastIndex=0;
  while((m=_KPA_ZIP.exec(raw))!==null){ var z=+m[1]; if(z>=10000&&z<=96999) last=z; }
  out.zip=last;

  // ── province: what is typed on the order wins, else read it out of the text,
  // else derive it from the postcode.
  var p;
  if(!_kpGeoIdx){
    p=kpCanonProvince(String(provHint||'').trim()||kpExtractProvince(raw));
  } else {
    var resolve=function(x){
      if(!x) return '';
      x=kpThaiFix(String(x).trim());
      if(_kpGeoIdx.prov[x]) return x;
      var th=(window.KP_PROV_EN2TH||{})[String(x).toLowerCase().replace(/[\s\-.]/g,'')];
      if(th && _kpGeoIdx.prov[th]) return th;
      return kpProvFix(x);
    };
    // A province written with จ./จังหวัด in the address is the customer's own
    // statement and beats the dropdown on the order form. #131 sat in นครพนม for
    // months because the field said so, while its address plainly read
    // "จ.อยุธยา" — and its driver pin had been in Ayutthaya the whole time.
    var mp=raw.match(/(?:จังหวัด|จ\s*\.)\s*([\u0E00-\u0E7F]+)/);
    p = resolve(mp?kpCanonProvince(mp[1]):'')
     || resolve(kpCanonProvince(String(provHint||'').trim()))
     || resolve(kpCanonProvince(kpExtractProvince(raw)));
    if(!p && out.zip && _kpGeoIdx.zip[out.zip]) p=_kpGeoIdx.zip[out.zip].prov;
  }
  out.prov=p||'';
  if(!_kpGeoIdx){ out.level=out.prov?'prov':''; return out; }

  // ── a hand/AI correction for exactly this address overrides everything
  var fx=addrFix[kpAddrHash(raw)];
  if(fx && fx.prov && _kpGeoIdx.prov[fx.prov]){
    out.prov=fx.prov; out.amphoe=fx.amphoe||''; out.tambon=fx.tambon||''; out.fixed=true;
    var pe0=_kpGeoIdx.prov[fx.prov];
    var ae0=out.amphoe?pe0.amp[kpGeoNorm(out.amphoe)]:null;
    var te0=(ae0&&out.tambon)?ae0.tam[kpGeoNorm(out.tambon)]:null;
    if(te0){ out.level='tambon'; out.lat=te0.lat; out.lng=te0.lng; out.sp2=te0.sp; }
    else if(ae0){ out.level='amphoe'; out.tambon=''; out.lat=ae0.lat; out.lng=ae0.lng; out.sp2=ae0.sp; }
    else out.level='prov';
    return out;
  }

  var PE=_kpGeoIdx.prov[out.prov];
  if(!PE){ out.level=out.prov?'prov':''; return out; }

  var hay=kpGeoNorm(raw);
  var mt=raw.match(_KPA_TAM), ma=raw.match(_KPA_AMP);
  var hayT=mt?kpGeoNorm(mt[1]):'', hayA=ma?kpGeoNorm(ma[1]):'';

  // ── amphoe. Only ever used to CHOOSE between same-named sub-districts and as
  // the fallback level; a wrong amphoe must not be able to hide the tambon.
  var AE=null, aeSure=false, provN=kpGeoNorm(out.prov);
  if(hayA){
    // "อ.เมือง" alone means the capital district, which the register spells
    // "เมือง" + province.
    var cap=PE.amp[kpGeoNorm('เมือง'+out.prov)];
    for(var i=0;!AE&&i<PE.ampN.length;i++) if(hayA.indexOf(PE.ampN[i].n)===0) AE=PE.ampN[i].e;
    // "อ.เมือง จ.เพชรบุรี" captures "เมือง จ" — the marker stops at the next dot,
    // so an exact "เมือง" test misses it and the order kept no district at all
    // (4-196). Anything STARTING with เมือง means the capital district; no other
    // Thai district name begins with it.
    if(!AE && cap && hayA.indexOf('เมือง')===0) AE=cap;
    aeSure=!!AE;                     // it sat behind an อ./อำเภอ/เขต marker
  }
  if(!AE) for(var i2=0;i2<PE.ampN.length;i2++){
    if(PE.ampN[i2].n.length>=3 && PE.ampN[i2].n!==provN && hay.indexOf(PE.ampN[i2].n)>=0){ AE=PE.ampN[i2].e; break; }
  }
  // The postcode can still name the amphoe when the text does not.
  if(!AE && out.zip && _kpGeoIdx.zip[out.zip] && _kpGeoIdx.zip[out.zip].prov===out.prov){
    var amps={};
    _kpGeoIdx.zip[out.zip].list.forEach(function(t){ amps[t.amp]=1; });
    var an=Object.keys(amps);
    if(an.length===1) AE=PE.amp[kpGeoNorm(an[0])]||null;
  }

  // ── tambon: searched province-wide, then narrowed. A name that exists twice in
  // the province and cannot be pinned to an amphoe or a postcode is AMBIGUOUS —
  // we drop a level rather than guess (285 of the 7,436 names are).
  var cands=[];
  var pick=function(needle,mode){
    for(var j=0;j<PE.tamN.length;j++){
      var c=PE.tamN[j];
      if(c.n.length<3) continue;
      // A loose scan must never latch onto the PROVINCE's own name. Several
      // provinces have a sub-district spelled exactly like themselves, and
      // "จ.นครนายก" at the end of every Nakhon Nayok address would otherwise be
      // read as ต.นครนายก — which is how #135 in อ.องครักษ์ was placed 26 km
      // away in the provincial capital.
      if(mode==='contains' && c.n===provN) continue;
      // Same trap one level down: "อ.หาดใหญ่" in the text is not a mention of
      // ต.หาดใหญ่. When the district stood behind its own marker, its name is
      // already accounted for and must not be read as a sub-district too.
      if(mode==='contains' && aeSure && AE && c.n===kpGeoNorm(AE.name)) continue;
      var hitv = mode==='prefix' ? (needle.indexOf(c.n)===0) : (needle.indexOf(c.n)>=0);
      if(hitv) return PE.tamN.filter(function(x){ return x.n===c.n; }).map(function(x){ return x.e; });
    }
    return [];
  };
  if(hayT) cands=pick(hayT,'prefix');
  if(!cands.length) cands=pick(hay,'contains');
  if(cands.length && AE){
    var byAmp=cands.filter(function(t){ return t.amp===AE.name; });
    // A district that stood behind an อ. marker outranks a sub-district found
    // anywhere in the text: if they disagree, the sub-district is the wrong one
    // (usually a misspelling that happened to match somewhere else). Drop to
    // district level instead of moving the order into another district.
    if(byAmp.length) cands=byAmp;
    else if(aeSure) cands=[];
  }
  if(cands.length>1 && out.zip){
    var byZip=cands.filter(function(t){ return t.zip===out.zip; });
    if(byZip.length===1) cands=byZip;
  }
  var TE = cands.length===1 ? cands[0] : null;
  if(cands.length>1) out.amb=true;

  if(TE){
    out.tambon=TE.name; out.amphoe=TE.amp; out.level='tambon'; out.lat=TE.lat; out.lng=TE.lng; out.sp2=TE.sp;
  } else if(AE){
    out.amphoe=AE.name; out.level='amphoe'; out.lat=AE.lat; out.lng=AE.lng; out.sp2=AE.sp;
  } else if(out.zip && _kpGeoIdx.zip[out.zip] && _kpGeoIdx.zip[out.zip].prov===out.prov){
    out.level='zip'; out.lat=_kpGeoIdx.zip[out.zip].lat; out.lng=_kpGeoIdx.zip[out.zip].lng;
  } else {
    out.level='prov';
  }
  return out;
}

function kpAddrOf(o){
  if(!o) return kpAddrParse('','');
  var sig=(o.address||'')+'|'+(o.province||'')+'|'+(_kpGeoIdx?'i':'-');
  if(o._addrSig===sig && o._addr) return o._addr;
  o._addrSig=sig; o._addr=kpAddrParse(o.address||'', o.province||'');
  return o._addr;
}

function kpAddrKeys(a){
  var ks=[];
  if(!a) return ks;
  // Sanitised straight away, so the in-memory key and the Firebase path are the
  // same string everywhere and a lookup can never miss because of an escape.
  if(a.prov&&a.amphoe&&a.tambon) ks.push(kpGeoKeySafe('T~'+a.prov+'~'+a.amphoe+'~'+a.tambon));
  if(a.prov&&a.amphoe) ks.push(kpGeoKeySafe('A~'+a.prov+'~'+a.amphoe));
  return ks;
}

function kpGeoKeySafe(k){ return String(k).replace(/[.#$/\[\]]/g,'_'); }

function kpGeoReverse(lat,lng){
  if(!_kpGeoIdx||!geoSane(lat,lng)) return null;
  var F=_kpGeoIdx.flat, k=Math.cos(lat*Math.PI/180), best=null, bd=Infinity;
  for(var i=0;i<F.length;i++){
    var t=F[i], dy=t.lat-lat, dx=(t.lng-lng)*k, d=dy*dy+dx*dx;
    if(d<bd){ bd=d; best=t; }
  }
  if(!best) return null;
  return {prov:best.prov, amphoe:best.amp, tambon:best.name, zip:best.zip,
          km:Math.round(kpKm(lat,lng,best.lat,best.lng)*10)/10};
}

function kpLearnUsable(e,level){
  if(!e||!e.n||!geoSane(e.lat,e.lng)) return false;
  return level==='tambon' ? (e.n>=2 && (e.sp==null||e.sp<=8))
                          : (e.n>=3 && (e.sp==null||e.sp<=20));
}

function kpGeoPredict(o, addr){
  var a=addr||kpAddrOf(o);
  if(!a) return null;
  var L=function(level,src,lat,lng,e,key){
    var n=e?e.n:0, sp=e?e.sp:null;
    return {lat:lat,lng:lng,level:level,src:src,n:n,sp:sp,key:key||'',sp2:(a.sp2||0),
      label:(src==='learn' ? ('learned from '+n+' deliveries'+(sp!=null?' (±'+sp+' km)':''))
            : level==='tambon' ? 'sub-district centre'
            : level==='amphoe' ? 'district centre'
            : level==='zip'    ? 'postal code' : 'province only'),
      labelTh:(src==='learn' ? ('เรียนจากการส่งจริง '+n+' ราย'+(sp!=null?' (±'+sp+' กม.)':''))
            : level==='tambon' ? 'กลางตำบล'
            : level==='amphoe' ? 'กลางอำเภอ'
            : level==='zip'    ? 'จากรหัสไปรษณีย์' : 'ประมาณจากจังหวัด')};
  };
  var ks=kpAddrKeys(a);
  // learned tambon > gazetteer tambon > learned amphoe > gazetteer amphoe/zip > province
  if(a.tambon && ks.length){
    var eT=geoLearn[ks[0]];
    if(kpLearnUsable(eT,'tambon')) return L('tambon','learn',eT.lat,eT.lng,eT,ks[0]);
  }
  if(a.level==='tambon' && geoSane(a.lat,a.lng)) return L('tambon','gaz',a.lat,a.lng,null,ks[0]||'');
  if(a.amphoe && ks.length){
    var kA=ks[ks.length-1], eA=geoLearn[kA];
    if(kpLearnUsable(eA,'amphoe')) return L('amphoe','learn',eA.lat,eA.lng,eA,kA);
  }
  if((a.level==='amphoe'||a.level==='zip') && geoSane(a.lat,a.lng)) return L(a.level,'gaz',a.lat,a.lng,null,'');
  var g=a.prov?KP_PROV_GEO[a.prov]:null;
  return g?L('prov','prov',g[0],g[1],null,''):null;
}

function kpGeoWhy(o, lat, lng, pred, addr){
  if(!geoSane(lat,lng)) return {code:'nogps',hard:true,th:'พิกัดไม่ถูกต้อง',en:'invalid coordinates'};
  var a=addr||kpAddrOf(o);
  // 1 — standing on a carrier's yard: a handover spot, never a home address.
  try{
    var bn='', bk=Infinity;
    Object.keys(shipperLoc||{}).forEach(function(k){
      var v=shipperLoc[k]||{};
      if(typeof v.lat!=='number'||typeof v.lng!=='number') return;
      var d=kpKm(lat,lng,v.lat,v.lng);
      if(d<bk){ bk=d; bn=v.name||k; }
    });
    if(bk<0.4) return {code:'carrier',hard:true,th:'อยู่ที่ท่ารถ '+bn,en:'on the '+bn+' carrier yard'};
  }catch(e){}
  // 1b — a known handover point (ferry pier, terminal, pick-up spot). Wider than
  // a yard, because a pier is.
  try{
    var hk='', hd=Infinity, hr=1.5;
    Object.keys(handoverLoc||{}).forEach(function(k){
      var v=handoverLoc[k]||{};
      if(typeof v.lat!=='number'||typeof v.lng!=='number') return;
      var d=kpKm(lat,lng,v.lat,v.lng);
      if(d<hd){ hd=d; hk=v.name||k; hr=(typeof v.r==='number'&&v.r>0)?v.r:1.5; }
    });
    if(hd<hr) return {code:'handover',hard:true,th:'อยู่ที่จุดส่งต่อ '+hk+' ไม่ใช่บ้านลูกค้า',
                      en:'at the '+hk+' handover point, not at the customer'};
  }catch(e){}
  // 2 — taken at the shop: the button was pressed while loading, not on site.
  try{
    if(window.homeLoc && geoSane(homeLoc.lat,homeLoc.lng) && kpKm(lat,lng,homeLoc.lat,homeLoc.lng)<0.4)
      return {code:'shop',hard:true,th:'อยู่ที่ร้าน/คลัง ไม่ใช่บ้านลูกค้า',en:'at the shop, not at the customer'};
  }catch(e){}
  // 3 — the pin is in a different province than the address says. With the
  // gazetteer this is exact, not a 150-km guess.
  // Before anything is called WRONG: does this pin simply belong to another order
  // on the same phone? One number can have two building sites, and then the pin is
  // perfectly good — just not for this order. orderRouteLatLng already refuses to
  // route by it, so this is a note, not a fault to be repaired.
  try{
    var ph0=normPhone(o&&o.phone), sib=null;
    if(ph0 && geoSane(a.lat,a.lng)) (orders||[]).some(function(x){
      if(!x||x.id===(o&&o.id)||normPhone(x.phone)!==ph0) return false;
      var xa=kpAddrOf(x);
      if(!xa||xa.level==='prov'||!geoSane(xa.lat,xa.lng)) return false;
      // the sibling's address explains the pin, and ours does not
      if(kpKm(lat,lng,xa.lat,xa.lng)<15 && kpKm(a.lat,a.lng,xa.lat,xa.lng)>25){ sib=x; return true; }
      return false;
    });
    if(sib) return {code:'multi',hard:false,other:sib.id,
      th:'หมุดนี้เป็นของ '+sib.id+' (เบอร์เดียวกัน คนละที่อยู่) — ออเดอร์นี้นำทางตามที่อยู่แล้ว',
      en:'this pin belongs to '+sib.id+' (same phone, different site) — this order already routes by its address'};
  }catch(e){}
  // A pin 3 km from the address can still fall on the far side of a provincial
  // boundary — that is a border, not a mistake, and half the first pin-check run
  // was made of those. It only counts as wrong when it is also FAR.
  var rv=kpGeoReverse(lat,lng);
  if(rv && a.prov && rv.prov!==a.prov && (!pred || kpKm(lat,lng,pred.lat,pred.lng)>15))
    return {code:'province',hard:true,got:rv,
            th:'หมุดอยู่ใน จ.'+rv.prov+' แต่ที่อยู่เขียน จ.'+a.prov,
            en:'pin is in '+rv.prov+', the address says '+a.prov};
  // 4 — nothing to compare against: the address never resolved past the province.
  if(!a.prov) return {code:'noaddr',hard:true,th:'ที่อยู่ไม่มีจังหวัด',en:'address has no province'};
  if(a.level==='prov'||a.amb)
    return {code:'vague',hard:true,
            th:a.amb?'ชื่อตำบลซ้ำในจังหวัดนี้ ต้องระบุอำเภอด้วย':'ที่อยู่ไม่มี ต./อ. ที่รู้จัก',
            en:a.amb?'sub-district name is ambiguous in this province — needs the district'
                    :'no known sub-district/district in the address'};
  // 5 — plain distance from the prediction, judged at the LOCAL scale: how sharp
  // the prediction is, and how far apart sub-districts actually sit here.
  if(pred){
    var km=kpKm(lat,lng,pred.lat,pred.lng);
    var lim=kpGeoLimit(pred);
    if(km>lim) return {code:'far',hard:true,km:Math.round(km),got:rv,
      th:'ห่างจากที่อยู่ ~'+Math.round(km)+' กม.',en:'~'+Math.round(km)+' km from the address'};
    if(pred.level==='tambon' && km>kpGeoWideLimit(pred)) return {code:'wide',hard:false,km:Math.round(km),
      th:'ห่างจากกลางตำบล ~'+Math.round(km)+' กม.',en:'~'+Math.round(km)+' km from the sub-district centre'};
  }
  return null;
}

function orderRouteLatLng(o){
  var c=orderLatLng(o);
  if(!c) { var p0=kpGeoPredict(o); return p0?{lat:p0.lat,lng:p0.lng,from:'addr',pred:p0}:null; }
  if(!_kpGeoIdx) return {lat:c.lat,lng:c.lng,from:'pin'};
  var g=custGeoGet(o&&o.phone);
  if(g&&g.ok) return {lat:c.lat,lng:c.lng,from:'pin'};      // the office has vouched for it
  var pred=kpGeoPredict(o);
  // Only a SHARP address may overrule a pin. A province-level guess never does.
  if(pred && (pred.level==='tambon'||pred.level==='amphoe') && kpKm(c.lat,c.lng,pred.lat,pred.lng)>KP_PIN_ADDR_LIMIT)
    return {lat:pred.lat,lng:pred.lng,from:'addr',pred:pred,rejected:{lat:c.lat,lng:c.lng}};
  return {lat:c.lat,lng:c.lng,from:'pin'};
}

function orderGeoInfo(o){
  var a=kpAddrOf(o), pred=kpGeoPredict(o,a), pin=orderLatLng(o);
  var out={addr:a, pred:pred, pin:pin, why:null, km:null, ok:false, src:''};
  if(pin){
    var g=custGeoGet(o&&o.phone);
    out.ok=!!(g&&g.ok);
    out.src=(g&&g.src)||'link';
    if(pred) out.km=Math.round(kpKm(pin.lat,pin.lng,pred.lat,pred.lng)*10)/10;
    if(!out.ok) out.why=kpGeoWhy(o,pin.lat,pin.lng,pred,a);
  }
  return out;
}

function orderLocUrl(o){
  if(!o) return '';
  var r=(typeof orderRouteLatLng==='function')?orderRouteLatLng(o):null;
  if(r && r.from==='pin') return 'https://www.google.com/maps/search/?api=1&query='+r.lat+','+r.lng;
  var lnk=(o.location||'').trim();
  // …but never a link the app has already decided against — that is exactly the
  // link that sends somebody 700 km the wrong way.
  if(/^https?:\/\//i.test(lnk) && geoLinkTrusted(o,r&&r.pred)) return lnk;
  // No pin we trust and no link — the address still knows its sub-district.
  return r ? ('https://www.google.com/maps/search/?api=1&query='+r.lat+','+r.lng) : '';
}

function orderNavSure(o){
  if(!o) return '';
  var r=(typeof orderRouteLatLng==='function')?orderRouteLatLng(o):null;
  if(r && r.from==='pin') return 'https://www.google.com/maps/dir/?api=1&destination='+r.lat+','+r.lng;
  var lnk=String(o.location||'').trim();
  if(/^https?:\/\//i.test(lnk) && geoLinkTrusted(o, r&&r.pred)) return lnk;
  return '';
}

function orderLocSure(o){
  if(!o) return '';
  var r=(typeof orderRouteLatLng==='function')?orderRouteLatLng(o):null;
  if(r && r.from==='pin') return 'https://www.google.com/maps/search/?api=1&query='+r.lat+','+r.lng;
  var lnk=String(o.location||'').trim();
  if(/^https?:\/\//i.test(lnk) && geoLinkTrusted(o, r&&r.pred)) return lnk;
  return '';
}

function geoLinkOf(o){ return String((o&&o.location)||'').trim(); }

function geoLinkBad(o){
  var l=geoLinkOf(o); if(!l) return false;
  return String((o&&o.geoBadLink)||'').trim()===l;
}

function orderLinkLatLng(o){
  if(!o || geoLinkBad(o)) return null;
  var s=geoLinkOf(o);
  var g=o._geo;
  if(g && geoSane(g.lat,g.lng)){
    // A driver/office pin cached on the order does not hang on the link at all.
    if(g.src!=='maplink') return {lat:g.lat,lng:g.lng};
    if(s && (!g.url || String(g.url).trim()===s)) return {lat:g.lat,lng:g.lng};
  }
  if(!s) return null;
  var m = s.match(/[?&](?:q|query|destination)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i)
       || s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/)
       || s.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/)
       || s.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if(m){ var la=parseFloat(m[1]), ln=parseFloat(m[2]); if(geoSane(la,ln)) return {lat:la,lng:ln}; }
  return null;
}

function geoLinkTrusted(o,pred){
  if(!o || geoLinkBad(o)) return false;
  var lp=orderLinkLatLng(o); if(!lp) return true;
  var p=pred||((typeof kpGeoPredict==='function')?kpGeoPredict(o):null);
  if(p && (p.level==='tambon'||p.level==='amphoe') && typeof kpKm==='function'
     && kpKm(lp.lat,lp.lng,p.lat,p.lng)>KP_PIN_ADDR_LIMIT) return false;
  return true;
}

function orderLatLng(o){
  if(!o) return null;
  var g=custGeoGet(o.phone);
  if(g && geoSane(g.lat,g.lng)) return {lat:g.lat,lng:g.lng};
  return orderLinkLatLng(o);
}

function normPhone(p) {
  // If several numbers are given (separated by / , ; or newline), key by the first one.
  var s = String(p||'').split(/[\/,;\n]/)[0].replace(/[^\d+]/g,'');
  if(!s) return '';
  s = s.replace(/^\+?66/, '0'); // +66xxxxxxxxx / 66xxxxxxxxx → 0xxxxxxxxx
  s = s.replace(/\D/g,'');
  if(s.length < 8) return ''; // too short to be a real number
  return s;
}

function kpCanonProvince(p){
  var t=String(p||'').trim(); if(!t) return '';
  // Staff sometimes type the marker along with the name ("จ.ปทุมธานี"). The dot or the
  // space is required — a bare "จ" prefix would eat the first letter of จันทบุรี.
  t=t.replace(/^(จังหวัด\s*|จ\.\s*|จ\s+)/,'').trim();
  if(KP_PROVINCES.indexOf(t)>=0) return t;
  if(KP_PROV_ALIAS[t]) return KP_PROV_ALIAS[t];
  for(var k in KP_PROV_ALIAS){ if(t.indexOf(k)>=0) return KP_PROV_ALIAS[k]; }
  return t;
}

function kpExtractProvince(text){
  var t=String(text||'');
  if(!t) return '';
  if(/กรุงเทพ|กทม/.test(t)) return 'กรุงเทพมหานคร';
  // Canonical match — take the province whose name appears nearest the end.
  var best='', bestIdx=-1;
  for(var i=0;i<KP_PROVINCES.length;i++){
    var idx=t.lastIndexOf(KP_PROVINCES[i]);
    if(idx>bestIdx){ bestIdx=idx; best=KP_PROVINCES[i]; }
  }
  // Short forms count too, and the one nearest the end wins over an earlier full name.
  for(var a in KP_PROV_ALIAS){
    var ia=t.lastIndexOf(a);
    if(ia>bestIdx){ bestIdx=ia; best=KP_PROV_ALIAS[a]; }
  }
  if(best) return best;
  // Fallback: explicit marker with a spelling not in the list.
  var m=t.match(/จังหวัด\s*([^\s,\d]+)/)||t.match(/จ[.\s]\s*([^\s,\d]+)/);
  if(m) return m[1].trim();
  return '';
}

function kpProvinceZone(prov){
  var t=String(prov||'').trim(); if(!t) return '';
  if(/กรุงเทพ|กทม|bangkok/i.test(t)) return 'Bangkok';
  var canon=kpCanonProvince(t);                               // อยุธยา → พระนครศรีอยุธยา
  if(KP_PROV_ZONE[canon]) return KP_PROV_ZONE[canon];
  if(KP_PROV_ZONE[t]) return KP_PROV_ZONE[t];                 // Thai exact
  var n=t.toLowerCase().replace(/[\s\-\.]/g,'');
  if(KP_PROV_ZONE[n]) return KP_PROV_ZONE[n];                 // English normalized
  for(var k in KP_PROV_ZONE){ if(/[ก-๙]/.test(k) && t.indexOf(k)>=0) return KP_PROV_ZONE[k]; } // Thai embedded
  return '';
}

function loadLeaflet(cb, onFail){
  if(window.L){ cb(); return; }
  if(!document.getElementById('leaflet-css')){ var css=document.createElement('link'); css.id='leaflet-css'; css.rel='stylesheet'; css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css); }
  var s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload=function(){cb();};
  s.onerror=function(){
    // A failed <script> stays in the DOM and would never be retried; drop it so a
    // later attempt actually re-fetches.
    try{ s.remove(); }catch(e){}
    if(typeof onFail==='function'){ try{ onFail(); }catch(e){} return; }
    alert('Could not load map (check internet) / โหลดแผนที่ไม่ได้');
  };
  document.head.appendChild(s);
}

function geoPosSrc(o){
  var g=custGeoGet(o&&o.phone);
  if(g && geoSane(g.lat,g.lng)){
    return g.src==='exif'   ? {k:'exif',   th:'GPS จากรูปถ่าย',   en:'photo GPS'}
         : g.src==='driver' ? {k:'driver', th:'คนขับบันทึกไว้',    en:'saved by the driver'}
         : g.src==='maplink'? {k:'link',   th:'ลิงก์แผนที่',       en:'the pasted Maps link'}
         :                    {k:'pin',    th:'หมุดที่บันทึกไว้',   en:'a saved pin'};
  }
  if(orderLinkLatLng(o)) return {k:'link', th:'ลิงก์แผนที่ที่แปะไว้ในออเดอร์', en:'the Maps link pasted on the order'};
  return null;
}

