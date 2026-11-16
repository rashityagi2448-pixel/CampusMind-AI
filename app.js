(() => {
  'use strict';

  const STORE_KEY = 'campusmind-v1';
  const STUDENT_NAME = 'Rashi Tyagi';
  const FIRST_NAME = STUDENT_NAME.split(' ')[0];
  const DAY = 86400000;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let clickAudioContext;
  function playButtonSound() {
    const AudioContext = window.AudioContext;
    if (!AudioContext) return;
    clickAudioContext = clickAudioContext || new AudioContext();
    const playTone = () => {
      const oscillator = clickAudioContext.createOscillator();
      const gain = clickAudioContext.createGain();
      const now = clickAudioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      oscillator.connect(gain);
      gain.connect(clickAudioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.04);
    };
    if (clickAudioContext.state === 'suspended') {
      clickAudioContext.resume().then(playTone).catch(error => console.error('Could not play button sound:', error));
      return;
    }
    playTone();
  }
  const localDay = (date = new Date()) => {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  };
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const readStore = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return { tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [], notes: Array.isArray(parsed.notes) ? parsed.notes : [], plans: Array.isArray(parsed.plans) ? parsed.plans : [], sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
    } catch { return { tasks: [], notes: [], plans: [], sessions: [] }; }
  };
  let state = readStore();
  let taskFilter = 'all';
  let sortAscending = true;
  let weekOffset = 0;
  let notesQuery = '';
  let notesSubject = 'all';
  let timer = { duration: 25 * 60, remaining: 25 * 60, running: false, interval: null, subject: 'Deep focus' };

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { toast('Your browser could not save this change. Check available storage.', ''); }
  }
  function toast(message, type = 'success') {
    const region = $('#toast-region');
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.textContent = message;
    region.append(item);
    window.setTimeout(() => item.remove(), 3200);
  }
  function dateLabel(value, options = { month: 'short', day: 'numeric' }) {
    if (!value) return 'No date';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? 'No date' : new Intl.DateTimeFormat(undefined, options).format(date);
  }
  function dayDistance(value) {
    const target = new Date(`${value}T00:00:00`);
    const today = new Date(`${localDay()}T00:00:00`);
    return Math.round((target - today) / DAY);
  }
  function dueText(value) {
    const delta = dayDistance(value);
    if (delta < 0) return `${Math.abs(delta)}d overdue`;
    if (delta === 0) return 'Due today';
    if (delta === 1) return 'Due tomorrow';
    return dateLabel(value);
  }
  function goTo(view) {
    const target = $(`#view-${view}`);
    if (!target) return;
    $$('.view').forEach(node => node.classList.toggle('active', node === target));
    $$('.nav-link').forEach(node => node.classList.toggle('active', node.dataset.view === view));
    $('#breadcrumb-current').textContent = target.dataset.title || 'Overview';
    $('#sidebar').classList.remove('open');
    window.location.hash = view === 'dashboard' ? 'dashboard' : view;
    if (view === 'planner') renderPlanner();
    if (view === 'progress') renderProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function showModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    const dateInput = $('input[type="date"]', modal);
    if (dateInput && !dateInput.value) dateInput.value = localDay();
    window.setTimeout(() => $('input:not([type="date"]),textarea', modal)?.focus(), 60);
  }
  function closeModal(modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
  function icon(name) { return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`; }
  function emptyState(title, detail) { return `<div class="empty-state"><strong>${esc(title)}</strong>${esc(detail)}</div>`; }
  function renderTaskRow(task, full = false) {
    const completed = task.completed;
    if (full) {
      const overdue = !completed && dayDistance(task.due) < 0;
      return `<div class="full-task-row ${completed ? 'completed' : ''}" data-task-id="${esc(task.id)}"><button class="task-check ${completed ? 'done' : ''}" data-toggle-task="${esc(task.id)}" aria-label="${completed ? 'Mark incomplete' : 'Complete task'}">${icon('check')}</button><div class="task-copy"><strong>${esc(task.title)}</strong><small>${esc(task.subject)}</small></div><span class="subject-tag">${esc(task.subject)}</span><span class="task-due ${overdue ? 'overdue' : ''}">${esc(dueText(task.due))}</span><span class="priority-label ${esc(task.priority)}">${esc(task.priority[0].toUpperCase() + task.priority.slice(1))}</span><button class="delete-task" data-delete-task="${esc(task.id)}" aria-label="Delete task">×</button></div>`;
    }
    return `<div class="task-row ${completed ? 'completed' : ''}" data-task-id="${esc(task.id)}"><button class="task-check ${completed ? 'done' : ''}" data-toggle-task="${esc(task.id)}" aria-label="${completed ? 'Mark incomplete' : 'Complete task'}">${icon('check')}</button><div class="task-copy"><strong>${esc(task.title)}</strong><small>${esc(task.subject)} · ${esc(dueText(task.due))}</small></div><span class="task-priority ${esc(task.priority)}" title="${esc(task.priority)} priority"></span></div>`;
  }
  function renderTasks() {
    const openTasks = state.tasks.filter(task => !task.completed).sort((a, b) => a.due.localeCompare(b.due));
    const completed = state.tasks.filter(task => task.completed);
    const shown = taskFilter === 'active' ? openTasks : taskFilter === 'completed' ? completed : [...state.tasks].sort((a, b) => a.due.localeCompare(b.due));
    $('#nav-task-count').textContent = openTasks.length;
    $('#stat-tasks').innerHTML = `${completed.length}<span>/ ${state.tasks.length}</span>`;
    const completion = state.tasks.length ? Math.round(completed.length / state.tasks.length * 100) : 0;
    $('#task-progress-bar').style.width = `${completion}%`;
    $('#task-stat-foot').textContent = state.tasks.length ? `${completion}% of your tasks completed` : 'Your to-do list starts here';
    $('#dashboard-tasks').innerHTML = openTasks.length ? openTasks.slice(0, 3).map(task => renderTaskRow(task)).join('') : emptyState('All caught up!', 'Add a task when you’re ready.');
    $('#full-task-list').innerHTML = shown.length ? shown.sort((a, b) => sortAscending ? a.due.localeCompare(b.due) : b.due.localeCompare(a.due)).map(task => renderTaskRow(task, true)).join('') : emptyState(taskFilter === 'completed' ? 'Nothing completed yet' : 'No tasks here', 'Add a task to keep track of what’s next.');
    $('#tasks-open-count').textContent = openTasks.length;
    $('#tasks-done-count').textContent = completed.length;
    $('#tasks-next-count').textContent = openTasks[0] ? dueText(openTasks[0].due) : 'Nothing due';
    $('#filter-all').textContent = state.tasks.length;
    $('#filter-active').textContent = openTasks.length;
    $('#filter-completed').textContent = completed.length;
    const upcomingTasks = openTasks.slice(0, 2);
    const plans = state.plans.filter(plan => plan.date >= localDay()).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, Math.max(0, 3 - upcomingTasks.length));
    const upcoming = [
      ...upcomingTasks.map(task => ({ title: task.title, subtitle: `${task.subject} · Task`, date: task.due, label: dueText(task.due) })),
      ...plans.map(plan => ({ title: plan.title, subtitle: `${plan.subject} · Study block`, date: plan.date, label: plan.time }))
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    $('#upcoming-list').innerHTML = upcoming.length ? upcoming.map(item => `<div class="upcoming-item"><div class="date-tile"><span>${esc(dateLabel(item.date, { month: 'short' }).toUpperCase())}</span><strong>${esc(dateLabel(item.date, { day: 'numeric' }))}</strong></div><div class="upcoming-copy"><strong>${esc(item.title)}</strong><small>${esc(item.subtitle)}</small></div><span class="due-label">${esc(item.label)}</span></div>`).join('') : emptyState('Nothing coming up', 'Add a task or plan a study block.');
    renderProgressStats();
  }
  function renderNotes() {
    const query = notesQuery.trim().toLowerCase();
    const notes = state.notes.filter(note => (notesSubject === 'all' || note.subject === notesSubject) && (!query || `${note.title} ${note.content} ${note.subject}`.toLowerCase().includes(query))).sort((a, b) => b.createdAt - a.createdAt);
    $('#notes-count-label').textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`;
    $('#dashboard-notes').innerHTML = [...state.notes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3).map(note => `<div class="note-row"><span class="note-color"></span><div><strong>${esc(note.title)}</strong><small>${esc(note.subject)} · ${esc(dateLabel(note.date))}</small></div></div>`).join('') || emptyState('Your ideas live here', 'Create your first note.');
    $('#full-notes-grid').innerHTML = notes.length ? notes.map(note => `<article class="note-card"><div class="note-card-top"><span class="subject-pill">${esc(note.subject)}</span><span class="note-date">${esc(dateLabel(note.date))}</span></div><h3>${esc(note.title)}</h3><p>${esc(note.content)}</p><button class="note-delete" data-delete-note="${esc(note.id)}" aria-label="Delete ${esc(note.title)}">×</button></article>`).join('') : emptyState(query || notesSubject !== 'all' ? 'No matching notes' : 'A fresh page', query || notesSubject !== 'all' ? 'Try a different search or subject.' : 'Create a note to save what you learn.');
  }
  function mondayFor(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function renderPlanner() {
    const start = mondayFor(new Date()); start.setDate(start.getDate() + weekOffset * 7);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const sameMonth = start.getMonth() === end.getMonth();
    $('#week-label').textContent = sameMonth ? `${dateLabel(localDay(start))} – ${dateLabel(localDay(end), { month: 'long', day: 'numeric', year: 'numeric' })}` : `${dateLabel(localDay(start))} – ${dateLabel(localDay(end), { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const days = Array.from({ length: 7 }, (_, index) => { const d = new Date(start); d.setDate(start.getDate() + index); return d; });
    $('#week-grid').innerHTML = days.map(date => {
      const key = localDay(date);
      const plans = state.plans.filter(plan => plan.date === key).sort((a, b) => a.time.localeCompare(b.time));
      return `<div class="week-day ${key === localDay() ? 'today' : ''}"><div class="week-day-head"><span>${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date).toUpperCase()}</span><strong>${date.getDate()}</strong></div><div class="week-events">${plans.length ? plans.map(plan => `<div class="week-event" data-delete-plan="${esc(plan.id)}" title="Click to remove this study block"><strong>${esc(plan.title)}</strong><small>${esc(plan.time)} · ${esc(plan.duration)}m</small></div>`).join('') : '<div class="week-empty">—</div>'}</div></div>`;
    }).join('');
    const weekStart = localDay(start), weekEnd = localDay(end);
    const planned = state.plans.filter(plan => plan.date >= weekStart && plan.date <= weekEnd);
    const minutes = planned.reduce((sum, plan) => sum + Number(plan.duration || 0), 0);
    $('#planner-block-count').textContent = `${planned.length} study ${planned.length === 1 ? 'block' : 'blocks'} planned`;
    $('#planner-time-count').textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  function sessionsWithin(days = 7) {
    const cutoff = Date.now() - days * DAY;
    return state.sessions.filter(session => session.endedAt >= cutoff);
  }
  function currentStreak() {
    const dates = new Set(state.sessions.map(session => session.date));
    let count = 0;
    const cursor = new Date(`${localDay()}T00:00:00`);
    if (!dates.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (dates.has(localDay(cursor))) { count++; cursor.setDate(cursor.getDate() - 1); }
    return count;
  }
  function minutesByDay(days = 7) {
    const today = new Date(`${localDay()}T00:00:00`);
    return Array.from({ length: days }, (_, idx) => {
      const date = new Date(today); date.setDate(today.getDate() - (days - 1 - idx));
      const key = localDay(date);
      return { key, date, minutes: state.sessions.filter(session => session.date === key).reduce((sum, session) => sum + session.minutes, 0) };
    });
  }
  function renderProgressStats() {
    const week = sessionsWithin(7);
    const minutes = week.reduce((sum, session) => sum + session.minutes, 0);
    $('#stat-hours').innerHTML = `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}<span>h</span>`;
    $('#stat-streak').innerHTML = `${currentStreak()}<span> days</span>`;
    const days = minutesByDay(7);
    const max = Math.max(30, ...days.map(day => day.minutes));
    $('#mini-bars').innerHTML = days.map(day => `<span title="${esc(dateLabel(day.key))}: ${day.minutes} min" style="height:${Math.max(4, Math.round(day.minutes / max * 25))}px"></span>`).join('');
    $$('.streak-dots span').forEach((dot, i) => dot.classList.toggle('lit', Boolean(days[i]?.minutes)));
    const todayMinutes = state.sessions.filter(session => session.date === localDay()).reduce((sum, session) => sum + session.minutes, 0);
    $('#today-focus-minutes').textContent = todayMinutes;
    $('#today-focus-bar').style.width = `${Math.min(100, todayMinutes / 120 * 100)}%`;
    $('#focus-week-total').textContent = `${minutes} min`;
  }
  function chartMarkup(days) {
    const width = 600, height = 150, max = Math.max(60, ...days.map(day => day.minutes));
    const points = days.map((day, index) => ({ x: days.length === 1 ? width / 2 : index * width / (days.length - 1), y: height - 12 - day.minutes / max * (height - 25) }));
    const line = points.map(point => `${point.x},${point.y}`).join(' ');
    const area = `0,${height} ${line} ${width},${height}`;
    const labels = days.map(day => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day.date).toUpperCase());
    return `<svg viewBox="0 0 ${width} ${height + 18}" preserveAspectRatio="none" role="img" aria-label="Daily focus time chart"><defs><linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8195ff" stop-opacity=".25"/><stop offset="100%" stop-color="#8195ff" stop-opacity="0"/></linearGradient></defs><path d="M${area.replaceAll(' ', ' L')}Z" fill="url(#progressFill)"/><polyline points="${line}" fill="none" stroke="#8195ff" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>${points.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="#aab8ff" stroke="#17243b" stroke-width="3" vector-effect="non-scaling-stroke"><title>${labels[index]}: ${days[index].minutes} min</title></circle>`).join('')}${labels.map((label, index) => `<text x="${points[index].x}" y="${height + 13}" fill="#75839a" font-size="9" text-anchor="${index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}">${label}</text>`).join('')}</svg>`;
  }
  function renderProgress() {
    const allMinutes = state.sessions.reduce((sum, session) => sum + session.minutes, 0);
    $('#progress-total-hours').innerHTML = `${Math.floor(allMinutes / 60)}<span>h</span> ${allMinutes % 60}<span>m</span>`;
    $('#progress-session-count').textContent = state.sessions.length;
    $('#progress-task-count').textContent = state.tasks.filter(task => task.completed).length;
    $('#progress-streak-count').innerHTML = `${currentStreak()} <small>days</small>`;
    $('#progress-daily-average').innerHTML = `${state.sessions.length ? Math.round(allMinutes / Math.max(1, new Set(state.sessions.map(item => item.date)).size)) : 0}<small>m</small>`;
    $('#large-chart').innerHTML = chartMarkup(minutesByDay(7));
    const milestones = [
      ['✦', 'First focus session', 'Complete one focus session', state.sessions.length >= 1],
      ['◷', 'Focus hour', 'Reach 60 minutes focused', allMinutes >= 60],
      ['✓', 'Getting things done', 'Complete your first task', state.tasks.some(task => task.completed)],
      ['▦', 'Plan ahead', 'Schedule a study block', state.plans.length >= 1],
      ['✧', 'Consistency counts', 'Build a 3 day streak', currentStreak() >= 3],
      ['★', 'Deep work', 'Reach 5 hours focused', allMinutes >= 300]
    ];
    $('#achievement-list').innerHTML = milestones.map(([iconText, title, detail, unlocked]) => `<div class="achievement ${unlocked ? 'unlocked' : ''}"><span class="achievement-icon">${iconText}</span><span><strong>${title}</strong><small>${detail}</small></span></div>`).join('');
  }
  function renderAll() { renderTasks(); renderNotes(); renderPlanner(); renderProgress(); }

  // The assistant runs locally, offering study prompts without an external API.
  function assistantReply(input) {
    const text = input.toLowerCase();
    if (/quiz|test me/.test(text)) return 'Absolutely! Pick one topic you’ve been studying and I’ll help you build a quick recall quiz. Start by writing down three questions from memory, then check your notes and fill in what you missed. What topic should we use?';
    if (/plan|schedule|exam/.test(text)) return 'Let’s make a simple plan: 1) List the topics you need to cover. 2) Start with the one that feels least familiar. 3) Work in 25 minute focus blocks with a short break between them. 4) Leave the last block for active recall. What subject are you preparing for?';
    if (/assignment|break down|steps/.test(text)) return 'Try breaking it into four small wins: understand the prompt, gather your sources or materials, make a quick outline, then finish one section at a time. Add each step as its own task so you can see your progress. What is the assignment about?';
    if (/tip|smarter|focus|study/.test(text)) return 'A useful trick: before you open your notes, spend two minutes writing down what you already remember. This kind of active recall helps your brain identify the gaps and makes your review more focused.';
    if (/explain|what is|how does|concept/.test(text)) return 'Let’s make it click. First, break the idea into its simplest parts. Connect it to something you already understand, then try explaining it in your own words. Share the specific concept and subject, and I can help you work through it step by step.';
    return 'Good question. I’m a local study companion, so I can help you organize your thinking and study strategy. Try telling me the subject and what part feels confusing, and we can break it down together.';
  }
  function addMessage(text, who) {
    const row = document.createElement('div'); row.className = `message-row ${who}`;
    if (who === 'assistant') row.innerHTML = `<div class="assistant-avatar mini">${icon('spark')}</div><div class="chat-bubble"><p></p><span class="message-time">Just now</span></div>`;
    else row.innerHTML = '<div class="chat-bubble"><p></p></div>';
    $('p', row).textContent = text;
    $('#chat-messages').append(row); $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
  }
  function sendPrompt(prompt) {
    if (!prompt.trim()) return;
    addMessage(prompt.trim(), 'user'); $('#chat-input').value = '';
    window.setTimeout(() => addMessage(assistantReply(prompt), 'assistant'), 300);
  }
  const todayText = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  $('#today-label').textContent = todayText;
  const hour = new Date().getHours();
  $('#greeting').innerHTML = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${esc(FIRST_NAME)} <span class="wave">✦</span>`;

  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('button')) playButtonSound();
  }, true);
  $$('.nav-link').forEach(link => link.addEventListener('click', event => { event.preventDefault(); goTo(link.dataset.view); }));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => goTo(button.dataset.go)));
  $$('[data-open]').forEach(button => button.addEventListener('click', () => showModal(button.dataset.open)));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.modal-backdrop'))));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop); }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop.open').forEach(closeModal); });
  $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#profile-button').addEventListener('click', () => toast(`You’re all set, ${STUDENT_NAME}!`, 'success'));
  $('#top-avatar').addEventListener('click', () => toast(`You’re all set, ${STUDENT_NAME}!`, 'success'));
  $('#notification-button').addEventListener('click', () => toast('You’re up to date. Keep up the great work!', 'success'));
  $('#progress-period').addEventListener('click', () => toast('Showing your current week at a glance.', 'success'));
  $('#progress-view-period').addEventListener('change', event => {
    const count = event.target.value === 'This month' ? 30 : 7;
    $('#large-chart').innerHTML = chartMarkup(minutesByDay(count));
    toast(`${event.target.value} progress selected.`, 'success');
  });
  $('#task-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]'); if (!button) return;
    taskFilter = button.dataset.filter;
    $$('#task-filters button').forEach(item => item.classList.toggle('selected', item === button));
    renderTasks();
  });
  $('#sort-tasks').addEventListener('click', event => { sortAscending = !sortAscending; event.currentTarget.textContent = `Due date ${sortAscending ? '↓' : '↑'}`; renderTasks(); });
  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-toggle-task]');
    if (toggle) { const task = state.tasks.find(item => item.id === toggle.dataset.toggleTask); if (task) { task.completed = !task.completed; save(); renderAll(); toast(task.completed ? 'Task completed. Nice work!' : 'Task moved back to your to-do list.'); } }
    const remove = event.target.closest('[data-delete-task]');
    if (remove) { state.tasks = state.tasks.filter(item => item.id !== remove.dataset.deleteTask); save(); renderAll(); toast('Task removed.'); }
    const removeNote = event.target.closest('[data-delete-note]');
    if (removeNote) { state.notes = state.notes.filter(item => item.id !== removeNote.dataset.deleteNote); save(); renderNotes(); toast('Note deleted.'); }
    const removePlan = event.target.closest('[data-delete-plan]');
    if (removePlan) { state.plans = state.plans.filter(item => item.id !== removePlan.dataset.deletePlan); save(); renderPlanner(); toast('Study block removed.'); }
  });
  $('#task-form').addEventListener('submit', event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    state.tasks.push({ id: uid(), title: form.get('title').trim(), subject: form.get('subject'), due: form.get('due'), priority: form.get('priority'), completed: false, createdAt: Date.now() });
    save(); event.currentTarget.reset(); closeModal($('#task-modal')); renderAll(); toast('Task added. You’ve got this!');
  });
  $('#note-form').addEventListener('submit', event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    state.notes.push({ id: uid(), title: form.get('title').trim(), subject: form.get('subject'), content: form.get('content').trim(), date: localDay(), createdAt: Date.now() });
    save(); event.currentTarget.reset(); closeModal($('#note-modal')); renderNotes(); toast('Note saved.');
  });
  $('#plan-form').addEventListener('submit', event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    state.plans.push({ id: uid(), title: form.get('title').trim(), subject: form.get('subject'), date: form.get('date'), time: form.get('time'), duration: Number(form.get('duration')) });
    save(); event.currentTarget.reset(); closeModal($('#plan-modal')); renderAll(); toast('Study block added to your planner.');
  });
  $('#week-prev').addEventListener('click', () => { weekOffset--; renderPlanner(); });
  $('#week-next').addEventListener('click', () => { weekOffset++; renderPlanner(); });
  $('#notes-search').addEventListener('input', event => { notesQuery = event.target.value; renderNotes(); });
  $('#notes-filter').addEventListener('change', event => { notesSubject = event.target.value; renderNotes(); });
  $('#chat-form').addEventListener('submit', event => { event.preventDefault(); sendPrompt($('#chat-input').value); });
  $$('.suggestion-chip').forEach(button => button.addEventListener('click', () => sendPrompt(button.textContent)));
  $$('[data-prompt]').forEach(button => button.addEventListener('click', () => { goTo('assistant'); sendPrompt(button.dataset.prompt); }));
  $('#clear-chat').addEventListener('click', () => { $('#chat-messages').innerHTML = '<div class="chat-day">TODAY</div><div class="message-row"><div class="assistant-avatar mini">' + icon('spark') + '</div><div class="chat-bubble"><strong>Fresh start! ✨</strong><p>What would you like to work on today?</p><span class="message-time">Just now</span></div></div>'; toast('Conversation cleared.'); });
  const tips = ['Try the Feynman technique: explain an idea in simple terms to see what you really understand.', 'Start with a two minute rule. Promise yourself you’ll work for just two minutes, then build momentum.', 'Switch passive rereading for active recall: close your notes and write down what you remember.', 'Group related ideas into small chunks. Your brain remembers meaningful patterns more easily.'];
  let tipIndex = 0;
  $('#tip-button').addEventListener('click', () => { tipIndex = (tipIndex + 1) % tips.length; $('.tips-card p').textContent = tips[tipIndex]; });

  const circumference = 2 * Math.PI * 119;
  $('#timer-progress').style.strokeDasharray = circumference;
  function updateTimer() {
    const mins = Math.floor(timer.remaining / 60); const secs = timer.remaining % 60;
    $('#timer-display').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    $('#timer-progress').style.strokeDashoffset = circumference * (1 - timer.remaining / timer.duration);
    $('#timer-status').textContent = timer.running ? 'YOU’RE IN THE FLOW' : timer.remaining === timer.duration ? 'READY WHEN YOU ARE' : timer.remaining === 0 ? 'SESSION COMPLETE' : 'SESSION PAUSED';
    $('#timer-start').innerHTML = `${icon(timer.running ? 'pause' : 'play')} ${timer.running ? 'Pause session' : timer.remaining < timer.duration ? 'Resume session' : 'Start focusing'}`;
  }
  function finishTimer() {
    timer.running = false; window.clearInterval(timer.interval); timer.interval = null;
    if (timer.subject.toLowerCase().includes('break')) { toast('Break complete. Ready for another focus block?'); }
    else { state.sessions.push({ id: uid(), date: localDay(), endedAt: Date.now(), minutes: Math.round(timer.duration / 60), subject: timer.subject }); save(); renderAll(); toast('Focus session complete. Great work!'); }
    updateTimer();
  }
  $('#timer-start').addEventListener('click', () => {
    if (timer.running) { timer.running = false; clearInterval(timer.interval); timer.interval = null; }
    else {
      if (timer.remaining <= 0) timer.remaining = timer.duration;
      timer.running = true;
      timer.interval = window.setInterval(() => { timer.remaining--; updateTimer(); if (timer.remaining <= 0) finishTimer(); }, 1000);
    }
    updateTimer();
  });
  $('#timer-reset').addEventListener('click', () => { timer.running = false; clearInterval(timer.interval); timer.interval = null; timer.remaining = timer.duration; updateTimer(); toast('Timer reset.'); });
  $$('.timer-presets button').forEach(button => button.addEventListener('click', () => {
    timer.running = false; clearInterval(timer.interval); timer.interval = null;
    timer.duration = Number(button.dataset.minutes) * 60; timer.remaining = timer.duration;
    timer.subject = button.dataset.minutes === '5' || button.dataset.minutes === '15' ? button.textContent.split(' ')[0] + ' break' : $('#focus-subject').value;
    $$('.timer-presets button').forEach(item => item.classList.toggle('selected', item === button)); updateTimer();
  }));
  $('#focus-subject').addEventListener('change', event => { timer.subject = event.target.value; });

  // Allow direct links such as index.html#planner to open the matching screen.
  const initialView = window.location.hash.slice(1);
  if ($(`#view-${initialView}`)) goTo(initialView);
  renderAll(); updateTimer();
})();
