// Taxonomie fermée des labels (décision D4). Les identifiants sont envoyés au LLM
// et stockés ; les noms et définitions servent au prompt et à l'interface.

export const CATEGORIES = ["sophism", "bias", "factual_claim"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface LabelDef {
  name: string;
  definition: string;
}

export const LABELS = {
  sophism: {
    ad_hominem: {
      name: "Attaque personnelle",
      definition: "Disqualifier un argument en s'en prenant à la personne qui le porte plutôt qu'à son contenu.",
    },
    homme_de_paille: {
      name: "Homme de paille",
      definition: "Déformer ou caricaturer la position adverse pour la réfuter plus facilement.",
    },
    faux_dilemme: {
      name: "Faux dilemme",
      definition: "Présenter deux options comme les seules possibles alors qu'il en existe d'autres.",
    },
    pente_glissante: {
      name: "Pente glissante",
      definition: "Affirmer qu'une mesure entraînera une chaîne de conséquences extrêmes sans justifier chaque étape.",
    },
    argument_autorite: {
      name: "Argument d'autorité",
      definition: "Tenir une affirmation pour vraie du seul fait du statut de qui l'énonce, hors de son domaine de compétence ou sans preuve.",
    },
    appel_popularite: {
      name: "Appel à la popularité",
      definition: "Tenir une affirmation pour vraie parce qu'un grand nombre de personnes y adhère.",
    },
    appel_emotion: {
      name: "Appel à l'émotion",
      definition: "Chercher l'adhésion par la peur, la pitié ou l'indignation plutôt que par des raisons.",
    },
    generalisation_hative: {
      name: "Généralisation hâtive",
      definition: "Tirer une conclusion générale d'un nombre de cas trop faible ou non représentatif.",
    },
    correlation_causalite: {
      name: "Corrélation prise pour causalité",
      definition: "Conclure qu'un phénomène en cause un autre parce qu'ils sont associés ou se succèdent.",
    },
    petition_de_principe: {
      name: "Pétition de principe",
      definition: "Supposer vraie, dans les prémisses, la conclusion que l'on prétend démontrer.",
    },
    diversion: {
      name: "Diversion",
      definition: "Détourner l'attention vers un sujet annexe pour éviter la question posée.",
    },
    tu_quoque: {
      name: "Tu quoque",
      definition: "Rejeter une critique en reprochant à son auteur de commettre la même faute.",
    },
    appel_nature: {
      name: "Appel à la nature",
      definition: "Juger une chose bonne ou mauvaise parce qu'elle serait naturelle ou non naturelle.",
    },
    appel_tradition: {
      name: "Appel à la tradition",
      definition: "Justifier une pratique par son ancienneté plutôt que par ses mérites.",
    },
    deplacement_objectif: {
      name: "Déplacement de l'objectif",
      definition: "Modifier les critères de preuve exigés une fois les premiers satisfaits.",
    },
    autre: { name: "Autre sophisme", definition: "Sophisme ne relevant d'aucun label ci-dessus ; le nommer dans la critique." },
  },
  bias: {
    cadrage: {
      name: "Cadrage orienté",
      definition: "Présenter un fait sous un angle qui oriente son interprétation (choix du point de vue, de l'ordre, de l'accent).",
    },
    selection_des_faits: {
      name: "Sélection des faits",
      definition: "Ne retenir que les éléments favorables à une thèse en écartant ceux qui la contredisent.",
    },
    langage_charge: {
      name: "Langage chargé",
      definition: "Employer des termes à forte connotation qui imposent un jugement sans l'argumenter.",
    },
    fausse_equivalence: {
      name: "Fausse équivalence",
      definition: "Mettre sur le même plan des positions ou des faits de poids très différents.",
    },
    omission_contexte: {
      name: "Omission de contexte",
      definition: "Taire une information nécessaire pour interpréter correctement un fait ou un chiffre.",
    },
    source_vague: {
      name: "Source vague ou anonyme",
      definition: "Appuyer une affirmation sur des sources non identifiables (« selon des experts », « on dit que »).",
    },
    presupposition: {
      name: "Présupposé",
      definition: "Faire passer une thèse discutable pour acquise en l'intégrant à la formulation.",
    },
    essentialisation: {
      name: "Essentialisation",
      definition: "Attribuer à tout un groupe un trait ou un comportement observé chez certains de ses membres.",
    },
    autre: { name: "Autre biais", definition: "Biais ne relevant d'aucun label ci-dessus ; le nommer dans la critique." },
  },
  factual_claim: {
    statistique: { name: "Statistique", definition: "Chiffre, pourcentage ou évolution présenté comme un fait." },
    citation_attribuee: { name: "Citation attribuée", definition: "Propos rapporté et attribué à une personne ou une institution." },
    fait_historique: { name: "Fait historique", definition: "Affirmation sur un événement ou une situation passée." },
    fait_scientifique: { name: "Fait scientifique", definition: "Affirmation présentée comme établie par la recherche." },
    comparaison: { name: "Comparaison", definition: "Comparaison chiffrée ou classement entre pays, périodes, groupes." },
    autre: { name: "Autre allégation", definition: "Allégation vérifiable ne relevant d'aucun label ci-dessus." },
  },
} as const satisfies Record<Category, Record<string, LabelDef>>;

export type LabelId<C extends Category = Category> = keyof (typeof LABELS)[C] & string;

export function isLabelOf(category: Category, label: string): boolean {
  return Object.hasOwn(LABELS[category], label);
}

export function labelDef(category: Category, label: string): LabelDef | undefined {
  return (LABELS[category] as Record<string, LabelDef>)[label];
}
