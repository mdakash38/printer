const $ = id => document.getElementById(id);
const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '৳ ' + Number(n||0).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});
let db, auth, authSdk, firestoreSdk, firebaseConfig, records = [], editingId = null, firebaseInitialized = false;

function setStatus(message, ok=false){$('connectionStatus').textContent=message;$('connectionStatus').style.color=ok?'#a9e2c4':'#f0c5a8';}
function configIsReady(){
  return Boolean(firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith('PASTE_') &&
    firebaseConfig.projectId === 'printer-de188' && firebaseConfig.appId);
}
function setSerial(serial){$('serial').value=serial;$('serialBadge').textContent=serial;}
function showAuthState(user){
  const signedIn=Boolean(user);
  $('authEmail').disabled=signedIn;
  $('authPassword').disabled=signedIn;
  $('authBtn').hidden=signedIn;
  $('signOutBtn').hidden=!signedIn;
}
async function connectFirebase(){
  try{
    const configModule=await import("./firebase-config.js");
    firebaseConfig=configModule.firebaseConfig;
    if(!configIsReady()){
      setStatus('Setup needed');
      $('history').innerHTML='<div class="empty">Firebase configuration is missing or does not match project printer-de188. Check firebase-config.js.</div>';
      return;
    }
    const [appSdk,loadedAuthSdk,loadedFirestoreSdk]=await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
    ]);
    authSdk=loadedAuthSdk;firestoreSdk=loadedFirestoreSdk;
    const app=appSdk.initializeApp(firebaseConfig);auth=authSdk.getAuth(app);db=firestoreSdk.getFirestore(app);firebaseInitialized=true;
    authSdk.onAuthStateChanged(auth,async user=>{
      if(user?.isAnonymous){
        try{await authSdk.signOut(auth);}
        catch(err){
          console.error(err);showAuthState(null);setStatus('Sign-in issue');
          $('history').innerHTML='<div class="empty">A previous anonymous session could not be cleared. Sign in with the owner email; if that fails, reload the page and check connectivity.</div>';
        }
        return;
      }
      showAuthState(user);
      if(!user){
        records=[];renderHistory();setStatus('Sign in to load receipts');
        $('history').innerHTML='<div class="empty">Sign in with the configured owner account to load receipts.</div>';
        return;
      }
      setStatus('Loading…');
      await loadRecords();
      if(!editingId)setSerial(nextSerial());
    });
  }catch(err){
    console.error(err);setStatus('Connection failed');
    $('history').innerHTML='<div class="empty">Firebase could not initialize. Check the web app configuration and network connection.</div>';
  }
}
const receiptsRef=()=>firestoreSdk.collection(db,'receipts');
function serialNumber(serial){
  const match=String(serial||'').match(/(\d+)$/);
  return match?Number(match[1]):0;
}
async function loadRecords(){
  if(!auth?.currentUser)return;
  try{
    const snap=await firestoreSdk.getDocs(firestoreSdk.query(receiptsRef(),firestoreSdk.orderBy('createdAt','desc')));
    records=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderHistory();
    setStatus('Connected',true);
  }catch(err){
    console.error(err);setStatus('Could not load receipts');
    $('history').innerHTML='<div class="empty">Could not load receipts. Verify that the signed-in UID matches the owner UID in Firestore rules.</div>';
  }
}
function nextSerial(){
  const max=records.reduce((m,r)=>Math.max(m,serialNumber(r.serial)),0);
  return 'PR-'+String(max+1).padStart(4,'0');
}
function addRow(item={date:$('receiptDate').value||today(),type:'print',description:'',pages:'',amount:'',manual:false}){
  const tr=document.createElement('tr');tr.className='item-row';const type=item.type||'print';
  tr.innerHTML=`<td><input type="date" class="item-date" value="${esc(item.date)}"></td>
  <td><select class="work-type"><option value="print" ${type==='print'?'selected':''}>Printing</option><option value="spiral" ${type==='spiral'?'selected':''}>Spiral Binding</option><option value="manual" ${type==='manual'?'selected':''}>Other Work</option></select></td>
  <td><input class="description" placeholder="Work details" value="${esc(item.description)}"></td>
  <td><input class="pages" type="number" min="1" step="1" placeholder="${type==='spiral'?'Qty':'Pages'}" value="${esc(item.pages)}"></td>
  <td><input class="amount" type="number" min="0" step="0.01" placeholder="0.00" value="${esc(item.amount)}"></td>
  <td><button class="remove" type="button" title="Remove work item" aria-label="Remove work item">×</button></td>`;
  const typeEl=tr.querySelector('.work-type'),pagesEl=tr.querySelector('.pages'),amountEl=tr.querySelector('.amount');
  function recalc(){
    const t=typeEl.value,q=Number(pagesEl.value)||0;
    pagesEl.placeholder=t==='spiral'?'Qty':'Pages';
    if(amountEl.dataset.manual==='1'){updateTotal();return;}
    if(t==='print')amountEl.value=q?(q*(q>50?2.8:3)).toFixed(2).replace(/\.00$/,''):'';
    else if(t==='spiral')amountEl.value=q?(q*35).toFixed(2).replace(/\.00$/,''):'';
    else amountEl.value='';
    updateTotal();
  }
  amountEl.addEventListener('input',()=>{amountEl.dataset.manual='1';updateTotal()});
  pagesEl.addEventListener('input',recalc);
  typeEl.addEventListener('change',recalc);
  tr.querySelectorAll('.item-date,.description').forEach(el=>el.addEventListener('input',updateTotal));
  tr.querySelector('.remove').onclick=()=>{tr.remove();if(!$('itemsBody').children.length)addRow();updateTotal()};
  if(item.manual)amountEl.dataset.manual='1';
  $('itemsBody').appendChild(tr);
  if(!item.amount&&type!=='manual')recalc();
  updateTotal();
}
function getData(){
  const items=[...document.querySelectorAll('.item-row')].map(tr=>({
    date:tr.querySelector('.item-date').value,
    type:tr.querySelector('.work-type').value,
    description:tr.querySelector('.description').value.trim(),
    pages:tr.querySelector('.pages').value,
    amount:Number(tr.querySelector('.amount').value)||0,
    manual:tr.querySelector('.amount').dataset.manual==='1'
  })).filter(x=>x.description||x.pages||x.amount);
  return {serial:$('serial').value,printer:$('printer').value.trim()||'Printer',customer:$('customer').value.trim(),date:$('receiptDate').value,items,total:items.reduce((s,x)=>s+x.amount,0),notes:$('notes').value.trim()};
}
function validateWorkItems(){
  const rows=[...document.querySelectorAll('.item-row')];
  for(const [index,row] of rows.entries()){
    const type=row.querySelector('.work-type').value;
    const pages=row.querySelector('.pages').value;
    const amount=row.querySelector('.amount').value;
    const description=row.querySelector('.description').value.trim();
    if(!pages&&!amount&&!description)continue;
    const quantity=Number(pages);
    if((type==='print'||type==='spiral')&&(!Number.isInteger(quantity)||quantity<=0)){
      alert(`Enter a whole number greater than zero for pages / quantity in work item ${index+1}.`);
      row.querySelector('.pages').focus();return false;
    }
    if(type==='manual'&&amount===''){
      alert(`Enter an amount for Other Work in work item ${index+1}.`);
      row.querySelector('.amount').focus();return false;
    }
    if(amount===''||!Number.isFinite(Number(amount))||Number(amount)<0){
      alert(`Enter a valid non-negative amount in work item ${index+1}.`);
      row.querySelector('.amount').focus();return false;
    }
  }
  return true;
}
function updateTotal(){$('total').textContent=money(getData().total)}
async function saveReceipt(){
  if(!auth?.currentUser){alert('Sign in with the owner account before saving receipts.');return;}
  if(!validateWorkItems())return;
  const data=getData();
  if(!data.customer){alert('Please enter customer name.');$('customer').focus();return;}
  if(!data.items.length){alert('Please add at least one work item.');return;}
  try{
    if(editingId){
      await firestoreSdk.updateDoc(firestoreSdk.doc(db,'receipts',editingId),{...data,updatedAt:new Date().toISOString()});
    }else{
      const receiptRef=firestoreSdk.doc(receiptsRef());
      const counterRef=firestoreSdk.doc(db,'receiptCounters','serial');
      const now=new Date().toISOString();
      await firestoreSdk.runTransaction(db,async transaction=>{
        const counter=await transaction.get(counterRef);
        const previous=Number(counter.data()?.lastSerial)||0;
        const next=Math.max(previous,records.reduce((m,r)=>Math.max(m,serialNumber(r.serial)),0))+1;
        const serial='PR-'+String(next).padStart(4,'0');
        transaction.set(counterRef,{lastSerial:next,updatedAt:now});
        transaction.set(receiptRef,{...data,serial,createdAt:now,updatedAt:now});
      });
    }
    await loadRecords();alert('Receipt saved to Firebase successfully.');newReceipt();
  }catch(err){
    console.error(err);alert('Could not save the receipt. Verify your owner sign-in and Firestore rules, then try again.');
  }
}
function newReceipt(){
  editingId=null;$('formTitle').textContent='Create New Receipt';$('saveBtn').textContent='Save Receipt';
  $('printer').value='Md. Akash Mia';$('customer').value='';$('receiptDate').value=today();
  setSerial(nextSerial());$('notes').value='';$('itemsBody').innerHTML='';addRow();
}
function editReceipt(id){
  const r=records.find(x=>x.id===id);if(!r)return;
  editingId=id;$('formTitle').textContent='Edit Receipt '+r.serial;$('saveBtn').textContent='Update Receipt';
  $('printer').value=r.printer||'';$('customer').value=r.customer||'';$('receiptDate').value=r.date||today();
  setSerial(r.serial||nextSerial());$('notes').value=r.notes||'';$('itemsBody').innerHTML='';
  (Array.isArray(r.items)?r.items:[]).forEach(addRow);if(!r.items?.length)addRow();updateTotal();
  window.scrollTo({top:0,behavior:'smooth'});
}
async function deleteReceipt(id){
  if(!auth?.currentUser){alert('Sign in with the owner account before deleting receipts.');return;}
  if(!confirm('Delete this receipt permanently from Firebase?'))return;
  try{await firestoreSdk.deleteDoc(firestoreSdk.doc(db,'receipts',id));await loadRecords();if(editingId===id)newReceipt();}
  catch(err){console.error(err);alert('Could not delete this receipt. Verify your owner sign-in and Firestore rules.');}
}
function renderHistory(){
  const q=$('search').value.toLowerCase();
  const list=records.filter(r=>(String(r.customer||'')+' '+String(r.serial||'')).toLowerCase().includes(q));
  $('history').innerHTML=list.length?list.map(r=>`<div class="history-item"><div><strong>${esc(r.customer)}</strong><small>${esc(r.serial)} · ${esc(r.date)}<br>${money(r.total)}</small></div><div class="history-actions"><button class="btn btn-muted edit" data-id="${esc(r.id)}">Edit</button><button class="btn btn-muted del" data-id="${esc(r.id)}">Delete</button><button class="btn btn-gold print" data-id="${esc(r.id)}">PDF</button></div></div>`).join(''):'<div class="empty">No receipts found.</div>';
  $('count').textContent=records.length;
  $('history').querySelectorAll('.edit').forEach(b=>b.onclick=()=>editReceipt(b.dataset.id));
  $('history').querySelectorAll('.del').forEach(b=>b.onclick=()=>deleteReceipt(b.dataset.id));
  $('history').querySelectorAll('.print').forEach(b=>b.onclick=()=>{
    const record=records.find(r=>r.id===b.dataset.id);if(!record)return;
    preparePrint(record);window.print();
  });
}
function preparePrint(data=getData()){
  $('pPrinter').textContent=data.printer||'';$('pCustomer').textContent=data.customer||'';
  $('pSerial').textContent=data.serial||'';$('pDate').textContent=data.date||'';
  $('pTotal').textContent=money(data.total);$('pNotes').textContent=data.notes?'Note: '+data.notes:'';
  $('pRows').innerHTML=(data.items||[]).map(x=>{
    const unit=x.type==='spiral'?' pcs':x.type==='print'?' pages':'';
    return `<div class="print-row"><span>${esc(x.date||'')}</span><span class="dots"></span><span>${esc(x.description||x.type)}${x.pages?' · '+esc(x.pages)+unit:''} — ${money(x.amount)}</span></div>`;
  }).join('');
}
function backup(){
  const blob=new Blob([JSON.stringify(records,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='print-record-backup-'+today()+'.json';a.click();URL.revokeObjectURL(a.href);
}
async function restoreBackup(file){
  if(!auth?.currentUser){alert('Sign in with the owner account before restoring.');return;}
  try{
    const incoming=JSON.parse(await file.text());if(!Array.isArray(incoming))throw Error('Invalid file');
    for(const r of incoming){
      const {id,...data}=r;
      if(id)await firestoreSdk.updateDoc(firestoreSdk.doc(db,'receipts',id),data);
      else throw Error('This backup contains a receipt without a Firestore document ID. Restore from a backup exported by this app.');
    }
    await loadRecords();alert('Backup restored to Firebase.');
  }catch(err){console.error(err);alert('Backup restore failed. Check that the file came from this app and that the owner account has access.');}
}
async function signIn(){
  if(!firebaseInitialized){alert('Firebase is not ready. Check firebase-config.js and your connection to the Firebase SDK.');return;}
  const email=$('authEmail').value.trim(),password=$('authPassword').value;
  if(!email||!password){alert('Enter the owner email and password.');return;}
  try{await authSdk.signInWithEmailAndPassword(auth,email,password);$('authPassword').value='';}
  catch(err){
    console.error(err);
    alert(err.code==='auth/invalid-credential'||err.code==='auth/user-not-found'
      ?'Sign-in failed. Check the email and password, and confirm the owner account exists in Firebase Authentication.'
      :'Could not sign in. Confirm Email/Password is enabled in Firebase Authentication and try again.');
  }
}
async function signOutOwner(){
  try{await authSdk.signOut(auth);}
  catch(err){console.error(err);alert('Could not sign out. Please try again.');}
}

$('addItem').onclick=()=>addRow();
$('saveBtn').onclick=saveReceipt;
$('resetBtn').onclick=newReceipt;
$('pdfBtn').onclick=()=>{preparePrint();window.print();};
$('search').oninput=renderHistory;
$('exportBtn').onclick=backup;
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=e=>{const f=e.target.files[0];if(f)restoreBackup(f);e.target.value='';};
$('authBtn').onclick=signIn;
$('signOutBtn').onclick=signOutOwner;
$('receiptDate').value=today();setSerial('PR-0001');addRow();connectFirebase();
