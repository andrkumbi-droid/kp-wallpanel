/* ═══ KP Gerätezugang (SECURITY.md Stufe 3a) ═════════════════════════════════
   Problem: every KP page signed in anonymously and the rules gave every anonymous
   user the whole database. The API key is public, so anyone — a sales partner, a
   curious customer — could do the same.

   Fix: one shared KP device account (e-mail/password). Its password is a short
   device code (XXXX-XXXX-XXXX) that every KP device enters ONCE — in the yellow
   bar this file shows, or via an activation link …#kpdev=CODE. The code lives at
   kpAuth/secret, which the rules let ONLY the device account read — it is never
   visible to anonymous users, not even during the changeover.
   Phase A  rules: anonymous OR device. Devices get activated one by one;
            kpAuth/seen/<device> shows which ones are still anonymous.
   Phase B  rules: device only. Anything still anonymous is locked out and sees a
            red bar with the code field.
   The staff PIN login is untouched — this only replaces the Firebase sign-in.
   Plain ES5 (the warehouse TV runs an old browser); only firebase.auth() and
   firebase.database(), so it works with the v8 SDK and the v10 compat SDK. */
(function(){
  var EMAIL = 'kp-device@kp-wallpanel.firebaseapp.com';
  // invest.html only (Alex, external investor): the rules give this account v2/invest and
  // nothing else. He opens his personal link …invest.html#kpinv=CODE once — no typing.
  var INV_EMAIL = 'kp-invest@kp-wallpanel.firebaseapp.com';
  var ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';           // no 0/O/1/I/L — easy to type
  function A(){ return firebase.auth(); }
  function D(p){ return firebase.database().ref(p); }
  function isDev(u){ return !!(u && !u.isAnonymous && String(u.email||'').toLowerCase()===EMAIL); }
  function isInv(u){ return !!(u && !u.isAnonymous && String(u.email||'').toLowerCase()===INV_EMAIL); }
  function norm(c){ return String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function fmtCode(c){ return norm(c).replace(/(.{4})(?=.)/g,'$1-'); }
  function newCode(){
    var b=new Uint8Array(12), c=window.crypto||window.msCrypto, s=''; c.getRandomValues(b);
    for(var i=0;i<b.length;i++) s+=ABC.charAt(b[i]%ABC.length);
    return s;
  }
  function errCode(e){ return String((e && (e.code||e.message)) || e || ''); }

  function firstUser(){
    return new Promise(function(res){
      var done=false, off=function(){};
      var fin=function(u){ if(done) return; done=true; try{ off(); }catch(e){} res(u||null); };
      try{ off=A().onAuthStateChanged(fin); }catch(e){ fin(null); }
      // Safety net only: the SDK always reports once it has read its local storage.
      // Giving up early would sign a slow device in anonymously and drop its device session.
      setTimeout(function(){ fin(A().currentUser); }, 30000);
    });
  }
  function timeout(p, ms){
    return new Promise(function(res, rej){
      var t=setTimeout(function(){ rej({code:'kp/timeout'}); }, ms);
      p.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
    });
  }
  function hashKey(name){ var m=String(location.hash||'').match(new RegExp('[#&]'+(name||'kpdev')+'=([^&]+)')); if(!m) return ''; try{ return decodeURIComponent(m[1]); }catch(e){ return m[1]; } }
  function dropHash(){
    try{ var h=String(location.hash||'').replace(/^#/,'').split('&').filter(function(p){ return p && !/^kp(dev|inv)=/.test(p); }).join('&');
      history.replaceState(null, '', location.pathname+location.search+(h ? '#'+h : '')); }catch(e){}
  }
  function devId(){
    try{ var k=localStorage.getItem('kpDevId');
      if(!k){ k=Date.now().toString(36)+Math.random().toString(36).slice(2,8); localStorage.setItem('kpDevId', k); }
      return k; }catch(e){ return 'nostorage'; }
  }
  function signDev(code){ return A().signInWithEmailAndPassword(EMAIL, norm(code)).then(function(c){ return c.user; }); }
  function anon(u){
    var cur=A().currentUser;
    if(isDev(cur)) return Promise.resolve(cur);        // a late device sign-in must never be overwritten
    if(u && u.isAnonymous) return Promise.resolve(u);
    return A().signInAnonymously().then(function(c){ return c.user; });
  }
  // S2: the device session can end later (new code from Management → other devices are
  // signed out within the hour). Reload once so the page signs in again and shows the bar
  // instead of going dark without a word.
  function watch(){
    try{ A().onAuthStateChanged(function(u){
      if(isDev(u)) return;
      var k='kpAuthLost'; try{ if(sessionStorage.getItem(k)) return; sessionStorage.setItem(k,'1'); }catch(e){}
      setTimeout(function(){ location.reload(); }, 800);
    }); }catch(e){}
  }
  function seen(page, u, err){
    try{ D('kpAuth/seen/'+devId()).update({t:Date.now(), m:isDev(u)?'device':(u?'anon':'none'), pg:String(page||'').slice(0,30),
      ua:String(navigator.userAgent||'').slice(0,140), e:err?String(err).slice(0,60):null}).then(null,function(){}); }catch(e){}
  }
  // false = this sign-in is refused by the rules (Phase B and not a device)
  function probe(){ return D('kpPing').once('value').then(function(){ return true; }, function(e){ return !/permission/i.test(errCode(e)); }); }

  // ── the code bar: yellow (Phase A, can be hidden for a day) or red (locked) ──
  function bar(locked){
    try{
      if(document.getElementById('kp-auth-bar')) return;
      if(!locked){ var until=0; try{ until=+localStorage.getItem('kpAuthBarOff')||0; }catch(e){} if(Date.now()<until) return; }
      var d=document.createElement('div'); d.id='kp-auth-bar';
      d.style.cssText='position:fixed;left:0;right:0;'+(locked?'top:0':'bottom:0')+';z-index:2147483647;background:'+(locked?'#7f1d1d':'#fef3c7')
        +';color:'+(locked?'#fff':'#78350f')+';font:600 14px/1.45 system-ui,sans-serif;padding:10px 12px;box-shadow:0 0 16px rgba(0,0,0,.25);text-align:center';
      d.innerHTML='<div>🔒 '+(locked?'อุปกรณ์นี้ยังไม่ได้เปิดใช้งาน':'กรุณาเปิดใช้งานอุปกรณ์นี้')+' — ใส่รหัสอุปกรณ์จากออฟฟิศ'
        +'<br><span style="font-weight:500;opacity:.8">'+(locked?'This device is not activated':'Please activate this device')+' — enter the device code from the office</span></div>'
        +'<div style="display:flex;gap:6px;justify-content:center;margin-top:8px;flex-wrap:wrap">'
        +'<input id="kp-auth-code" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" style="font:700 16px monospace;padding:8px 10px;border-radius:8px;border:1px solid #d6a756;width:190px;text-transform:uppercase">'
        +'<button id="kp-auth-go" style="font:700 14px system-ui;padding:8px 14px;border-radius:8px;border:0;background:'+(locked?'#fff':'#92400e')+';color:'+(locked?'#7f1d1d':'#fff')+'">เปิดใช้งาน / Activate</button>'
        +(locked?'':'<button id="kp-auth-later" style="font:600 13px system-ui;padding:8px 10px;border-radius:8px;border:0;background:transparent;color:inherit;text-decoration:underline">ภายหลัง / later</button>')
        +'</div><div id="kp-auth-msg" style="font-size:12.5px;margin-top:4px"></div>';
      (document.body||document.documentElement).appendChild(d);
      var go=function(){
        var c=document.getElementById('kp-auth-code').value, m=document.getElementById('kp-auth-msg');
        if(norm(c).length<8){ m.textContent='รหัสไม่ครบ / code incomplete'; return; }
        m.textContent='⏳';
        signDev(c).then(function(u){ seen('activate', u); m.textContent='✓'; setTimeout(function(){ location.reload(); }, 400); },
          function(e){ m.textContent=/too-many/i.test(errCode(e)) ? 'ลองใหม่ภายหลัง / too many tries — wait a few minutes' : 'รหัสไม่ถูกต้อง / wrong code'; });
      };
      document.getElementById('kp-auth-go').onclick=go;
      document.getElementById('kp-auth-code').onkeydown=function(ev){ if(ev.key==='Enter') go(); };
      var later=document.getElementById('kp-auth-later');
      if(later) later.onclick=function(){ try{ localStorage.setItem('kpAuthBarOff', String(Date.now()+12*3600e3)); }catch(e){} d.parentNode.removeChild(d); };
    }catch(e){}
  }

  var _p=null;
  // opt.prompt: 'always' (default — yellow bar once the device account exists, red when
  // locked) · 'locked' (only the red bar) · 'never' (no bar, e.g. invest.html).
  window.kpAuthEnsure=function(page, opt){
    if(_p) return _p;
    opt=opt||{};
    var err=null, prompt=opt.prompt||'always';
    _p=firstUser().then(function(u){
      var key=hashKey(), ikey=opt.invest ? hashKey('kpinv') : '';
      if(key || hashKey('kpinv')) dropHash();          // never leave a code in the address bar
      if(isDev(u)) return u;
      if(opt.invest && ikey) return timeout(A().signInWithEmailAndPassword(INV_EMAIL, norm(ikey)).then(function(c){ return c.user; }), 15000)
        .then(null, function(e){ err='inv:'+errCode(e); return isInv(u) ? u : anon(u); });
      if(opt.invest && isInv(u)) return u;
      if(key) return timeout(signDev(key), 15000).then(null, function(e){ err='link:'+errCode(e); console.warn('[KP auth] activation link failed:', err); return anon(u); });
      return anon(u);
    }).then(function(u){
      window._kpAuthMode=isDev(u)?'device':(isInv(u)?'invest':(u?'anon':'none'));
      if(isInv(u)) return u;                            // Alex: no telemetry, no bar
      if(isDev(u)){ try{ sessionStorage.removeItem('kpAuthLost'); }catch(e){} watch(); }
      seen(page, u, err);
      if(!isDev(u) && prompt!=='never'){
        probe().then(function(open){
          if(!open){ bar(true); return; }
          if(prompt==='always') D('pub/kpDev/on').once('value').then(function(s){ if(s.val()) bar(false); }, function(){});
        });
      }
      return u;
    });
    _p.then(null, function(){ _p=null; });   // a failed sign-in may be retried by the page
    return _p;
  };

  // ── Management helpers (index.html → 🔐 Device access) ──
  window.kpAuthIsDevice=function(u){ return isDev(arguments.length ? u : A().currentUser); };
  window.kpAuthNote=function(name){ try{ D('kpAuth/seen/'+devId()).update({n:String(name||'').slice(0,40)}).then(null,function(){}); }catch(e){} };
  window.kpAuthActivate=function(code){ return signDev(code).then(function(u){ seen('activate', u); return u; }); };
  // Creates the device account (first time only) — this device becomes a KP device.
  // On any error after the account exists, the rejection carries deviceCode — the caller
  // must show it, otherwise the only copy of the password is gone.
  window.kpAuthCreate=function(){
    var code=newCode();
    return A().createUserWithEmailAndPassword(EMAIL, code).then(function(c){
      return D('kpAuth/secret').set({code:code, ts:Date.now()})
        .then(function(){ return D('kpAuth/uid').set(c.user.uid); })
        .then(function(){ return D('pub/kpDev').set({on:true, ts:Date.now()}); })
        .then(function(){ seen('create', c.user); return fmtCode(code); },
          function(e){ throw {code:(e&&e.code)||'kp/save-failed', deviceCode:fmtCode(code)}; });
    });
  };
  window.kpAuthCode=function(){ return D('kpAuth/secret/code').once('value').then(function(s){ return s.val() ? fmtCode(s.val()) : ''; }); };
  window.kpAuthSetupLink=function(base){ return D('kpAuth/secret/code').once('value').then(function(s){ return s.val() ? (base||'')+'#kpdev='+fmtCode(s.val()) : ''; }); };
  // New code: every OTHER device is signed out within the hour and needs the new code.
  window.kpAuthRotate=function(){
    var u=A().currentUser; if(!isDev(u)) return Promise.reject({code:'kp/not-device'});
    var code=newCode();
    return D('kpAuth/secret/code').once('value').then(function(s){
      var old=s.val(), cred=firebase.auth.EmailAuthProvider.credential(EMAIL, old);
      return u.reauthenticateWithCredential(cred);
    }).then(function(){ return D('kpAuth/next').set({code:code, ts:Date.now()}); })   // written first: never lost
      .then(function(){ return u.updatePassword(code); })
      .then(function(){ return D('kpAuth/secret').set({code:code, ts:Date.now()}); })
      .then(function(){ D('kpAuth/next').remove(); return fmtCode(code); },
        function(e){ throw {code:(e&&e.code)||'kp/rotate-failed', deviceCode:fmtCode(code)}; });
  };
  // Alex's personal link. First call creates his account in a separate app instance, so this
  // device's own session is untouched. Only a KP device can read or store the code.
  window.kpAuthInvestLink=function(){
    var base='https://andrkumbi-droid.github.io/kp-wallpanel/invest.html?openExternalBrowser=1#kpinv=';
    return D('kpAuth/invest/code').once('value').then(function(s){
      if(s.val()) return base+fmtCode(s.val());
      var code=newCode(), app2=firebase.initializeApp(firebase.app().options, 'kpInvMaker'+Date.now());
      return app2.auth().createUserWithEmailAndPassword(INV_EMAIL, code).then(function(c){
        var uid=c.user.uid;
        return D('kpAuth/invest').set({code:code, uid:uid, ts:Date.now()}).then(function(){
          try{ app2.auth().signOut(); app2.delete(); }catch(e){}
          return base+fmtCode(code);
        }, function(e){ throw {code:(e&&e.code)||'kp/save-failed', deviceCode:fmtCode(code)}; });
      });
    });
  };
  window.KP_DEVICE_EMAIL=EMAIL;
})();
