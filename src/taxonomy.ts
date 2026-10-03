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

export const TAXONOMY_TRANSLATIONS: Record<
  "en" | "es" | "de" | "it",
  Record<Category, Record<string, LabelDef>>
> = {
  en: {
    sophism: {
      ad_hominem: {
        name: "Ad Hominem",
        definition: "Attacking the person making an argument rather than addressing the substance of the argument.",
      },
      homme_de_paille: {
        name: "Straw Man",
        definition: "Misrepresenting or exaggerating an opposing position to refute it more easily.",
      },
      faux_dilemme: {
        name: "False Dilemma",
        definition: "Presenting two options as the only possibilities when viable alternatives exist.",
      },
      pente_glissante: {
        name: "Slippery Slope",
        definition: "Asserting that a measure will inevitably lead to an extreme chain of events without justifying each step.",
      },
      argument_autorite: {
        name: "Appeal to Authority",
        definition: "Treating a claim as true merely because of who states it, without evidence or outside their expertise.",
      },
      appel_popularite: {
        name: "Bandwagon Fallacy",
        definition: "Asserting that a claim is true simply because many people believe or practice it.",
      },
      appel_emotion: {
        name: "Appeal to Emotion",
        definition: "Seeking agreement by stirring up fear, pity, or indignation rather than presenting sound reasons.",
      },
      generalisation_hative: {
        name: "Hasty Generalization",
        definition: "Drawing a broad conclusion from an insufficient or unrepresentative sample.",
      },
      correlation_causalite: {
        name: "False Cause / Post Hoc",
        definition: "Concluding that one event causes another simply because they occur together or in succession.",
      },
      petition_de_principe: {
        name: "Begging the Question",
        definition: "Assuming the truth of the conclusion within the premises meant to prove it.",
      },
      diversion: {
        name: "Red Herring",
        definition: "Diverting attention toward an irrelevant topic to avoid the real issue.",
      },
      tu_quoque: {
        name: "Tu Quoque",
        definition: "Deflecting criticism by accusing the opponent of committing the exact same error.",
      },
      appel_nature: {
        name: "Appeal to Nature",
        definition: "Claiming that something is good simply because it is natural, or bad because it is unnatural.",
      },
      appel_tradition: {
        name: "Appeal to Tradition",
        definition: "Justifying a belief or practice solely because it has been done for a long time.",
      },
      deplacement_objectif: {
        name: "Moving the Goalposts",
        definition: "Altering the required criteria of proof once the original ones have been satisfied.",
      },
      autre: {
        name: "Other Fallacy",
        definition: "Fallacy not matching any listed category; specified in the critique.",
      },
    },
    bias: {
      cadrage: {
        name: "Framing Bias",
        definition: "Presenting facts from a selective angle that biases interpretation.",
      },
      selection_des_faits: {
        name: "Cherry Picking",
        definition: "Selecting only evidence that supports a claim while ignoring contradicting facts.",
      },
      langage_charge: {
        name: "Loaded Language",
        definition: "Using strongly connoted words to bias judgement without argumentation.",
      },
      fausse_equivalence: {
        name: "False Equivalence",
        definition: "Equating two positions or facts that differ substantially in weight or validity.",
      },
      omission_contexte: {
        name: "Context Omission",
        definition: "Leaving out essential context needed to accurately understand a fact or figure.",
      },
      source_vague: {
        name: "Vague/Anonymous Source",
        definition: 'Grounding claims in unidentifiable sources ("experts say", "it is said").',
      },
      presupposition: {
        name: "Presupposition",
        definition: "Treating a debatable claim as an accepted fact through subtle phrasing.",
      },
      essentialisation: {
        name: "Essentialism",
        definition: "Attributing a general trait to an entire group based on observations of a few.",
      },
      autre: {
        name: "Other Bias",
        definition: "Bias not falling into the categories above; specified in the critique.",
      },
    },
    factual_claim: {
      statistique: {
        name: "Statistic",
        definition: "A figure, percentage, or trend presented as an objective fact.",
      },
      citation_attribuee: {
        name: "Attributed Quote",
        definition: "A statement attributed directly to a specific person or organization.",
      },
      fait_historique: {
        name: "Historical Fact",
        definition: "A claim about a past event or historical situation.",
      },
      fait_scientifique: {
        name: "Scientific Fact",
        definition: "A claim presented as an established scientific finding.",
      },
      comparaison: {
        name: "Comparison",
        definition: "A quantitative comparison or ranking between countries, eras, or groups.",
      },
      autre: {
        name: "Other Factual Claim",
        definition: "A checkable factual claim not covered by any category above.",
      },
    },
  },
  es: {
    sophism: {
      ad_hominem: {
        name: "Ataque personal",
        definition: "Descalificar un argumento atacando a la persona en lugar de refutar su contenido.",
      },
      homme_de_paille: {
        name: "Hombre de paja",
        definition: "Deformar o caricaturizar la postura contraria para refutarla con mayor facilidad.",
      },
      faux_dilemme: {
        name: "Falso dilema",
        definition: "Presentar dos opciones como las únicas posibles cuando existen alternativas.",
      },
      pente_glissante: {
        name: "Pendiente resbaladiza",
        definition: "Afirmar que una medida provocará consecuencias extremas sin justificar cada paso.",
      },
      argument_autorite: {
        name: "Argumento de autoridad",
        definition: "Dar por cierta una afirmación sólo por la autoridad de quien la dice, sin pruebas ni competencia.",
      },
      appel_popularite: {
        name: "Apelación a la multitud",
        definition: "Sostener que una afirmación es verdadera porque muchas personas la apoyan.",
      },
      appel_emotion: {
        name: "Apelación a la emoción",
        definition: "Buscar la adhesión mediante el miedo, la piedad o la indignación en lugar de razones.",
      },
      generalisation_hative: {
        name: "Generalización apresurada",
        definition: "Extraer una conclusión general a partir de un número de casos escaso o no representativo.",
      },
      correlation_causalite: {
        name: "Correlación tomada como causalidad",
        definition: "Concluir que un fenómeno causa otro solo porque coinciden o se suceden en el tiempo.",
      },
      petition_de_principe: {
        name: "Petición de principio",
        definition: "Dar por demostrada en las premisas la conclusión que se pretende probar.",
      },
      diversion: {
        name: "Cortina de humo",
        definition: "Desviar la atención hacia un tema secundario para eludir la cuestión principal.",
      },
      tu_quoque: {
        name: "Tú también",
        definition: "Rechazar una crítica reprochando al interlocutor cometer la misma falta.",
      },
      appel_nature: {
        name: "Apelación a la naturaleza",
        definition: "Juzgar algo como inherentemente bueno por ser natural, o malo por ser artificial.",
      },
      appel_tradition: {
        name: "Apelación a la tradición",
        definition: "Justificar una práctica exclusivamente por su antigüedad y no por sus méritos.",
      },
      deplacement_objectif: {
        name: "Mover los postes",
        definition: "Modificar las exigencias de prueba una vez satisfechas las condiciones iniciales.",
      },
      autre: {
        name: "Otra falacia",
        definition: "Falacia no recogida en la lista; descrita en la crítica.",
      },
    },
    bias: {
      cadrage: {
        name: "Sesgo de encuadre",
        definition: "Presentar los hechos desde una perspectiva que condiciona su interpretación.",
      },
      selection_des_faits: {
        name: "Selección sesgada",
        definition: "Elegir únicamente datos favorables a una tesis descartando los contrarios.",
      },
      langage_charge: {
        name: "Lenguaje cargado",
        definition: "Emplear palabras connotadas que imponen un juicio sin argumentación previa.",
      },
      fausse_equivalence: {
        name: "Falsa equivalencia",
        definition: "Poner al mismo nivel dos hechos o posturas de relevancia muy desigual.",
      },
      omission_contexte: {
        name: "Omisión de contexto",
        definition: "Omitir datos esenciales para interpretar correctamente un hecho o cifra.",
      },
      source_vague: {
        name: "Fuente vaga o anónima",
        definition: 'Respaldar afirmaciones en fuentes indeterminadas («según expertos», «se dice que»).',
      },
      presupposition: {
        name: "Presuposición",
        definition: "Dar por demostrada una afirmación discutible mediante su formulación.",
      },
      essentialisation: {
        name: "Esencialización",
        definition: "Atribuir a todo un colectivo un rasgo observado solo en algunos miembros.",
      },
      autre: {
        name: "Otro sesgo",
        definition: "Sesgo fuera de la lista; descrito en la crítica.",
      },
    },
    factual_claim: {
      statistique: {
        name: "Estadística",
        definition: "Cifra, porcentaje o evolución presentada como dato factual.",
      },
      citation_attribuee: {
        name: "Cita atribuida",
        definition: "Declaración atribuida a una persona o institución.",
      },
      fait_historique: {
        name: "Hecho histórico",
        definition: "Afirmación sobre un acontecimiento o contexto histórico pasado.",
      },
      fait_scientifique: {
        name: "Hecho científico",
        definition: "Afirmación presentada como respaldada por la investigación científica.",
      },
      comparaison: {
        name: "Comparación",
        definition: "Comparación cuantitativa o clasificación entre países, periodos o grupos.",
      },
      autre: {
        name: "Otra afirmación",
        definition: "Afirmación factual verificable no cubierta por las opciones anteriores.",
      },
    },
  },
  de: {
    sophism: {
      ad_hominem: {
        name: "Persönlicher Angriff",
        definition: "Ein Argument abwerten, indem man die Person angreift, anstatt auf den Inhalt einzugehen.",
      },
      homme_de_paille: {
        name: "Strohmann-Argument",
        definition: "Die Gegenposition verzerren oder übertreiben, um sie leichter widerlegen zu können.",
      },
      faux_dilemme: {
        name: "Falsches Dilemma",
        definition: "Zwei Optionen als einzige Alternativen darstellen, obwohl Alternativen existieren.",
      },
      pente_glissante: {
        name: "Dammbruchargument",
        definition: "Behaupten, eine Maßnahme führe unausweichlich zu einer Kette extremer Folgen ohne Beleg.",
      },
      argument_autorite: {
        name: "Autoritätsargument",
        definition: "Eine Aussage nur aufgrund des Status der Person als wahr ansehen, ohne Belege.",
      },
      appel_popularite: {
        name: "Berufung auf die Masse",
        definition: "Eine Aussage für wahr erklären, weil eine Mehrheit daran glaubt.",
      },
      appel_emotion: {
        name: "Gefühlsappell",
        definition: "Zustimmung durch Angst, Mitleid oder Empörung statt durch Gründe suchen.",
      },
      generalisation_hative: {
        name: "Voreilige Verallgemeinerung",
        definition: "Aus unzureichenden oder unrepräsentativen Fällen eine allgemeine Folgerung ziehen.",
      },
      correlation_causalite: {
        name: "Scheinkausalität",
        definition: "Auf Kausalität schließen, nur weil zwei Phänomene gemeinsam oder nacheinander auftreten.",
      },
      petition_de_principe: {
        name: "Zirkelschluss",
        definition: "Die zu beweisende Behauptung bereits in den Prämissen als wahr voraussetzen.",
      },
      diversion: {
        name: "Ablenkungsmanöver",
        definition: "Die Aufmerksamkeit auf ein Nebenthema lenken, um der Kernfrage auszuweichen.",
      },
      tu_quoque: {
        name: "Tu-quoque-Vorwurf",
        definition: "Kritik abweisen, indem man dem Kritiker denselben Fehler vorwirft.",
      },
      appel_nature: {
        name: "Appell an die Natur",
        definition: "Etwas als gut oder schlecht werten, bloß weil es als natürlich oder künstlich gilt.",
      },
      appel_tradition: {
        name: "Berufung auf Tradition",
        definition: "Eine Praxis allein wegen ihres Alters oder Herkommens rechtfertigen.",
      },
      deplacement_objectif: {
        name: "Zielverschiebung",
        definition: "Beweisanforderungen nachträglich ändern, sobald die ursprünglichen erfüllt wurden.",
      },
      autre: {
        name: "Anderer Fehlschluss",
        definition: "Fehlschluss außerhalb der obigen Liste; wird in der Kritik benannt.",
      },
    },
    bias: {
      cadrage: {
        name: "Framing-Effekt",
        definition: "Fakten aus einem Blickwinkel darstellen, der die Deutung gezielt lenkt.",
      },
      selection_des_faits: {
        name: "Rosinenpicken",
        definition: "Nur genehme Fakten anführen und widersprechende Tatsachen verschweigen.",
      },
      langage_charge: {
        name: "Suggestivsprache",
        definition: "Stark wertende Wörter verwenden, um ein Urteil ohne Begründung nahezulegen.",
      },
      fausse_equivalence: {
        name: "Falsche Äquivalenz",
        definition: "Positionen oder Fakten von völlig ungleichem Gewicht gleichsetzen.",
      },
      omission_contexte: {
        name: "Kontextauslassung",
        definition: "Wesensnotwendige Informationen verschweigen, um ein verzerrtes Bild zu erzeugen.",
      },
      source_vague: {
        name: "Vage Quelle",
        definition: 'Behauptungen auf nicht identifizierbare Quellen stützen („Experten sagen“).',
      },
      presupposition: {
        name: "Präsupposition",
        definition: "Eine strittige Annahme als selbstverständlich in die Formulierung einbetten.",
      },
      essentialisation: {
        name: "Essentialisierung",
        definition: "Einer ganzen Gruppe Merkmale zuschreiben, die nur bei Einzelnen beobachtet wurden.",
      },
      autre: {
        name: "Andere Verzerrung",
        definition: "Verzerrung außerhalb der obigen Liste; wird in der Kritik benannt.",
      },
    },
    factual_claim: {
      statistique: {
        name: "Statistik",
        definition: "Eine Zahl, Quote oder Entwicklung, die als Tatsache dargestellt wird.",
      },
      citation_attribuee: {
        name: "Zugeschriebenes Zitat",
        definition: "Eine Aussage, die einer Person oder Institution zugeschrieben wird.",
      },
      fait_historique: {
        name: "Historische Tatsache",
        definition: "Eine Behauptung über ein historisches Ereignis oder eine Epoche.",
      },
      fait_scientifique: {
        name: "Wissenschaftliche Tatsache",
        definition: "Eine Aussage, die als wissenschaftlich gesichert dargestellt wird.",
      },
      comparaison: {
        name: "Vergleich",
        definition: "Ein messbarer Vergleich oder Ranking zwischen Ländern, Zeiträumen oder Gruppen.",
      },
      autre: {
        name: "Andere Faktenbehauptung",
        definition: "Eine überprüfbare Faktenaussage außerhalb der obigen Kategorien.",
      },
    },
  },
  it: {
    sophism: {
      ad_hominem: {
        name: "Attacco personale",
        definition: "Squalificare un argomento attaccando la persona anziché contestarne il merito.",
      },
      homme_de_paille: {
        name: "Uomo di paglia",
        definition: "Distorcere o ridicolizzare la posizione avversaria per confutarla più facilmente.",
      },
      faux_dilemme: {
        name: "Falso dilemma",
        definition: "Presentare due opzioni come le sole possibili quando esistono altre alternative.",
      },
      pente_glissante: {
        name: "China scivolosa",
        definition: "Sostenere che una misura causerà inevitabilmente conseguenze estreme senza dimostrarlo.",
      },
      argument_autorite: {
        name: "Appello all'autorità",
        definition: "Ritenere vera un'affermazione solo per il prestigio di chi la pronuncia, senza prove.",
      },
      appel_popularite: {
        name: "Appello alla popolarità",
        definition: "Considerare vera un'affermazione solo perché molte persone la condividono.",
      },
      appel_emotion: {
        name: "Appello all'emozione",
        definition: "Cercare consenso facendo leva su paura, pietà o indignazione anziché su ragioni.",
      },
      generalisation_hative: {
        name: "Generalizzazione indebita",
        definition: "Trarre una conclusione generale da un campione insufficiente o non rappresentativo.",
      },
      correlation_causalite: {
        name: "Correlazione spuria",
        definition: "Concludere che un evento causa l'altro solo perché si verificano insieme.",
      },
      petition_de_principe: {
        name: "Petizione di principio",
        definition: "Dare per scontata nelle premesse la conclusione che si intende dimostrare.",
      },
      diversion: {
        name: "Depistaggio",
        definition: "Deviare l'attenzione su un argomento secondario per evitare la questione principale.",
      },
      tu_quoque: {
        name: "Tu quoque",
        definition: "Respingere una critica accusando chi la esprime di commettere lo stesso errore.",
      },
      appel_nature: {
        name: "Appello alla natura",
        definition: "Giudicare qualcosa positivo solo perché naturale, o negativo perché artificiale.",
      },
      appel_tradition: {
        name: "Appello alla tradizione",
        definition: "Giustificare una pratica per la sua antichità anziché per la sua effettiva validità.",
      },
      deplacement_objectif: {
        name: "Spostamento dei paletti",
        definition: "Modificare i criteri di prova richiesti una volta soddisfatti quelli iniziali.",
      },
      autre: {
        name: "Altra fallacia",
        definition: "Fallacia non compresa nell'elenco; specificata nella spiegazione.",
      },
    },
    bias: {
      cadrage: {
        name: "Effetto framing",
        definition: "Presentare i fatti da una prospettiva che ne orienta l'interpretazione.",
      },
      selection_des_faits: {
        name: "Cherry picking",
        definition: "Selezionare solo i dati a favore di una tesi ignorando quelli contrari.",
      },
      langage_charge: {
        name: "Linguaggio tendenzioso",
        definition: "Usare termini a forte connotazione che impongono un giudizio senza argomentarlo.",
      },
      fausse_equivalence: {
        name: "Falsa equivalenza",
        definition: "Mettere sullo stesso piano posizioni o fatti di peso e validità profondamente diversi.",
      },
      omission_contexte: {
        name: "Omissione di contesto",
        definition: "Tacere informazioni indispensabili per comprendere correttamente un fatto o dato.",
      },
      source_vague: {
        name: "Fonte vaga o anonima",
        definition: 'Basare un\'affermazione su fonti non identificabili («secondo gli esperti»).',
      },
      presupposition: {
        name: "Presupposizione",
        definition: "Far passare una tesi discutibile per scontata inserendola nella formulazione.",
      },
      essentialisation: {
        name: "Essenzializzazione",
        definition: "Attribuire all'intero gruppo una caratteristica osservata solo in alcuni individui.",
      },
      autre: {
        name: "Altro bias",
        definition: "Bias non compreso nelle categorie precedenti; descritto nella critica.",
      },
    },
    factual_claim: {
      statistique: {
        name: "Dato statistico",
        definition: "Dato numerico, percentuale o tendenza presentata come fatto oggettivo.",
      },
      citation_attribuee: {
        name: "Citazione attribuita",
        definition: "Dichiarazione attribuita direttamente a una persona o istituzione.",
      },
      fait_historique: {
        name: "Fatto storico",
        definition: "Affermazione su un avvenimento o contesto storico passato.",
      },
      fait_scientifique: {
        name: "Fatto scientifico",
        definition: "Affermazione presentata come dimostrata dalla ricerca scientifica.",
      },
      comparaison: {
        name: "Confronto",
        definition: "Comparazione quantitativa o graduatoria tra paesi, epoche o categorie.",
      },
      autre: {
        name: "Altra affermazione",
        definition: "Affermazione verificabile che non rientra nelle categorie precedenti.",
      },
    },
  },
};

export function isLabelOf(category: Category, label: string): boolean {
  return Object.hasOwn(LABELS[category], label);
}

export function labelDef(category: Category, label: string, lang: string = "fr"): LabelDef | undefined {
  const normLang = lang.slice(0, 2).toLowerCase();
  if (normLang !== "fr" && normLang in TAXONOMY_TRANSLATIONS) {
    const translation = TAXONOMY_TRANSLATIONS[normLang as keyof typeof TAXONOMY_TRANSLATIONS]?.[category]?.[label];
    if (translation) return translation;
  }
  return (LABELS[category] as Record<string, LabelDef>)[label];
}
