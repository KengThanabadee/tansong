
    (() => {
      const KEY = 'studyflow-tu107-tasks-v1';
      const sample = [
        {id:'sample-1',title:'ใบงาน TU107',subject:'TU107',date:'2026-11-01',time:'23:59',priority:'ปกติ',status:'กำลังทำ',steps:[{id:'sample-1-step-1',text:'อ่านโจทย์',done:true},{id:'sample-1-step-2',text:'ร่างคำตอบ',done:false},{id:'sample-1-step-3',text:'ตรวจทาน',done:false},{id:'sample-1-step-4',text:'ส่งงาน',done:false}]},
        {id:'sample-2',title:'แบบฝึกหัดสถิติ',subject:'สถิติ',date:'2026-11-04',time:'23:59',priority:'ปกติ',status:'ต้องทำ',steps:[]},
        {id:'sample-3',title:'รายงานการเงิน',subject:'การเงิน',date:'2026-11-06',time:'23:59',priority:'ปกติ',status:'ต้องทำ',steps:[]}
      ];
      const $ = id => document.getElementById(id);
      const copySample = () => JSON.parse(JSON.stringify(sample));
      let tasks;
      try {
        const stored = JSON.parse(localStorage.getItem(KEY));
        tasks = Array.isArray(stored) ? stored : copySample();
      } catch { tasks = copySample(); }
      let selectedId = null, editingId = null, confirmAction = null;
      const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tasks)); return true; } catch { return false; } };
      const feedback = (message, error=false) => { const el=$('feedback'); el.textContent=message; el.hidden=false; el.classList.toggle('text-[#a3392a]',error); el.classList.toggle('text-[#245e45]',!error); };
      const dateText = date => {
        const [y,m,d] = String(date).split('-').map(Number);
        if (!y || !m || !d) return 'ยังไม่ระบุวันส่ง';
        return new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'numeric',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12));
      };
      const sortTasks = rows => [...rows].sort((a,b) => (a.date||'').localeCompare(b.date||'') || (a.time||'').localeCompare(b.time||'') || a.title.localeCompare(b.title,'th'));
      const task = () => tasks.find(t=>t.id===selectedId);
      function syncTaskProgress(t, requestedStatus) {
        const steps = Array.isArray(t.steps) ? t.steps : [];
        if (!steps.length) { if (requestedStatus) t.status = requestedStatus; return; }
        if (requestedStatus === 'ต้องทำ') steps.forEach(step => { step.done = false; });
        if (requestedStatus === 'เสร็จแล้ว') steps.forEach(step => { step.done = true; });
        if (requestedStatus === 'กำลังทำ' && steps.every(step => step.done)) steps[steps.length - 1].done = false;
        if (requestedStatus) {
          const done = steps.filter(step => step.done).length;
          t.status = done === steps.length ? 'เสร็จแล้ว' : done > 0 ? 'กำลังทำ' : requestedStatus;
        } else {
          const done = steps.filter(step => step.done).length;
          t.status = done === steps.length ? 'เสร็จแล้ว' : (done > 0 || t.status === 'กำลังทำ' || t.status === 'เสร็จแล้ว') ? 'กำลังทำ' : 'ต้องทำ';
        }
      }
      const persistAndNotify = successText => {
        const saved = save();
        feedback(saved ? successText : `${successText} · บันทึกไว้ในครั้งนี้`, !saved);
      };
      const make = (tag,className,text) => { const el=document.createElement(tag); el.className=className; el.textContent=text; return el; };

      function navigate(name) {
        document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!=='page-'+name);
        document.querySelectorAll('.nav-button').forEach(b=>{const active=b.dataset.go===name;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
        if(name==='demo') render();
        window.scrollTo({top:0,behavior:'smooth'});
      }
      document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));

      function renderSubjects(){
        const select=$('filter-subject'), current=select.value;
        const subjects=[...new Set(tasks.map(t=>t.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
        select.replaceChildren(new Option('ทุกวิชา',''),...subjects.map(s=>new Option(s,s)));
        select.value=subjects.includes(current)?current:'';
      }
      function render(){
        renderSubjects();
        const query=$('search').value.trim().toLocaleLowerCase('th');
        const rows=sortTasks(tasks.filter(t=>(!query||t.title.toLocaleLowerCase('th').includes(query))&&(!$('filter-subject').value||t.subject===$('filter-subject').value)&&(!$('filter-status').value||t.status===$('filter-status').value)));
        $('task-count').textContent=`${rows.length} งาน`;
        $('empty-state').hidden=rows.length!==0;
        const list=$('task-list'); list.replaceChildren();
        rows.forEach(t=>{
          const button=make('button','task-item'+(selectedId===t.id?' selected':''),'');
          button.type='button';button.setAttribute('aria-label',`ดูรายละเอียด ${t.title}`);
          const top=make('div','flex items-start justify-between gap-3','');
          top.append(make('strong','break-words',t.title),make('span','chip whitespace-nowrap',t.status));
          const steps=Array.isArray(t.steps)?t.steps:[], done=steps.filter(s=>s.done).length;
          button.append(top,make('div','text-sm text-[#66756d] mt-2',`${t.subject||'ไม่ระบุวิชา'} · ส่ง ${dateText(t.date)} เวลา ${t.time||'23:59'} น.`),make('div','text-sm text-[#245e45] font-semibold mt-2',steps.length?`ความคืบหน้า ${done}/${steps.length} ขั้นตอน · ดูขั้นตอน ›`:'ดูขั้นตอน ›'));
          button.addEventListener('click',()=>{selectedId=t.id;render();});
          list.append(button);
        });
        renderDetail();
      }
      function renderDetail(){
        const t=task(), panel=$('detail-panel');panel.hidden=!t;
        if(!t)return;
        $('detail-title').textContent=t.title;
        $('detail-meta').textContent=`${t.subject||'ไม่ระบุวิชา'} · ส่ง ${dateText(t.date)} เวลา ${t.time||'23:59'} น. · ความสำคัญ${t.priority||'ปกติ'}`;
        $('detail-status').value=t.status;
        const steps=Array.isArray(t.steps)?t.steps:[];
        const done=steps.filter(s=>s.done).length, percent=steps.length?Math.round(done/steps.length*100):(t.status==='เสร็จแล้ว'?100:0);
        $('progress-text').textContent=steps.length?`เสร็จ ${done} จาก ${steps.length} ขั้นตอน (${percent}%)`:`ยังไม่มีขั้นตอนย่อย · ความคืบหน้า ${percent}%`;
        $('progress-fill').style.width=percent+'%';$('progress-bar').setAttribute('aria-valuenow',String(percent));
        const list=$('steps-list');list.replaceChildren();
        steps.forEach(s=>{
          const row=make('div','flex items-center gap-3 rounded-xl bg-[#f7f8f3] p-3','');
          const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!s.done;checkbox.className='w-5 h-5 accent-[#245e45] cursor-pointer';checkbox.setAttribute('aria-label',`ทำขั้นตอน ${s.text} เสร็จ`);
          checkbox.addEventListener('change',()=>{s.done=checkbox.checked;syncTaskProgress(t);persistAndNotify('อัปเดตขั้นตอนแล้ว');render();});
          const label=make('span','flex-1 break-words'+(s.done?' line-through text-[#66756d]':''),s.text);
          const remove=make('button','text-[#a3392a] font-semibold px-2','ลบ');remove.type='button';remove.setAttribute('aria-label',`ลบขั้นตอน ${s.text}`);
          remove.addEventListener('click',()=>{t.steps=t.steps.filter(x=>x.id!==s.id);syncTaskProgress(t);persistAndNotify('ลบขั้นตอนแล้ว');render();});
          row.append(checkbox,label,remove);list.append(row);
        });
      }
      function clearForm(){
        editingId=null;$('task-form').reset();$('task-time').value='23:59';$('form-error').hidden=true;
        $('save-task').textContent='บันทึกงาน';$('cancel-edit').hidden=true;
      }
      $('task-form').addEventListener('submit',event=>{
        event.preventDefault();
        const title=$('task-title').value.trim(), date=$('task-date').value;
        if(!title||!date){$('form-error').textContent=!title?'กรุณากรอกชื่องาน':'กรุณาเลือกวันส่ง';$('form-error').hidden=false;(!title?$('task-title'):$('task-date')).focus();return;}
        $('form-error').hidden=true;
        const values={title,subject:$('task-subject').value.trim(),date,time:$('task-time').value||'23:59',priority:$('task-priority').value};
        if(editingId){
          const found=tasks.find(t=>t.id===editingId);
          if(!found){clearForm();feedback('ไม่พบงานที่กำลังแก้ไข',true);return;}
          Object.assign(found,values);selectedId=found.id;
        }else{
          const newTask={id:uid(),...values,status:'ต้องทำ',steps:[]};tasks.push(newTask);selectedId=newTask.id;
        }
        persistAndNotify(editingId ? 'แก้ไขงานแล้ว' : 'เพิ่มงานแล้ว');clearForm();render();
      });
      $('cancel-edit').addEventListener('click',clearForm);
      $('search').addEventListener('input',render);
      $('filter-subject').addEventListener('change',render);
      $('filter-status').addEventListener('change',render);
      $('close-detail').addEventListener('click',()=>{selectedId=null;render();});
      $('detail-status').addEventListener('change',event=>{const t=task();if(!t)return;syncTaskProgress(t,event.target.value);persistAndNotify('อัปเดตสถานะแล้ว');render();});
      $('edit-task').addEventListener('click',()=>{
        const t=task();if(!t)return;editingId=t.id;
        $('task-title').value=t.title;$('task-subject').value=t.subject||'';$('task-date').value=t.date;$('task-time').value=t.time||'23:59';$('task-priority').value=t.priority||'ปกติ';
        $('save-task').textContent='บันทึกการแก้ไข';$('cancel-edit').hidden=false;$('task-title').focus();
      });
      $('step-form').addEventListener('submit',event=>{
        event.preventDefault();const t=task(),value=$('step-input').value.trim();if(!t||!value)return;
        if(!Array.isArray(t.steps))t.steps=[];
        t.steps.push({id:uid(),text:value,done:false});syncTaskProgress(t);$('step-input').value='';persistAndNotify('เพิ่มขั้นตอนแล้ว');render();
      });
      const openConfirm=(message,action)=>{$('confirm-message').textContent=message;confirmAction=action;$('confirm-overlay').hidden=false;$('confirm-cancel').focus();};
      const closeConfirm=()=>{$('confirm-overlay').hidden=true;confirmAction=null;};
      $('reset-open').addEventListener('click',()=>openConfirm('คืนค่ารายการตัวอย่าง 3 งาน? งานและขั้นตอนที่แก้ไขหรือเพิ่มไว้จะถูกแทนที่',()=>{tasks=copySample();selectedId=null;clearForm();$('search').value='';$('filter-status').value='';$('filter-subject').value='';persistAndNotify('คืนค่ารายการตัวอย่างแล้ว');render();}));
      $('delete-task').addEventListener('click',()=>{const t=task();if(!t)return;openConfirm(`ลบงาน “${t.title}” ใช่ไหม?`,()=>{tasks=tasks.filter(x=>x.id!==t.id);selectedId=null;if(editingId===t.id)clearForm();persistAndNotify('ลบงานแล้ว');render();});});
      $('confirm-cancel').addEventListener('click',closeConfirm);
      $('confirm-yes').addEventListener('click',()=>{const action=confirmAction;closeConfirm();if(action)action();});
      $('confirm-overlay').addEventListener('click',event=>{if(event.target===$('confirm-overlay'))closeConfirm();});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('confirm-overlay').hidden)closeConfirm();});
      tasks.forEach(t=>syncTaskProgress(t));
      render();

    })();
  