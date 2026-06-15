import React from 'react';
import {
  cleanList,
  contactLine,
  fullNameOrTitle,
  normalizeTemplateResume,
  OrderedAtsSections,
  type TemplateProps,
} from './templateUtils';

export default function TechnicalCompact({ resumeData }: TemplateProps) {
  const normalized = normalizeTemplateResume(resumeData);
  const skills = cleanList(normalized.skills);
  const technicalSkills = cleanList(normalized.technicalSkills);
  const softSkills = cleanList(normalized.softSkills);

  const groupedSkills = [
    technicalSkills.length ? `Technical: ${technicalSkills.join(', ')}` : '',
    softSkills.length ? `Soft: ${softSkills.join(', ')}` : '',
    skills.length ? `General: ${skills.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  return (
    <article className="ats-template ats-template--technical">
      <header className="ats-template__header">
        <h1>{fullNameOrTitle(normalized)}</h1>
        {contactLine(normalized) ? <p>{contactLine(normalized)}</p> : null}
      </header>

      <OrderedAtsSections
        resumeData={normalized}
        options={{
          companyJoiner: ' @ ',
          tight: true,
          groupedSkillLine: groupedSkills || undefined,
          summaryPlaceholder: 'Add a concise technical summary.',
          skillsPlaceholder: 'Add technical and role-specific skills.',
        }}
      />
    </article>
  );
}
