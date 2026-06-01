"""Shared dataset schema for the resume parser.

Keep this file in lockstep with `jsonl-export.ts` on the API side —
any field added there must show up here, or the trainer will silently
drop it.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Split = Literal["train", "val", "test"]
SourceFormat = Literal["pdf", "docx", "image", "html", "txt"]


class Contact(BaseModel):
    fullName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    website: Optional[str] = None


class Experience(BaseModel):
    role: Optional[str] = None
    company: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    location: Optional[str] = None
    highlights: list[str] = Field(default_factory=list)


class Education(BaseModel):
    institution: Optional[str] = None
    degree: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


class Project(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    role: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    url: Optional[str] = None


class Certification(BaseModel):
    name: Optional[str] = None
    issuer: Optional[str] = None
    date: Optional[str] = None


class Labels(BaseModel):
    contact: Optional[Contact] = None
    summary: Optional[str] = None
    skills: list[str] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)


class Sample(BaseModel):
    id: str
    split: Split
    source_format: SourceFormat
    text: str
    labels: Optional[Labels] = None
    layout_hints: Optional[dict] = None


FIELD_KEYS = (
    "contact.fullName",
    "contact.email",
    "contact.phone",
    "contact.location",
    "summary",
    "skills",
    "experience.role",
    "experience.company",
    "experience.startDate",
    "experience.endDate",
    "experience.highlights",
    "education.institution",
    "education.degree",
    "projects.name",
    "certifications.name",
)
