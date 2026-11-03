// The line beside a card's Remove: what leans on the connection (/api/connectors/{id}/uses, dependents.py), said before the
// press (#238). One of a kind is named, several are counted; drafts and sources are only ever counted.
import { t } from "./i18n.js";
const WORDS = {
  workflow: ["workflow", "workflows"], report: ["report", "reports"], brain: ["", "AI brains"], card: ["card", "cards"],
  draft: ["reply draft waiting", "reply drafts waiting", true], rule: ["rule", "rules"], playbook: ["playbook", "playbooks"],
  source: ["source it reads", "sources it reads", true],
};

const one = (name, word, known) => !word || name.toLowerCase().endsWith(word)
  ? t("the {name}", { name }) : t("the {name} {word}", { name, word: known ? t(word) : word });

export function usedBy(rows) {
  const said = (rows || []).filter((r) => r?.names?.length).map(({ kind, names }) => {
    const [w1, wn, counted] = WORDS[kind] || [kind, `${kind}s`];
    const n = names.length;
    const word = n === 1 ? w1 || kind : wn;
    return n === 1 && !counted && names[0] ? one(names[0], w1, !!WORDS[kind]) : t("{count} {kind}", { count: n, kind: WORDS[kind] ? t(word) : word });
  });
  return said.length ? t("Used by: {items}", { items: said.join(", ") }) : "";
}
