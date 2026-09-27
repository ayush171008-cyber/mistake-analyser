
const DB_NAME = 'mistake-notebook-db';
const DB_VERSION = 1;
const SETTINGS_KEY = 'mistake-notebook-settings';
const state = {
  view: 'dashboard',
  subject: null,
  chapter: null,
  category: 'wrong',
  selectedMistake: null,
  selectedImage: 0,
  search: '',
  filters: {subject:'',chapter:'',category:'',mistakeType:'',tag:'',status:'',archived:'no',difficulty:''},
  selection: new Set(),
  selectionMode: false,
  syllabus: null,
  mistakes: [],
  imageCache: new Map(),
  settings: {imageQuality:'balanced', apiBase:''},
  cloud: {available:false,status:'offline',serverUpdatedAt:0}
};

const navItems = [
  ['dashboard','⌂','Dashboard'],
  ['subject','◈','Physics','Physics'],
  ['subject','◇','Chemistry','Chemistry'],
  ['subject','△','Mathematics','Mathematics'],
  ['revision','↻','Revision'],
  ['search','⌕','Search'],
  ['statistics','▥','Statistics'],
  ['archive','▱','Archive'],
  ['settings','⚙','Settings']
];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);
const now = () => Date.now();
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtDate = t => t ? new Date(t).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtDT = t => t ? new Date(t).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const deep = x => JSON.parse(JSON.stringify(x));

function toast(msg){
  const el=document.createElement('div'); el.className='toast'; el.textContent=msg; $('#toastRoot').appendChild(el);
  setTimeout(()=>el.remove(),2400);
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('mistakes')) db.createObjectStore('mistakes',{keyPath:'id'});
      if(!db.objectStoreNames.contains('images')) db.createObjectStore('images',{keyPath:'id'});
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function tx(store,mode='readonly'){
  const db=await openDB(); return db.transaction(store,mode).objectStore(store);
}
async function dbPut(store,value){return new Promise(async (res,rej)=>{const s=await tx(store,'readwrite');const r=s.put(value);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function dbGetAll(store){return new Promise(async(res,rej)=>{const s=await tx(store);const r=s.getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function dbGet(store,id){return new Promise(async(res,rej)=>{const s=await tx(store);const r=s.get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbDelete(store,id){return new Promise(async(res,rej)=>{const s=await tx(store,'readwrite');const r=s.delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

function saveSettings(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(state.settings))}
function loadSettings(){try{Object.assign(state.settings,JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'))}catch{}}

async function init(){
  loadSettings();
  const syllabusRes = await fetch('./data/allen-jee-syllabus.json');
  state.syllabus = await syllabusRes.json();
  state.mistakes = await dbGetAll('mistakes');
  renderNav();
  bindGlobal();
  await checkCloud();
  render();
  registerSW();
}

function registerSW(){ if('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(()=>{}); }

function renderNav(){
  $('#nav').innerHTML = navItems.map(([id,icon,label,sub])=>{
    const active = state.view===id && (!sub || state.subject===sub);
    const count = sub ? state.mistakes.filter(m=>m.subject===sub && !m.isArchived).length : '';
    return `<button class="nav-item ${active?'active':''}" data-view="${id}" data-subject="${sub||''}">
      <span class="nav-icon">${icon}</span><span class="nav-label">${label}</span>${count!==''?`<span class="nav-count">${count}</span>`:''}</button>`;
  }).join('');
  $$('#nav .nav-item').forEach(b=>b.onclick=()=>{
    state.view=b.dataset.view; state.subject=b.dataset.subject||null; state.chapter=null; state.selectedMistake=null; state.selection.clear(); $('#sidebar').classList.remove('open'); render();
  });
}

function setCrumb(s){$('#breadcrumbs').textContent=s}

function render(){
  renderNav();
  if(state.view==='dashboard') return renderDashboard();
  if(state.view==='subject') return renderSubject();
  if(state.view==='revision') return renderRevision();
  if(state.view==='search') return renderSearch();
  if(state.view==='statistics') return renderStatistics();
  if(state.view==='archive') return renderArchive();
  if(state.view==='settings') return renderSettings();
}

function subjectCount(sub){return state.mistakes.filter(m=>m.subject===sub&&!m.isArchived).length}
function categoryCount(sub,cat){return state.mistakes.filter(m=>m.subject===sub&&!m.isArchived&&m.category===cat).length}
function dueCount(){const t=Date.now(); return state.mistakes.filter(m=>!m.isArchived && m.nextRevisionDate && m.nextRevisionDate<=t).length}

function renderDashboard(){
  setCrumb('Dashboard');
  const total=state.mistakes.filter(m=>!m.isArchived).length, wrong=state.mistakes.filter(m=>!m.isArchived&&m.category==='wrong').length, un=state.mistakes.filter(m=>!m.isArchived&&m.category==='unattempted').length;
  const recent=state.mistakes.filter(m=>!m.isArchived).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,8);
  const pinned=state.mistakes.filter(m=>!m.isArchived&&m.isPinned).slice(0,6);
  $('#content').innerHTML = `
    <div class="page-head"><div><h1 class="page-title">Mistake Notebook</h1><div class="page-sub">Offline-first notebook • tablet optimized • black-only interface</div></div>
    <div class="toolbar"><button class="primary-btn" id="dashboardAdd">＋ Add Mistake</button></div></div>
    <div class="cards">
      ${stat('Total mistakes',total,'Active entries')}
      ${stat('Wrong questions',wrong,'Attempted but incorrect')}
      ${stat('Unattempted',un,'Could not attempt')}
      ${stat('Revision due',dueCount(),'Review queue')}
    </div>
    <div class="section"><div class="section-title">Subjects</div>
      <div class="subject-grid">${['Physics','Chemistry','Mathematics'].map((s,i)=>`
        <div class="subject-card" data-sub="${s}">
          <h3>${s}</h3><p>${subjectCount(s)} active entries</p>
          <div class="subject-meta"><span class="pill">Wrong ${categoryCount(s,'wrong')}</span><span class="pill">Unattempted ${categoryCount(s,'unattempted')}</span></div>
        </div>`).join('')}</div>
    </div>
    <div class="section grid-2">
      <div class="panel"><div class="section-title">Pinned mistakes</div>${pinned.length?`<div class="revision-stack">${pinned.map(miniMistake).join('')}</div>`:`<div class="empty">No pinned mistakes yet.</div>`}</div>
      <div class="panel"><div class="section-title">Recently updated</div>${recent.length?`<div class="revision-stack">${recent.map(miniMistake).join('')}</div>`:`<div class="empty">Your notebook is empty. Add your first mistake.</div>`}</div>
    </div>`;
  $('#dashboardAdd').onclick=()=>openEditor();
  $$('.subject-card').forEach(c=>c.onclick=()=>{state.view='subject';state.subject=c.dataset.sub;state.chapter=null;render()});
  bindMiniMistakes();
}

function stat(label,num,extra){return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-num">${num}</div><div class="stat-extra">${extra}</div></div>`}
function miniMistake(m){return `<div class="revision-item" data-id="${m.id}"><div class="grow"><b>${esc(m.title||'Untitled')}</b><div><small>${esc(m.subject)} • ${esc(m.chapter)}</small></div></div><span class="tag">${m.category==='wrong'?'Wrong':'Unattempted'}</span></div>`}
function bindMiniMistakes(){$$('.revision-item[data-id]').forEach(x=>x.onclick=()=>openDetails(x.dataset.id))}

function renderSubject(){
  const sub=state.subject||'Physics'; state.subject=sub; setCrumb(sub);
  const chapters=state.syllabus.subjects[sub];
  if(!state.chapter) state.chapter=chapters[0];
  const chapStats = c => {
    const arr=state.mistakes.filter(m=>m.subject===sub&&m.chapter===c&&!m.isArchived);
    return [arr.filter(m=>m.category==='wrong').length,arr.filter(m=>m.category==='unattempted').length]
  };
  const arr=state.mistakes.filter(m=>m.subject===sub&&m.chapter===state.chapter&&!m.isArchived&&m.category===state.category);
  $('#content').innerHTML=`
    <div class="page-head"><div><h1 class="page-title">${esc(sub)}</h1><div class="page-sub">ALLEN-derived JEE Main + Advanced chapter structure</div></div><div class="toolbar">
      <button class="soft-btn" id="selectModeBtn">${state.selectionMode?'Done selecting':'Select'}</button>
      ${state.selectionMode?`<button class="soft-btn" id="selectAllBtn">Select all</button><button class="soft-btn" id="bulkArchiveBtn">Archive</button><button class="soft-btn" id="bulkTagBtn">Tag</button><button class="danger-btn" id="bulkDeleteBtn">Delete</button>`:''}
      <button class="primary-btn" id="subAdd">＋ Add Mistake</button></div></div>
    <div class="chapter-layout">
      <div class="panel chapter-list"><div class="section-title">Chapters</div>${chapters.map((c,i)=>{const [w,u]=chapStats(c);return `<div class="chapter-item ${c===state.chapter?'active':''}" data-chapter="${esc(c)}"><div>${esc(c)}</div><div class="mini"><b>W ${w}</b><b>U ${u}</b></div></div>`}).join('')}</div>
      <div class="panel">
        <div class="split-head"><div><div class="section-title" style="margin:0">${esc(state.chapter)}</div><div class="page-sub">Choose a section</div></div>
        <div class="tabs"><button class="tab ${state.category==='wrong'?'active':''}" data-cat="wrong">Wrong (${categoryInChapter(sub,state.chapter,'wrong')})</button><button class="tab ${state.category==='unattempted'?'active':''}" data-cat="unattempted">Unattempted (${categoryInChapter(sub,state.chapter,'unattempted')})</button></div></div>
        ${arr.length?`<div class="mistake-list">${arr.sort((a,b)=>b.updatedAt-a.updatedAt).map(card).join('')}</div>`:`<div class="empty" style="margin-top:12px">No ${state.category==='wrong'?'wrong':'unattempted'} questions in this chapter.</div>`}
      </div>
    </div>`;
  $('#subAdd').onclick=()=>openEditor(null,{subject:sub,chapter:state.chapter,category:state.category});
  $('#selectModeBtn').onclick=()=>{state.selectionMode=!state.selectionMode;if(!state.selectionMode)state.selection.clear();render()};
  if($('#selectAllBtn'))$('#selectAllBtn').onclick=()=>{arr.forEach(m=>state.selection.add(m.id));render()};
  if($('#bulkArchiveBtn'))$('#bulkArchiveBtn').onclick=()=>bulkAction('archive');
  if($('#bulkDeleteBtn'))$('#bulkDeleteBtn').onclick=()=>bulkAction('delete');
  if($('#bulkTagBtn'))$('#bulkTagBtn').onclick=()=>bulkTag();
  $$('.chapter-item').forEach(x=>x.onclick=()=>{state.chapter=x.dataset.chapter;state.selection.clear();render()});
  $$('.tab').forEach(x=>x.onclick=()=>{state.category=x.dataset.cat;render()});
  bindCards();
}
function categoryInChapter(s,c,cat){return state.mistakes.filter(m=>m.subject===s&&m.chapter===c&&!m.isArchived&&m.category===cat).length}
function card(m){
  const img=m.imageIds?.[0];
  const checked=state.selection.has(m.id);
  return `<div class="mistake-card" data-id="${m.id}">
    <div class="mistake-top">${state.selectionMode?`<input class="checkbox select-box" type="checkbox" ${checked?'checked':''} data-select="${m.id}" title="Select">`:''}
      ${img?`<img class="thumb" src="${state.imageCache.get(img)||''}" data-image="${img}">`:`<div class="thumb"></div>`}
      <div class="mistake-body"><div class="mistake-title">${esc(m.title||'Untitled')}</div><div class="mistake-desc">${stripHTML(m.description||'No description')}</div></div>
      <div class="pin">${m.isPinned?'★':'☆'}</div>
    </div>
    <div class="mistake-foot"><span class="tag">${esc(m.category==='wrong'?'Wrong':'Unattempted')}</span>${(m.mistakeTypes||[]).slice(0,2).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}<span class="status">${m.revisionStatus||'New'}</span></div>
  </div>`;
}
function stripHTML(s){const d=document.createElement('div');d.innerHTML=s;return d.textContent||d.innerText||''}
function bindCards(){
  $$('.mistake-card[data-id]').forEach(x=>x.onclick=e=>{
    if(e.target.closest('.select-box'))return;
    if(e.target.closest('img'))return;
    if(state.selectionMode){toggleSelection(x.dataset.id)}else openDetails(x.dataset.id);
  });
  $$('[data-select]').forEach(b=>b.onchange=()=>toggleSelection(b.dataset.select));
  $$('img[data-image]').forEach(img=>{const id=img.dataset.image;if(!state.imageCache.get(id))loadImageUrl(id,img)})
}
async function loadImageUrl(id,imgEl){const rec=await dbGet('images',id);if(!rec)return;const url=URL.createObjectURL(rec.blob);state.imageCache.set(id,url);if(imgEl)imgEl.src=url}

async function renderDetails(id){
  const m=state.mistakes.find(x=>x.id===id); if(!m)return;
  if(m.imageIds?.length){for(const iid of m.imageIds) if(!state.imageCache.has(iid)) await loadImageUrl(iid)}
}
async function openDetails(id){
  state.selectedMistake=id; state.selectedImage=0;
  await renderDetails(id);
  const m=state.mistakes.find(x=>x.id===id); if(!m)return;
  const imgIds=m.imageIds||[];
  showModal(`
    <div class="modal-head"><div class="modal-title">${esc(m.title||'Untitled')}</div><button class="icon-btn" id="closeModal">×</button></div>
    <div class="modal-body">
      <div class="detail-layout">
        <div>
          <div class="viewer">
            <div class="viewer-main">${imgIds.length?`<img id="detailImage" src="${state.imageCache.get(imgIds[0])||''}">`:`<div class="empty" style="width:100%">No image attached</div>`}</div>
            ${imgIds.length?`<div class="thumb-row">${imgIds.map((iid,i)=>`<img class="thumb-small ${i===0?'active':''}" src="${state.imageCache.get(iid)||''}" data-i="${i}">`).join('')}</div>`:''}
          </div>
          <div class="panel" style="margin-top:10px"><div class="section-title">Description</div><div>${m.description||'<span style="color:#666">No description</span>'}</div></div>
          ${fieldRead('Why this mistake happened',reasonText(m))}
          ${fieldRead('What should I have thought?',m.whatShouldIHaveThought)}
          ${fieldRead('Correct approach / lesson learned',m.correctApproach)}
          ${fieldRead('My attempt',m.myAttempt)}
        </div>
        <div class="panel">
          <div class="mini-grid">
            <div class="mini-card"><small>Subject</small><b>${esc(m.subject)}</b></div>
            <div class="mini-card"><small>Chapter</small><b>${esc(m.chapter)}</b></div>
            <div class="mini-card"><small>Category</small><b>${m.category==='wrong'?'Wrong Question':'Unattempted'}</b></div>
            <div class="mini-card"><small>Status</small><b>${esc(m.revisionStatus||'New')}</b></div>
          </div>
          <div class="section">${m.mistakeTypes?.length?`<div class="section-title">Mistake types</div><div class="choice-row">${m.mistakeTypes.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}</div>
          <div class="section">${m.tags?.length?`<div class="section-title">Tags</div><div class="choice-row">${m.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}</div>
          <div class="section"><div class="section-title">Difficulty</div><div class="page-sub">${esc(m.difficulty||'—')} • my difficulty: ${esc(m.perceivedDifficulty||'—')}</div></div>
          <div class="section"><div class="section-title">Source</div><div class="page-sub">${esc(m.source||'—')}${m.examYear?` • ${esc(m.examYear)}`:''}${m.paper?` • ${esc(m.paper)}`:''}${m.questionNumber?` • Q${esc(m.questionNumber)}`:''}</div></div>
          <div class="section"><div class="section-title">Time</div><div class="page-sub">${m.timeSpent?m.timeSpent+' min':'—'}${m.expectedTime?` / expected ${m.expectedTime} min`:''}${m.timePressure?' • time pressure noted':''}</div></div>
          <div class="section"><div class="section-title">Revision</div><div class="page-sub">Next: ${fmtDate(m.nextRevisionDate)}</div><div class="toolbar" style="margin-top:8px"><button class="soft-btn" id="reviewBtn">Mark Reviewed</button><button class="soft-btn" id="reattemptBtn">Re-attempt</button></div></div>
          <div class="section"><div class="section-title">Timeline</div>${timeline(m)}</div>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="soft-btn" id="pinBtn">${m.isPinned?'Unpin':'Pin'}</button>
      <button class="soft-btn" id="editBtn">Edit</button>
      <button class="danger-btn" id="deleteBtn">Delete</button>
    </div>
  `);
  $('#closeModal').onclick=closeModal;
  $('#editBtn').onclick=()=>{closeModal();openEditor(m.id)};
  $('#deleteBtn').onclick=()=>deleteMistake(m.id);
  $('#pinBtn').onclick=()=>togglePin(m.id);
  $('#reviewBtn').onclick=()=>markReviewed(m.id);
  $('#reattemptBtn').onclick=()=>openReattempt(m.id);
  $$('.thumb-small').forEach(t=>t.onclick=()=>{state.selectedImage=+t.dataset.i;$('#detailImage').src=state.imageCache.get(imgIds[state.selectedImage]);$$('.thumb-small').forEach(x=>x.classList.remove('active'));t.classList.add('active')});
}
function fieldRead(title,val){return `<div class="panel" style="margin-top:10px"><div class="section-title">${title}</div><div>${val?val:'<span style="color:#666">Not recorded</span>'}</div></div>`}
function reasonText(m){const a=m.mistakeReasons||[];return (a.length?`<div class="choice-row">${a.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`:'')+(m.reasonDetails?`<div style="margin-top:8px">${m.reasonDetails}</div>`:'')}

function timeline(m){
  const arr=m.timeline||[];
  return `<div class="timeline">${arr.slice().reverse().slice(0,12).map(x=>`<div class="timeline-item"><b>${esc(x.action)}</b><div>${fmtDT(x.at)}${x.note?` • ${esc(x.note)}`:''}</div></div>`).join('')||'<div style="color:#666">No history</div>'}</div>`;
}

function openEditor(id=null,preset={}){
  const existing=id?deep(state.mistakes.find(m=>m.id===id)):null;
  const m=existing||{
    id:uid(),subject:preset.subject||'Physics',chapter:preset.chapter||state.syllabus.subjects[preset.subject||'Physics'][0],
    category:preset.category||'wrong',title:'',description:'',reasonDetails:'',mistakeReasons:[],mistakeTypes:[],
    tags:[],imageIds:[],myAttempt:'',correctApproach:'',whatShouldIHaveThought:'',lessonLearned:'',
    difficulty:'Medium',perceivedDifficulty:'Medium',source:'',examYear:'',paper:'',questionNumber:'',
    timeSpent:'',expectedTime:'',timePressure:false,revisionStatus:'New',nextRevisionDate:Date.now(),
    revisionHistory:[],reattemptHistory:[],relatedMistakeIds:[],isPinned:false,isArchived:false,
    createdAt:now(),updatedAt:now(),timeline:[{action:'Created',at:now()}]
  };
  const reasons=["Conceptual mistake","Formula forgotten","Calculation error","Misread question","Wrong approach","Couldn't identify the concept","Didn't know how to start","Careless mistake","Time pressure","Overthinking","Guessing","Incomplete understanding","Other"];
  const types=["Conceptual","Calculation","Silly","Formula","Misread","Approach","Time","Guess","Graph","Units","Sign Error"];
  let currentImages = m.imageIds.slice();
  let currentTags = m.tags.slice();
  let currentRelated = m.relatedMistakeIds.slice();
  showModal(`
    <div class="modal-head"><div class="modal-title">${existing?'Edit mistake':'Add mistake'}</div><button class="icon-btn" id="closeModal">×</button></div>
    <div class="modal-body">
      <div class="grid-3">
        ${selectField('Subject','editorSubject',['Physics','Chemistry','Mathematics'],m.subject)}
        <div class="field-group"><span class="field-label">Chapter</span><select id="editorChapter"></select></div>
        ${selectField('Category','editorCategory',[['wrong','Wrong Question'],['unattempted','Unattempted Question']],m.category)}
      </div>
      <div class="field-group" style="margin-top:12px"><span class="field-label">Question name / title</span><input id="editorTitle" type="text" value="${esc(m.title)}" placeholder="e.g. Block on rough inclined plane"></div>
      <div class="field-group" style="margin-top:12px"><span class="field-label">Description</span><div class="rich-toolbar"><button data-cmd="bold">Bold</button><button data-cmd="italic">Italic</button><button data-cmd="insertUnorderedList">Bullets</button><button data-cmd="insertOrderedList">Numbered</button></div><div id="editorDescription" class="rich-editor" contenteditable="true">${m.description||''}</div></div>
      <div class="section panel" style="margin-top:12px"><div class="section-title">Why did this mistake happen?</div><div class="choice-row" id="reasonChoices">${reasons.map(r=>`<button class="choice ${m.mistakeReasons.includes(r)?'selected':''}" data-value="${esc(r)}">${esc(r)}</button>`).join('')}</div><textarea id="reasonDetails" style="margin-top:9px" placeholder="Add your own explanation...">${esc(m.reasonDetails)}</textarea></div>
      <div class="section panel"><div class="section-title">Mistake type</div><div class="choice-row" id="typeChoices">${types.map(r=>`<button class="choice ${m.mistakeTypes.includes(r)?'selected':''}" data-value="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>
      <div class="grid-2">
        ${richField('What should I have thought?','whatShouldIHaveThought',m.whatShouldIHaveThought,'The correct thought/process that should have triggered...')}
        ${richField('Correct approach / lesson learned','correctApproach',m.correctApproach,'Write the corrected method and takeaway...')}
      </div>
      <div class="section panel"><div class="section-title">Images</div><div class="dropzone" id="dropzone">Tap to add images or drag/drop them here. Multiple images supported.</div><div id="imageEditorGrid" class="image-grid"></div></div>
      <div class="grid-4">
        ${selectField('Difficulty','editorDifficulty',['Easy','Medium','Hard','Very Hard'],m.difficulty)}
        ${selectField('My difficulty','editorPerceived',['Easy','Medium','Hard','Brutal'],m.perceivedDifficulty)}
        <div class="field-group"><span class="field-label">Time spent (min)</span><input id="timeSpent" type="number" min="0" value="${esc(m.timeSpent)}"></div>
        <div class="field-group"><span class="field-label">Expected time (min)</span><input id="expectedTime" type="number" min="0" value="${esc(m.expectedTime)}"></div>
      </div>
      <div class="section panel"><div class="section-title">Source information</div><div class="grid-4">
        <div class="field-group"><span class="field-label">Source</span><input id="source" type="text" value="${esc(m.source)}" placeholder="Book / Test / PYQ"></div>
        <div class="field-group"><span class="field-label">Exam year</span><input id="examYear" type="text" value="${esc(m.examYear)}" placeholder="2026"></div>
        <div class="field-group"><span class="field-label">Paper</span><input id="paper" type="text" value="${esc(m.paper)}" placeholder="Paper 1"></div>
        <div class="field-group"><span class="field-label">Question number</span><input id="questionNumber" type="text" value="${esc(m.questionNumber)}" placeholder="Q17"></div>
      </div></div>
      <div class="section panel"><div class="section-title">Options</div><div class="check-list">
        <label><input class="checkbox" id="timePressure" type="checkbox" ${m.timePressure?'checked':''}> Time pressure contributed</label>
        <label><input class="checkbox" id="pinned" type="checkbox" ${m.isPinned?'checked':''}> Pin this mistake</label>
      </div></div>
      <div class="section panel"><div class="section-title">Revision schedule</div><div class="grid-2">
        ${selectField('Revision status','editorRevisionStatus',['New','Reviewed','Understood','Mastered'],m.revisionStatus||'New')}
        <div class="field-group"><span class="field-label">Next revision date</span><input id="nextRevisionDate" type="date" value="${m.nextRevisionDate?new Date(m.nextRevisionDate).toISOString().slice(0,10):''}"></div>
      </div></div>
      <div class="section panel"><div class="section-title">Tags</div><div class="toolbar"><input class="field" id="tagInput" type="text" placeholder="Type tag and press Enter"><button class="soft-btn" id="addTag">Add tag</button></div><div class="choice-row" id="tagList" style="margin-top:8px">${currentTags.map(tagChip).join('')}</div></div>
      <div class="section panel"><div class="section-title">Related mistakes</div><div class="toolbar"><select id="relatedSelect" class="field" style="flex:1"><option value="">Select a related mistake...</option>${state.mistakes.filter(x=>x.id!==m.id&&!x.isArchived).map(x=>`<option value="${x.id}">${esc(x.subject)} • ${esc(x.chapter)} • ${esc(x.title||'Untitled')}</option>`).join('')}</select><button class="soft-btn" id="addRelated">Link</button></div><div class="choice-row" id="relatedList" style="margin-top:8px">${currentRelated.map(id=>{const x=state.mistakes.find(z=>z.id===id);return x?`<button class="choice selected" data-rel="${id}">${esc(x.title||'Untitled')} ×</button>`:''}).join('')}</div></div>
      <div class="notice" style="margin-top:12px">Keyboard: Ctrl+S saves this entry. Ctrl+N creates a new entry from the main screen.</div>
    </div>
    <div class="modal-foot"><button class="ghost-btn" id="cancelEdit">Cancel</button><button class="primary-btn" id="saveEdit">Save mistake</button></div>
  `);
  const updateChapters=()=>{$('#editorChapter').innerHTML=state.syllabus.subjects[$('#editorSubject').value].map(c=>`<option ${c===m.chapter?'selected':''}>${esc(c)}</option>`).join('')};
  updateChapters(); $('#editorSubject').onchange=updateChapters;
  $('#closeModal').onclick=closeModal; $('#cancelEdit').onclick=closeModal;
  $$('.rich-toolbar button').forEach(b=>b.onclick=()=>{document.execCommand(b.dataset.cmd,false,null);$('#editorDescription').focus()});
  bindChoiceGroup('reasonChoices',v=>{const i=m.mistakeReasons.indexOf(v);i>=0?m.mistakeReasons.splice(i,1):m.mistakeReasons.push(v)});
  bindChoiceGroup('typeChoices',v=>{const i=m.mistakeTypes.indexOf(v);i>=0?m.mistakeTypes.splice(i,1):m.mistakeTypes.push(v)});
  $('#addTag').onclick=()=>addTag(); $('#tagInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addTag()}};
  function addTag(){let v=$('#tagInput').value.trim().replace(/^#/,'');if(v&&!currentTags.includes(v)){currentTags.push(v);renderTags();$('#tagInput').value=''}}
  function renderTags(){$('#tagList').innerHTML=currentTags.map((x,i)=>`<button class="choice selected" data-tag="${i}">#${esc(x)} ×</button>`).join('');$$('[data-tag]').forEach(b=>b.onclick=()=>{currentTags.splice(+b.dataset.tag,1);renderTags()})}
  function renderImages(){$('#imageEditorGrid').innerHTML=currentImages.map((iid,i)=>`<div class="image-item"><img src="${state.imageCache.get(iid)||''}"><div class="image-controls"><button data-up="${i}">↑</button><button data-down="${i}">↓</button><button data-cover="${i}">${i===0?'Cover':'Set cover'}</button><button data-del="${i}">Delete</button></div></div>`).join('')||''; $$('#imageEditorGrid button').forEach(b=>{if(b.dataset.del) b.onclick=async()=>{const iid=currentImages.splice(+b.dataset.del,1)[0]; await dbDelete('images',iid); if(state.imageCache.has(iid)){URL.revokeObjectURL(state.imageCache.get(iid));state.imageCache.delete(iid)} renderImages();}; if(b.dataset.up) b.onclick=()=>{const i=+b.dataset.up;if(i){[currentImages[i-1],currentImages[i]]=[currentImages[i],currentImages[i-1]];renderImages()}}; if(b.dataset.down) b.onclick=()=>{const i=+b.dataset.down;if(i<currentImages.length-1){[currentImages[i+1],currentImages[i]]=[currentImages[i],currentImages[i+1]];renderImages()}}; if(b.dataset.cover) b.onclick=()=>{const i=+b.dataset.cover;if(i){const x=currentImages.splice(i,1)[0];currentImages.unshift(x);renderImages()}}})}
  renderImages();
  $('#dropzone').onclick=()=>$('#imageInput').click();
  $('#dropzone').ondragover=e=>e.preventDefault();
  $('#dropzone').ondrop=e=>{e.preventDefault();handleImageFiles([...e.dataTransfer.files])};
  $('#imageInput').onchange=e=>{handleImageFiles([...e.target.files]);e.target.value=''};
  async function handleImageFiles(files){for(const file of files.filter(f=>f.type.startsWith('image/'))){const q=await compressImage(file,state.settings.imageQuality);const iid=uid();await dbPut('images',{id:iid,mistakeId:m.id,blob:q,type:q.type,name:file.name,updatedAt:now()});currentImages.push(iid);state.imageCache.set(iid,URL.createObjectURL(q));}renderImages()}
  $('#relatedSelect').onchange=e=>{}; $('#addRelated').onclick=()=>{const rid=$('#relatedSelect').value;if(rid&&!currentRelated.includes(rid)){currentRelated.push(rid);renderRelated()}}; renderRelated();
  function renderRelated(){$('#relatedList').innerHTML=currentRelated.map(id=>{const x=state.mistakes.find(z=>z.id===id);return x?`<button class="choice selected" data-rel="${id}">${esc(x.title||'Untitled')} ×</button>`:''}).join('');$$('[data-rel]').forEach(b=>b.onclick=()=>{currentRelated=currentRelated.filter(id=>id!==b.dataset.rel);renderRelated()})}
  $('#saveEdit').onclick=async()=>{
    const reasons=m.mistakeReasons.slice();
    const newM={...m,subject:$('#editorSubject').value,chapter:$('#editorChapter').value,category:$('#editorCategory').value,title:$('#editorTitle').value.trim(),
      description:$('#editorDescription').innerHTML,reasonDetails:$('#reasonDetails').value.trim(),mistakeReasons:reasons,mistakeTypes:m.mistakeTypes.slice(),
      tags:currentTags.slice(),imageIds:currentImages.slice(),whatShouldIHaveThought:$('#whatShouldIHaveThought').value,correctApproach:$('#correctApproach').value,
      difficulty:$('#editorDifficulty').value,perceivedDifficulty:$('#editorPerceived').value,timeSpent:$('#timeSpent').value,expectedTime:$('#expectedTime').value,
      source:$('#source').value.trim(),examYear:$('#examYear').value.trim(),paper:$('#paper').value.trim(),questionNumber:$('#questionNumber').value.trim(),
      timePressure:$('#timePressure').checked,isPinned:$('#pinned').checked,relatedMistakeIds:currentRelated.slice(),
      revisionStatus:$('#editorRevisionStatus').value,nextRevisionDate:$('#nextRevisionDate').value?new Date($('#nextRevisionDate').value+'T12:00:00').getTime():m.nextRevisionDate,
      updatedAt:now()};
    if(!existing)newM.timeline=[{action:'Created',at:now()}];
    else newM.timeline=[...(existing.timeline||[]),{action:'Edited',at:now()}];
    await dbPut('mistakes',newM);
    state.mistakes=await dbGetAll('mistakes');
    closeModal(); render(); toast(existing?'Mistake updated':'Mistake saved');
    refreshCloudDot();
  };
}

function richField(title,id,val,placeholder){return `<div class="field-group"><span class="field-label">${title}</span><textarea id="${id}" placeholder="${placeholder}">${esc(val)}</textarea></div>`}
function selectField(label,id,opts,val){const normalized=opts.map(x=>Array.isArray(x)?x:[x,x]);return `<div class="field-group"><span class="field-label">${label}</span><select id="${id}">${normalized.map(([v,l])=>`<option value="${esc(v)}" ${v===val?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`}
function tagChip(t,i){return `<button class="choice selected" data-tag="${i}">#${esc(t)} ×</button>`}
function bindChoiceGroup(id,fn){$$(`#${id} .choice`).forEach(b=>b.onclick=()=>{fn(b.dataset.value);b.classList.toggle('selected')})}

function showModal(inner){$('#modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${inner}</div></div>`}
function closeModal(){const b=$('#modalBackdrop');if(b)b.remove()}
function togglePin(id){const m=state.mistakes.find(x=>x.id===id);if(!m)return;m.isPinned=!m.isPinned;dbPut('mistakes',m).then(async()=>{state.mistakes=await dbGetAll('mistakes');closeModal();openDetails(id);renderNav();})}
async function deleteMistake(id){const m=state.mistakes.find(x=>x.id===id);if(!m)return;const ok=confirm('Move this mistake to Trash?');if(!ok)return;m.isArchived=true;m.updatedAt=now();m.timeline=[...(m.timeline||[]),{action:'Archived',at:now()}];await dbPut('mistakes',m);state.mistakes=await dbGetAll('mistakes');closeModal();render();toast('Moved to Archive')}
async function permanentlyDelete(id){const m=state.mistakes.find(x=>x.id===id);if(!m)return;if(!confirm('Permanently delete this mistake and its local images?'))return;for(const iid of (m.imageIds||[]))await dbDelete('images',iid);await dbDelete('mistakes',id);state.mistakes=await dbGetAll('mistakes');render();toast('Permanently deleted')}

async function markReviewed(id){
  const m=state.mistakes.find(x=>x.id===id);if(!m)return;
  const next=[1,3,7,15,30].map(d=>Date.now()+d*864e5).find(t=>!m.revisionHistory?.some(x=>sameDay(x.at,t)));
  m.revisionStatus='Reviewed';m.nextRevisionDate=next||Date.now()+30*864e5;m.revisionHistory=[...(m.revisionHistory||[]),{at:Date.now(),status:'Reviewed'}];m.timeline=[...(m.timeline||[]),{action:'Reviewed',at:Date.now()}];m.updatedAt=Date.now();
  await dbPut('mistakes',m);state.mistakes=await dbGetAll('mistakes');closeModal();render();toast('Marked reviewed')
}
function sameDay(a,b){const x=new Date(a),y=new Date(b);return x.toDateString()===y.toDateString()}
function scheduleAfter(m,days,status){m.revisionStatus=status;m.nextRevisionDate=Date.now()+days*864e5}

function openReattempt(id){
  const m=state.mistakes.find(x=>x.id===id);if(!m)return;
  showModal(`<div class="modal-head"><div class="modal-title">Re-attempt: ${esc(m.title||'Untitled')}</div><button class="icon-btn" id="closeModal">×</button></div>
    <div class="modal-body"><div class="notice">Solution and lesson fields stay hidden. Look only at the question image(s), then solve it yourself.</div>
    <div class="section">${m.imageIds?.length?`<div class="image-grid">${m.imageIds.map(iid=>`<img class="thumb" style="width:100%;height:180px;object-fit:contain;background:#000" src="${state.imageCache.get(iid)||''}">`).join('')}</div>`:`<div class="empty">No question image attached.</div>`}</div>
    <div class="section"><div class="field-group"><span class="field-label">Optional attempt note</span><textarea id="attemptNote" placeholder="Record what you tried..."></textarea></div></div>
    </div>
    <div class="modal-foot"><button class="ghost-btn" id="close2">Cancel</button><button class="soft-btn" data-result="correct">I solved it</button><button class="danger-btn" data-result="wrong">I got it wrong again</button><button class="soft-btn" data-result="couldnt">I couldn't solve it</button></div>`);
  $('#closeModal').onclick=closeModal;$('#close2').onclick=closeModal;
  $$('.modal-foot [data-result]').forEach(b=>b.onclick=()=>finishReattempt(id,b.dataset.result,$('#attemptNote').value));
}
async function finishReattempt(id,result,note){
  const m=state.mistakes.find(x=>x.id===id);if(!m)return;
  m.reattemptHistory=[...(m.reattemptHistory||[]),{at:Date.now(),result,note}];
  m.timeline=[...(m.timeline||[]),{action:'Re-attempted',at:Date.now(),note:result}];
  if(result==='correct') scheduleAfter(m,30,'Mastered'); else if(result==='wrong') scheduleAfter(m,3,'Reviewed'); else scheduleAfter(m,1,'New');
  if(result==='correct')m.revisionHistory=[...(m.revisionHistory||[]),{at:Date.now(),status:'Mastered'}];
  m.updatedAt=Date.now();await dbPut('mistakes',m);state.mistakes=await dbGetAll('mistakes');closeModal();render();toast(result==='correct'?'Re-attempt recorded as correct':'Re-attempt recorded')}
function renderRevision(){
  setCrumb('Revision');
  const due=state.mistakes.filter(m=>!m.isArchived&&m.nextRevisionDate&&m.nextRevisionDate<=Date.now()).sort((a,b)=>a.nextRevisionDate-b.nextRevisionDate);
  $('#content').innerHTML=`<div class="page-head"><div><h1 class="page-title">Revision</h1><div class="page-sub">Mistakes scheduled for review</div></div><div class="toolbar"><button class="soft-btn" id="revAll">Review visible</button></div></div>
  <div class="panel">${due.length?`<div class="revision-stack">${due.map(m=>`<div class="due-card"><div class="grow"><b>${esc(m.title||'Untitled')}</b><div><small>${esc(m.subject)} • ${esc(m.chapter)} • ${m.category==='wrong'?'Wrong':'Unattempted'}</small></div></div><span class="tag">${m.revisionStatus||'New'}</span><button class="soft-btn" data-open="${m.id}">Open</button><button class="primary-btn" data-rev="${m.id}">Review</button></div>`).join('')}</div>`:`<div class="empty">Nothing is due right now.</div>`}</div>`;
  $$('[data-open]').forEach(b=>b.onclick=()=>openDetails(b.dataset.open));$$('[data-rev]').forEach(b=>b.onclick=()=>openReattempt(b.dataset.rev));
}
function renderSearch(){
  setCrumb('Search');
  $('#content').innerHTML=`<div class="page-head"><div><h1 class="page-title">Search</h1><div class="page-sub">Search titles, notes, tags, chapters and sources</div></div>
      <div class="toolbar"><button class="soft-btn" id="searchSelectMode">${state.selectionMode?'Done selecting':'Select'}</button>
      ${state.selectionMode?`<button class="soft-btn" id="searchSelectAll">Select all results</button><button class="soft-btn" id="searchArchive">Archive</button><button class="soft-btn" id="searchTag">Tag</button><button class="danger-btn" id="searchDelete">Delete</button>`:''}</div></div>
    <div class="panel">
      <div class="toolbar"><input class="search-input" id="searchBox" placeholder="Search..." value="${esc(state.search)}"><select id="fSubject" class="field"><option value="">All subjects</option>${['Physics','Chemistry','Mathematics'].map(s=>`<option ${state.filters.subject===s?'selected':''}>${s}</option>`).join('')}</select>
      <select id="fCat" class="field"><option value="">Both sections</option><option value="wrong" ${state.filters.category==='wrong'?'selected':''}>Wrong</option><option value="unattempted" ${state.filters.category==='unattempted'?'selected':''}>Unattempted</option></select>
      <select id="fStatus" class="field"><option value="">All revision statuses</option>${['New','Reviewed','Understood','Mastered'].map(x=>`<option ${state.filters.status===x?'selected':''}>${x}</option>`).join('')}</select>
      <input id="fTag" class="field" placeholder="Tag" value="${esc(state.filters.tag||'')}"><button class="soft-btn" id="clearFilters">Clear</button></div>
      <div style="margin-top:12px" id="searchResults"></div>
    </div>`;
  const run=()=>{state.search=$('#searchBox').value.trim();state.filters.subject=$('#fSubject').value;state.filters.category=$('#fCat').value;state.filters.status=$('#fStatus').value;state.filters.tag=$('#fTag').value.trim().replace(/^#/,'');drawSearchResults()};
  ['searchBox','fSubject','fCat','fStatus','fTag'].forEach(id=>$('#'+id).addEventListener('input',run));$('#clearFilters').onclick=()=>{state.search='';state.filters={subject:'',chapter:'',category:'',mistakeType:'',tag:'',status:'',archived:'no',difficulty:''};render()};
  $('#searchSelectMode').onclick=()=>{state.selectionMode=!state.selectionMode;if(!state.selectionMode)state.selection.clear();render()};
  if($('#searchSelectAll'))$('#searchSelectAll').onclick=()=>{filteredSearchResults().forEach(m=>state.selection.add(m.id));drawSearchResults()};
  if($('#searchArchive'))$('#searchArchive').onclick=()=>bulkAction('archive');
  if($('#searchDelete'))$('#searchDelete').onclick=()=>bulkAction('delete');
  if($('#searchTag'))$('#searchTag').onclick=()=>bulkTag();
  drawSearchResults();
}
function filteredSearchResults(){
  const q=state.search.toLowerCase();
  return state.mistakes.filter(m=>!m.isArchived && (!state.filters.subject||m.subject===state.filters.subject)&&(!state.filters.category||m.category===state.filters.category)&&(!state.filters.status||m.revisionStatus===state.filters.status)&&(!state.filters.tag||m.tags?.some(t=>t.toLowerCase()===state.filters.tag.toLowerCase())) &&
    (!q || [m.title,m.description,m.reasonDetails,m.whatShouldIHaveThought,m.correctApproach,m.lessonLearned,m.chapter,m.source,(m.tags||[]).join(' '),(m.mistakeTypes||[]).join(' ')].join(' ').toLowerCase().includes(q)));
}
async function bulkAction(action){
  const ids=[...state.selection]; if(!ids.length){toast('Nothing selected');return}
  if(action==='delete' && !confirm(`Permanently delete ${ids.length} selected item(s)?`))return;
  for(const id of ids){
    const m=state.mistakes.find(x=>x.id===id); if(!m)continue;
    if(action==='archive'){m.isArchived=true;m.updatedAt=now();m.timeline=[...(m.timeline||[]),{action:'Archived',at:now()}];await dbPut('mistakes',m)}
    else {for(const iid of m.imageIds||[])await dbDelete('images',iid);await dbDelete('mistakes',id)}
  }
  state.selection.clear();state.mistakes=await dbGetAll('mistakes');render();toast(action==='archive'?`Archived ${ids.length} item(s)`:`Deleted ${ids.length} item(s)`);
}
async function bulkTag(){
  const ids=[...state.selection];if(!ids.length){toast('Nothing selected');return}
  const tag=prompt('Tag to add to selected items (without #):');if(!tag)return;
  const clean=tag.trim().replace(/^#/,'');if(!clean)return;
  for(const id of ids){const m=state.mistakes.find(x=>x.id===id);if(m&&!m.tags.includes(clean)){m.tags.push(clean);m.updatedAt=now();m.timeline=[...(m.timeline||[]),{action:'Bulk tag',at:now(),note:`#${clean}`}];await dbPut('mistakes',m)}}
  state.mistakes=await dbGetAll('mistakes');state.selection.clear();render();toast(`Tagged ${ids.length} item(s)`);
}
function toggleSelection(id){state.selection.has(id)?state.selection.delete(id):state.selection.add(id);render()}
function drawSearchResults(){
  const arr=filteredSearchResults();
  $('#searchResults').innerHTML=arr.length?`<div class="mistake-list">${arr.sort((a,b)=>b.updatedAt-a.updatedAt).map(card).join('')}</div>`:`<div class="empty">No matching mistakes.</div>`;bindCards();
}
function renderArchive(){
  setCrumb('Archive');
  const arr=state.mistakes.filter(m=>m.isArchived).sort((a,b)=>b.updatedAt-a.updatedAt);
  $('#content').innerHTML=`<div class="page-head"><div><h1 class="page-title">Archive</h1><div class="page-sub">Archived entries stay recoverable until permanently deleted.</div></div><div class="toolbar"><button class="danger-btn" id="purgeBtn">Empty archive</button></div></div>
  <div class="panel">${arr.length?`<table class="table"><thead><tr><th>Title</th><th>Subject</th><th>Chapter</th><th>Updated</th><th></th></tr></thead><tbody>${arr.map(m=>`<tr><td>${esc(m.title||'Untitled')}</td><td>${esc(m.subject)}</td><td>${esc(m.chapter)}</td><td>${fmtDate(m.updatedAt)}</td><td><button class="soft-btn" data-restore="${m.id}">Restore</button> <button class="danger-btn" data-purge="${m.id}">Delete</button></td></tr>`).join('')}</tbody></table>`:`<div class="empty">Archive is empty.</div>`}</div>`;
  $$('[data-restore]').forEach(b=>b.onclick=async()=>{const m=state.mistakes.find(x=>x.id===b.dataset.restore);m.isArchived=false;m.updatedAt=now();m.timeline=[...(m.timeline||[]),{action:'Restored',at:now()}];await dbPut('mistakes',m);state.mistakes=await dbGetAll('mistakes');render()});
  $$('[data-purge]').forEach(b=>b.onclick=()=>permanentlyDelete(b.dataset.purge));
  $('#purgeBtn').onclick=async()=>{if(!arr.length)return;if(!confirm('Permanently delete everything in Archive?'))return;for(const m of arr){for(const iid of m.imageIds||[])await dbDelete('images',iid);await dbDelete('mistakes',m.id)}state.mistakes=await dbGetAll('mistakes');render();toast('Archive emptied')};
}
function renderStatistics(){
  setCrumb('Statistics');
  const active=state.mistakes.filter(m=>!m.isArchived);
  const counts=(key)=>Object.fromEntries([...new Set(active.map(m=>m[key]).filter(Boolean))].map(k=>[k,active.filter(m=>m[key]===k).length]));
  const cat=counts('category'), type={}; active.flatMap(m=>m.mistakeTypes||[]).forEach(x=>type[x]=(type[x]||0)+1);
  const tags={}; active.flatMap(m=>m.tags||[]).forEach(x=>tags[x]=(tags[x]||0)+1);
  const subjects=['Physics','Chemistry','Mathematics'].map(s=>[s,active.filter(m=>m.subject===s).length]);
  const max=Math.max(1,...subjects.map(x=>x[1]));
  $('#content').innerHTML=`<div class="page-head"><div><h1 class="page-title">Statistics</h1><div class="page-sub">Simple local diagnostics from your notebook data</div></div></div>
    <div class="cards">${stat('Active entries',active.length,'Not archived')}${stat('Wrong',cat.wrong||0,'')}${stat('Unattempted',cat.unattempted||0,'')}${stat('Pinned',active.filter(m=>m.isPinned).length,'')}</div>
    <div class="section grid-2">
      <div class="panel"><div class="section-title">By subject</div>${subjects.map(([s,n])=>bar(s,n,max)).join('')}</div>
      <div class="panel"><div class="section-title">By mistake type</div>${Object.entries(type).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([s,n])=>bar(s,n,Math.max(1,...Object.values(type)))).join('')||'<div class="empty">No types yet.</div>'}</div>
    </div>
    <div class="section grid-2">
      <div class="panel"><div class="section-title">Most-used tags</div>${Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([s,n])=>bar('#'+s,n,Math.max(1,...Object.values(tags)))).join('')||'<div class="empty">No tags yet.</div>'}</div>
      <div class="panel"><div class="section-title">Revision status</div>${['New','Reviewed','Understood','Mastered'].map(s=>bar(s,active.filter(m=>m.revisionStatus===s).length,Math.max(1,active.length))).join('')}</div>
    </div>`;
}
function bar(label,val,max){return `<div class="bar-row"><div class="bar-label">${esc(label)}</div><div class="bar"><div class="progress"><div style="width:${Math.round(val/max*100)}%"></div></div></div><div class="bar-val">${val}</div></div>`}

function renderSettings(){
  setCrumb('Settings');
  $('#content').innerHTML=`<div class="page-head"><div><h1 class="page-title">Settings</h1><div class="page-sub">Local app preferences and cloud configuration</div></div></div>
  <div class="grid-2">
    <div class="panel"><div class="section-title">Appearance</div><div class="notice">Dark mode only. The application intentionally has no light/system/alternate theme.</div></div>
    <div class="panel"><div class="section-title">Image quality</div><select id="quality" class="field" style="width:100%"><option value="original">Original</option><option value="high">High</option><option value="balanced">Balanced</option><option value="compressed">Compressed</option></select></div>
  </div>
  <div class="section panel"><div class="section-title">Keyboard shortcuts</div><table class="table"><tr><th>Shortcut</th><th>Action</th></tr>${[['Ctrl N','New mistake'],['Ctrl K','Global search'],['Ctrl F','Focus search/filter'],['Ctrl S','Save current editor'],['Ctrl Z','Undo (browser/editor)'],['Ctrl Shift Z','Redo (browser/editor)'],['Esc','Close modal'],['Delete','Delete selected item when applicable']].map(x=>`<tr><td><kbd>${x[0]}</kbd></td><td>${x[1]}</td></tr>`).join('')}</table></div>
  <div class="section panel"><div class="section-title">Google Cloud synchronization</div>
    <div class="notice">The local app is fully functional without cloud access. When run through the included Node server with a Google Cloud Storage bucket configured, images and notebook metadata can synchronize. Never put service-account credentials in frontend code.</div>
    <div class="grid-2" style="margin-top:10px"><div class="field-group"><span class="field-label">API base</span><input id="apiBase" type="text" value="${esc(state.settings.apiBase||location.origin)}" placeholder="Leave current origin for local server"></div>
    <div class="field-group" style="justify-content:flex-end"><span class="field-label">&nbsp;</span><div class="toolbar"><button class="soft-btn" id="cloudCheck">Check connection</button><button class="primary-btn" id="syncNow">Sync now</button><button class="soft-btn" id="restoreCloud">Restore cloud</button></div></div></div>
    <div id="cloudInfo" style="margin-top:10px;color:#777;font-size:12px"></div>
  </div>
  <div class="section panel"><div class="section-title">Backups</div><div class="toolbar"><button class="soft-btn" id="exportJson">Export JSON</button><button class="soft-btn" id="exportZip">Export ZIP</button><button class="soft-btn" id="exportPdf">Print / PDF</button><label class="soft-btn" style="display:inline-flex;align-items:center;cursor:pointer">Import JSON<input id="importJson" type="file" accept="application/json" hidden></label></div>
  <div class="notice" style="margin-top:10px">JSON includes images as base64 data. ZIP creates a portable backup containing notebook.json plus image files. Print/PDF opens a clean report and uses your browser's Save as PDF option.</div></div>
  <div class="section panel"><div class="section-title">Storage management</div>
    <div class="grid-3">
      <div class="mini-card"><small>Notebook entries</small><b id="storageEntries">${state.mistakes.length}</b></div>
      <div class="mini-card"><small>Local browser estimate</small><b id="storageEstimate">Calculating…</b></div>
      <div class="mini-card"><small>Cached images</small><b id="storageImages">${state.imageCache.size}</b></div>
    </div>
    <div class="toolbar" style="margin-top:10px"><button class="soft-btn" id="clearCacheBtn">Clear image URL cache</button></div>
  </div>
  <div class="section panel"><div class="section-title">Syllabus source</div><div class="notice">Chapter taxonomy is based on ALLEN's official JEE Main + Advanced syllabus/material pages. The current ALLEN DLP site lists the 2026–27 session; the detailed syllabus documents surfaced from that page provide the topic structure. You can update <code>data/allen-jee-syllabus.json</code> later without changing the UI.</div></div>`;
  $('#quality').value=state.settings.imageQuality;
  $('#quality').onchange=()=>{state.settings.imageQuality=$('#quality').value;saveSettings();toast('Image quality saved')};
  $('#apiBase').onchange=()=>{state.settings.apiBase=$('#apiBase').value.trim().replace(/\/$/,'');saveSettings();checkCloud();};
  $('#cloudCheck').onclick=checkCloud;$('#syncNow').onclick=syncNow;$('#restoreCloud').onclick=restoreCloud;
  $('#exportJson').onclick=exportJSON;$('#exportZip').onclick=exportZIP;$('#exportPdf').onclick=exportPDF;$('#importJson').onchange=e=>importJSON(e.target.files[0]);
  refreshCloudDot();
  if($('#clearCacheBtn'))$('#clearCacheBtn').onclick=()=>{for(const u of state.imageCache.values())URL.revokeObjectURL(u);state.imageCache.clear();toast('Image URL cache cleared');renderSettings()};
  navigator.storage?.estimate?.().then(x=>{if($('#storageEstimate'))$('#storageEstimate').textContent=((x.usage||0)/1048576).toFixed(1)+' MB / '+((x.quota||0)/1048576).toFixed(0)+' MB'});
}

function bindGlobal(){
  $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
  $('#addTopBtn').onclick=()=>openEditor();
  $('#globalSearchBtn').onclick=()=>{state.view='search';render();setTimeout(()=>$('#searchBox')?.focus(),50)};
  document.addEventListener('keydown',async e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();openEditor()}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();state.view='search';render();setTimeout(()=>$('#searchBox')?.focus(),50)}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('#searchBox')?.focus();state.view='search';render();setTimeout(()=>$('#searchBox')?.focus(),50)}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){if($('#saveEdit')){e.preventDefault();$('#saveEdit').click()}}
    else if(e.key==='Escape' && $('#modalBackdrop')) closeModal();
  });
}

async function compressImage(file,quality){
  if(quality==='original')return file;
  try{
    const img=await createImageBitmap(file);
    let maxW=quality==='high'?2200:quality==='balanced'?1600:1100;
    const scale=Math.min(1,maxW/img.width); const w=Math.round(img.width*scale),h=Math.round(img.height*scale);
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
    const q=quality==='high'?.88:quality==='balanced'?.78:.62;
    return await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('image compression failed')),'image/jpeg',q));
  }catch{return file}
}

function getApi(path){return (state.settings.apiBase||location.origin)+path}
async function checkCloud(){
  try{
    const r=await fetch(getApi('/api/health'),{cache:'no-store'});
    state.cloud.available=r.ok;
    state.cloud.status=r.ok?'ok':'offline';
  }catch{state.cloud.available=false;state.cloud.status='offline'}
  refreshCloudDot();
  if($('#cloudInfo')) $('#cloudInfo').textContent=state.cloud.available?'Local sync server is reachable. Cloud bucket status is handled by the server.':'No local sync server detected. Notebook remains fully usable offline.';
}
function refreshCloudDot(){
  const dot=$('#syncDot'),txt=$('#syncText');if(!dot||!txt)return;
  dot.className='sync-dot '+(state.cloud.available?'ok':'');
  txt.textContent=state.cloud.available?'Sync server ready':'Offline local';
}

async function syncNow(){
  if(!state.cloud.available){toast('Cloud sync server is not available');return}
  try{
    const snapshot={version:1,updatedAt:Math.max(0,...state.mistakes.map(m=>m.updatedAt||0)),mistakes:state.mistakes};
    const lastServer=state.cloud.serverUpdatedAt||0;
    if(lastServer && lastServer>snapshot.updatedAt){
      await showConflictModal(lastServer,snapshot); return;
    }
    await fetch(getApi('/api/sync/notebook'),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
    const allImgIds=[...new Set(state.mistakes.flatMap(m=>m.imageIds||[]))];
    for(const iid of allImgIds){
      const rec=await dbGet('images',iid); if(!rec)continue;
      const buf=await rec.blob.arrayBuffer();
      await fetch(getApi('/api/sync/image/'+encodeURIComponent(iid)),{method:'PUT',headers:{'Content-Type':rec.type||'application/octet-stream'},body:buf});
    }
    const h=await fetch(getApi('/api/health')); const info=await h.json();state.cloud.serverUpdatedAt=info.updatedAt||snapshot.updatedAt;
    toast(`Synced ${state.mistakes.length} entries`);
    refreshCloudDot();
  }catch(e){state.cloud.status='error';refreshCloudDot();toast('Sync failed. Check server configuration.')}
}
async function restoreCloud(){
  if(!state.cloud.available){toast('Cloud sync server is not available');return}
  try{
    const r=await fetch(getApi('/api/restore'));if(!r.ok){toast('No cloud backup found');return}
    const snap=await r.json(); if(!snap.mistakes){toast('Cloud backup is empty');return}
    showConflictModal(snap.updatedAt,{...snap,cloudRestore:true});
  }catch{toast('Cloud restore failed')}
}
function showConflictModal(serverUpdatedAt,localSnapshot){
  showModal(`<div class="modal-head"><div class="modal-title">Cloud data detected</div><button class="icon-btn" id="closeModal">×</button></div>
  <div class="modal-body"><div class="notice">Cloud notebook was updated ${fmtDT(serverUpdatedAt)}. Choose how to resolve this snapshot.</div>
  <div class="section grid-3"><button class="soft-btn" id="keepLocal">Keep local</button><button class="soft-btn" id="keepCloud">Use cloud</button><button class="primary-btn" id="mergeCloud">Merge by newest update</button></div></div>`);
  $('#closeModal').onclick=closeModal;$('#keepLocal').onclick=()=>{closeModal();syncNow()};$('#keepCloud').onclick=async()=>{closeModal();await applyCloudSnapshot(localSnapshot)};$('#mergeCloud').onclick=async()=>{closeModal();await mergeCloud(localSnapshot)};
}
async function applyCloudSnapshot(snap){
  state.mistakes=snap.mistakes||[];
  const cloudIds=new Set(state.mistakes.flatMap(m=>m.imageIds||[]));
  // Download missing images if server provides them.
  for(const iid of cloudIds){
    if(await dbGet('images',iid))continue;
    try{const r=await fetch(getApi('/api/image/'+encodeURIComponent(iid)));if(!r.ok)continue;const blob=await r.blob();await dbPut('images',{id:iid,blob,type:blob.type,updatedAt:Date.now()});state.imageCache.set(iid,URL.createObjectURL(blob))}catch{}
  }
  for(const m of state.mistakes)await dbPut('mistakes',m);
  state.cloud.serverUpdatedAt=snap.updatedAt||0;render();toast('Cloud snapshot restored');
}
async function mergeCloud(cloud){
  const localById=new Map(state.mistakes.map(m=>[m.id,m]));const merged=[...(cloud.mistakes||[])];
  for(const lm of state.mistakes){
    const cm=localById.get(lm.id); if(!cm) merged.push(lm); else { const i=merged.findIndex(x=>x.id===lm.id); merged[i]=(lm.updatedAt||0)>(cm.updatedAt||0)?lm:cm; }
  }
  const snap={version:1,updatedAt:Math.max(...merged.map(m=>m.updatedAt||0)),mistakes:merged};
  state.mistakes=merged;for(const m of merged)await dbPut('mistakes',m);await fetch(getApi('/api/sync/notebook'),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(snap)});state.cloud.serverUpdatedAt=snap.updatedAt;render();toast('Merged using newest entry')}
async function exportJSON(){
  const images={};
  for(const m of state.mistakes)for(const iid of m.imageIds||[]){const rec=await dbGet('images',iid);if(rec)images[iid]={name:rec.name||iid,type:rec.type||'image/jpeg',data:await blobToDataURL(rec.blob)}}
  const data={version:1,exportedAt:now(),mistakes:state.mistakes,images};
  downloadBlob(new Blob([JSON.stringify(data)],{type:'application/json'}),'mistake-notebook-backup.json');toast('JSON backup exported')}
async function importJSON(file){
  if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.mistakes))throw new Error('Invalid backup');
    for(const m of data.mistakes)await dbPut('mistakes',m);
    for(const [iid,x] of Object.entries(data.images||{})){const blob=await dataURLToBlob(x.data);await dbPut('images',{id:iid,blob,type:x.type,name:x.name,updatedAt:now()});state.imageCache.set(iid,URL.createObjectURL(blob))}
    state.mistakes=await dbGetAll('mistakes');render();toast('Backup imported')}
  catch(e){toast('Import failed')}
}
async function exportPDF(){
  const active=state.mistakes.filter(m=>!m.isArchived);const w=open('','_blank');
  const body=active.map(m=>`<article><h2>${esc(m.title||'Untitled')}</h2><p><b>${esc(m.subject)} / ${esc(m.chapter)}</b> • ${m.category}</p><div>${m.description||''}</div><p><b>Why:</b> ${esc(reasonTextPlain(m))}</p><p><b>What should I have thought?</b> ${esc(stripHTML(m.whatShouldIHaveThought||''))}</p><p><b>Correct approach:</b> ${esc(stripHTML(m.correctApproach||''))}</p><hr></article>`).join('');
  w.document.write(`<html><head><title>Mistake Notebook Report</title><style>body{font-family:Arial;background:#111;color:#eee;padding:30px}article{page-break-inside:avoid;margin-bottom:30px}hr{border-color:#444}p{color:#ccc}</style></head><body><h1>Mistake Notebook</h1>${body}</body></html>`);w.document.close();setTimeout(()=>w.print(),400)
}
function reasonTextPlain(m){return [...(m.mistakeReasons||[]),m.reasonDetails].filter(Boolean).join('; ')}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
function blobToDataURL(blob){return new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(blob)})}
async function dataURLToBlob(url){const r=await fetch(url);return r.blob()}

async function exportZIP(){
  const entries=[];
  entries.push({name:'notebook.json',data:new TextEncoder().encode(JSON.stringify({version:1,exportedAt:now(),mistakes:state.mistakes},null,2))});
  for(const m of state.mistakes)for(const iid of m.imageIds||[]){const rec=await dbGet('images',iid);if(rec)entries.push({name:`images/${iid}.jpg`,data:new Uint8Array(await rec.blob.arrayBuffer())})}
  const zip=makeZip(entries);
  downloadBlob(zip,'mistake-notebook-backup.zip');toast('ZIP backup exported');
}
function crc32(buf){let c=0xffffffff;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concat(arrs){let n=arrs.reduce((a,b)=>a+b.length,0),o=new Uint8Array(n),p=0;for(const a of arrs){o.set(a,p);p+=a.length}return o}
function makeZip(entries){
  const locals=[],central=[];let offset=0;
  for(const e of entries){const name=new TextEncoder().encode(e.name),data=e.data,c=crc32(data);
    const local=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(c),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);locals.push(local);
    const cen=concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(c),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);central.push(cen);offset+=local.length;
  }
  const centralData=concat(central),localData=concat(locals);
  return new Blob([concat([localData,centralData,u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralData.length),u32(localData.length),u16(0)])],{type:'application/zip'});
}

async function preloadImages(){for(const m of state.mistakes.slice(0,200))for(const iid of m.imageIds||[])if(!state.imageCache.has(iid))await loadImageUrl(iid)}

init().then(preloadImages).catch(e=>{console.error(e);$('#content').innerHTML='<div class="empty">Application initialization failed. Check that you are serving the project from a local web server.</div>'});
