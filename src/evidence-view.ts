// Affichage du niveau de preuve d'une allégation scientifique (D16), commun au panneau
// et aux bulles : type d'étude, notice Crossref et signalements (prépublication,
// rétractation, avis de réserve), financeurs et déclarations d'intérêts (D17), cités
// tels quels et sans conclusion. Le lien doi.org n'est affiché que pour un DOI
// confirmé par Crossref.

import { doiUrl } from "./crossref";
import type { UiStrings } from "./i18n";
import type { Evidence } from "./schema";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Signalements à voir sans déplier la vérification : rétractation, avis de réserve, prépublication. */
export function renderStudyFlags(evidence: Evidence | undefined, t: UiStrings): HTMLElement[] {
  if (!evidence) return [];
  const flags: HTMLElement[] = [];
  const record = evidence.record;
  if (record?.retracted) flags.push(el("span", "study-flag retracted", t.studyRetracted));
  if (record?.concern) flags.push(el("span", "study-flag concern", t.studyConcern));
  if (record?.preprint || evidence.kind === "preprint") flags.push(el("span", "study-flag preprint", t.studyPreprint));
  return flags;
}

/** Niveau de preuve et notice de l'étude, ou null s'il n'y a rien à afficher. */
export function renderEvidence(evidence: Evidence | undefined, t: UiStrings): HTMLElement | null {
  if (!evidence) return null;
  const box = el("div", "evidence");
  box.append(el("span", "evidence-kind", `${t.evidenceLabel} ${t.evidenceKinds[evidence.kind]}`));
  const record = evidence.record;
  if (record) {
    const link = document.createElement("a");
    link.className = "evidence-record";
    link.href = doiUrl(record.doi);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = t.studyLinkTitle;
    const where = [record.journal, record.year].filter(Boolean).join(", ");
    link.textContent = [record.title, where].filter(Boolean).join(" — ") || record.doi;
    box.append(link);
    // D17 : ce qui a été déclaré, et seulement cela. Faute de déclaration trouvée, rien
    // n'est affirmé sur l'absence de conflit d'intérêts.
    if (record.funders?.length) box.append(el("span", "evidence-funders", `${t.fundersLabel} ${record.funders.join(", ")}`));
    if (record.disclosures?.length) {
      for (const d of record.disclosures) {
        box.append(el("span", "evidence-disclosure", `${t.disclosureLabel(d.source === "pubmed" ? "PubMed" : "Crossref")} ${clip(d.text)}`));
      }
    } else {
      box.append(el("span", "evidence-disclosure none", t.noDisclosure));
    }
  }
  return box;
}

const MAX_DISCLOSURE = 500;

function clip(s: string): string {
  return s.length > MAX_DISCLOSURE ? `${s.slice(0, MAX_DISCLOSURE).trimEnd()}…` : s;
}
