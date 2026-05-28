/**
 * Content script — runs on supported job-board pages. Three jobs:
 *
 *   1. Detect the job description text and the apply-button click so we
 *      can offer to attribute the application to a resume version.
 *   2. Inject a small "ATS Builder" floating action button that lets the
 *      user manually trigger JD capture or recruiter-view overlay.
 *   3. Carry no auth state in-page. All API calls go through the
 *      background service worker via chrome.runtime.sendMessage.
 *
 * This is deliberately conservative — we observe, we offer, we never
 * auto-submit or auto-click anything on the user's behalf.
 */

(() => {
  if (window.__atsBuilderInjected) return;
  window.__atsBuilderInjected = true;

  injectFab();
  hookApplyButtons();

  function injectFab() {
    const fab = document.createElement('div');
    fab.className = 'atsb-fab';
    fab.innerHTML = `
      <button class="atsb-fab-btn" title="ATS Builder">
        <span>ATS</span>
      </button>
      <div class="atsb-fab-menu" hidden>
        <button data-action="overlay">Recruiter view vs this JD</button>
        <button data-action="track">Track this application</button>
        <button data-action="open-app">Open ATS Builder</button>
      </div>
    `;
    document.body.appendChild(fab);

    const btn = fab.querySelector('.atsb-fab-btn');
    const menu = fab.querySelector('.atsb-fab-menu');
    btn.addEventListener('click', () => { menu.hidden = !menu.hidden; });
    menu.addEventListener('click', (e) => {
      const action = e.target?.dataset?.action;
      if (!action) return;
      menu.hidden = true;
      if (action === 'overlay') showRecruiterOverlay();
      else if (action === 'track') promptTrackApplication();
      else if (action === 'open-app') chrome.runtime.sendMessage({ type: 'OPEN_APP' });
    });
  }

  function hookApplyButtons() {
    // Generic heuristic: any button or anchor whose visible text matches
    // /apply/i. We attach in capture phase so we can prompt the user
    // BEFORE the click is handled by the host page. We don't preventDefault
    // unless the user opts in — opt-in is a separate UI affordance.
    document.addEventListener('click', (e) => {
      const el = e.target?.closest?.('a, button');
      if (!el) return;
      const label = (el.textContent || el.getAttribute('aria-label') || '').trim();
      if (!/^(apply|easy apply|submit application)\b/i.test(label)) return;
      // Async, non-blocking: offer the user a one-click "track this" toast.
      showTrackToast();
    }, true);
  }

  function detectJdText() {
    // Best-effort site-aware selectors with a fallback to the whole body.
    const host = location.hostname;
    const candidates = [];
    if (host.includes('linkedin.com')) candidates.push('.jobs-description__content', '[class*="jobs-description"]');
    if (host.includes('indeed.com')) candidates.push('#jobDescriptionText');
    if (host.includes('greenhouse.io')) candidates.push('#content');
    if (host.includes('lever.co')) candidates.push('.posting-page', '[data-qa="job-description"]');
    if (host.includes('workable.com')) candidates.push('.section--description', '[data-ui="job-description"]');
    if (host.includes('naukri.com')) candidates.push('.job-desc');
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim().length > 200) {
        return el.textContent.trim().slice(0, 16000);
      }
    }
    // Fallback: the largest text block on the page.
    const blocks = Array.from(document.querySelectorAll('article, section, div'))
      .map((el) => ({ el, len: (el.textContent || '').length }))
      .filter((x) => x.len > 400)
      .sort((a, b) => b.len - a.len);
    return blocks[0]?.el?.textContent?.trim().slice(0, 16000) || '';
  }

  function detectJobMeta() {
    // Try to grab company + role from common patterns. Failure is fine —
    // the user will see the prefilled fields and can correct them.
    const h1 = document.querySelector('h1')?.textContent?.trim() || '';
    const role = h1.slice(0, 200);
    const companyEl =
      document.querySelector('[data-test="job-company-name"]') ||
      document.querySelector('.jobs-unified-top-card__company-name') ||
      document.querySelector('[class*="company"][class*="name"]');
    const company = companyEl?.textContent?.trim().slice(0, 200) || '';
    return { role, company, url: location.href };
  }

  async function showRecruiterOverlay() {
    const jdText = detectJdText();
    if (!jdText) {
      atsbToast('No job description detected on this page.', 'error');
      return;
    }
    atsbToast('Loading recruiter view…');

    const resumesResp = await sendMessage({ type: 'LIST_RESUMES' });
    if (!resumesResp.ok || !Array.isArray(resumesResp.data) || resumesResp.data.length === 0) {
      atsbToast('No resumes found. Add one in the ATS Builder app first.', 'error');
      return;
    }
    const resume = resumesResp.data[0];
    const [matchResp, simResp] = await Promise.all([
      sendMessage({ type: 'JD_MATCH', resumeText: extractResumeText(resume), jdText }),
      sendMessage({ type: 'SIMULATE_ATS', resumeId: resume.id }),
    ]);

    renderOverlay({
      resumeTitle: resume.title || 'Resume',
      simulation: simResp.ok ? simResp.data : null,
      match: matchResp.ok ? matchResp.data : null,
    });
  }

  function extractResumeText(resume) {
    // The web app derives this elsewhere; here we synthesize a plain-text
    // approximation good enough for /ai/skill-gap.
    const parts = [];
    if (resume.contact?.fullName) parts.push(resume.contact.fullName);
    if (resume.contact?.email) parts.push(resume.contact.email);
    const s = resume.sections || {};
    if (s.summary) parts.push(s.summary);
    if (Array.isArray(resume.skills)) parts.push(resume.skills.join(', '));
    if (Array.isArray(s.experience)) {
      for (const exp of s.experience) {
        parts.push(`${exp.role || ''} at ${exp.company || ''} (${exp.startDate || ''} - ${exp.endDate || ''})`);
        if (Array.isArray(exp.highlights)) parts.push(...exp.highlights);
      }
    }
    if (Array.isArray(s.education)) {
      for (const e of s.education) parts.push(`${e.degree || ''} ${e.institution || ''}`);
    }
    return parts.filter(Boolean).join('\n');
  }

  function renderOverlay({ resumeTitle, simulation, match }) {
    closeOverlay();
    const root = document.createElement('div');
    root.className = 'atsb-overlay';
    root.innerHTML = `
      <div class="atsb-overlay-card">
        <header>
          <strong>Recruiter view · ${escapeHtml(resumeTitle)}</strong>
          <button class="atsb-close">×</button>
        </header>
        <div class="atsb-overlay-body">
          ${simulation ? `
            <section>
              <div class="atsb-confidence">ATS confidence: <strong>${simulation.confidence}/100</strong></div>
              <pre class="atsb-recruiter-view">${escapeHtml(simulation.recruiterView)}</pre>
            </section>
            <section>
              <h4>Top risks</h4>
              <ul>${simulation.risks.slice(0, 6).map((r) => `<li><span class="atsb-sev atsb-${r.severity}">${r.severity}</span> ${escapeHtml(r.detail)}</li>`).join('')}</ul>
            </section>` : '<p>Could not load simulation.</p>'}
          ${match ? `
            <section>
              <h4>Vs this JD</h4>
              <p class="atsb-jdmatch">${match.summary ? escapeHtml(match.summary) : 'See ATS Builder for full match.'}</p>
            </section>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(root);
    root.querySelector('.atsb-close').addEventListener('click', closeOverlay);
  }

  function closeOverlay() {
    document.querySelector('.atsb-overlay')?.remove();
  }

  async function promptTrackApplication() {
    const meta = detectJobMeta();
    const jdText = detectJdText();
    const resumesResp = await sendMessage({ type: 'LIST_RESUMES' });
    if (!resumesResp.ok) { atsbToast(resumesResp.error || 'Failed to load resumes.', 'error'); return; }
    const resumes = resumesResp.data || [];
    if (resumes.length === 0) { atsbToast('Add a resume in the ATS Builder app first.', 'error'); return; }

    closeOverlay();
    const root = document.createElement('div');
    root.className = 'atsb-overlay';
    root.innerHTML = `
      <div class="atsb-overlay-card atsb-track-card">
        <header>
          <strong>Track this application</strong>
          <button class="atsb-close">×</button>
        </header>
        <div class="atsb-overlay-body">
          <label>Company<input class="atsb-input" data-field="company" value="${escapeHtml(meta.company)}"></label>
          <label>Role<input class="atsb-input" data-field="role" value="${escapeHtml(meta.role)}"></label>
          <label>Resume<select class="atsb-input" data-field="resumeId">
            ${resumes.map((r) => `<option value="${r.id}">${escapeHtml(r.title || r.id.slice(0, 8))}</option>`).join('')}
          </select></label>
          <label>Version (optional)<select class="atsb-input" data-field="resumeVersionId"><option value="">(none)</option></select></label>
          <div class="atsb-actions">
            <button class="atsb-primary" data-action="save">Save application</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    root.querySelector('.atsb-close').addEventListener('click', closeOverlay);

    const resumeSelect = root.querySelector('[data-field="resumeId"]');
    const versionSelect = root.querySelector('[data-field="resumeVersionId"]');
    async function refreshVersions() {
      versionSelect.innerHTML = '<option value="">(none)</option>';
      const resp = await sendMessage({ type: 'LIST_VERSIONS', resumeId: resumeSelect.value });
      if (resp.ok && Array.isArray(resp.data)) {
        for (const v of resp.data) {
          const opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = v.label || new Date(v.createdAt).toISOString().slice(0, 10);
          versionSelect.appendChild(opt);
        }
      }
    }
    resumeSelect.addEventListener('change', refreshVersions);
    refreshVersions();

    root.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const payload = {
        company: root.querySelector('[data-field="company"]').value.trim(),
        role: root.querySelector('[data-field="role"]').value.trim(),
        jdUrl: meta.url,
        jdText: jdText || undefined,
        status: 'applied',
        appliedAt: new Date().toISOString(),
        resumeId: resumeSelect.value || undefined,
        resumeVersionId: versionSelect.value || undefined,
      };
      const resp = await sendMessage({ type: 'CREATE_APPLICATION', payload });
      if (resp.ok) {
        atsbToast('Tracked. The Outcome Loop will populate as responses come in.');
        closeOverlay();
      } else {
        atsbToast(resp.error || 'Failed to save.', 'error');
      }
    });
  }

  function showTrackToast() {
    if (document.querySelector('.atsb-apply-toast')) return;
    const t = document.createElement('div');
    t.className = 'atsb-apply-toast';
    t.innerHTML = `
      <span>Track this application in ATS Builder?</span>
      <button class="atsb-primary" data-action="yes">Yes</button>
      <button data-action="no">Not now</button>
    `;
    document.body.appendChild(t);
    t.addEventListener('click', (e) => {
      const action = e.target?.dataset?.action;
      if (action === 'yes') { t.remove(); promptTrackApplication(); }
      else if (action === 'no') { t.remove(); }
    });
    setTimeout(() => t.remove(), 12_000);
  }

  function atsbToast(text, kind = 'info') {
    const t = document.createElement('div');
    t.className = `atsb-toast atsb-toast-${kind}`;
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp || { ok: false, error: 'no response' });
          }
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || 'send failed' });
      }
    });
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
