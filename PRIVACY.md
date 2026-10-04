# Politique de confidentialité de Rhetorix

*Dernière mise à jour : 4 octobre 2026* · [English version below](#rhetorix-privacy-policy)

Rhetorix est une extension de navigateur qui repère, dans un article ou une vidéo YouTube, les sophismes, biais et allégations factuelles, à l'aide d'un modèle de langage (LLM) que vous choisissez. Rhetorix ne dispose d'aucun serveur : le développeur ne reçoit, ne collecte et ne conserve aucune de vos données.

## Données transmises, et à qui

Une analyse n'a lieu que lorsque vous la lancez. Rhetorix envoie alors directement, depuis votre navigateur, au fournisseur LLM que vous avez configuré :

- le titre et le texte de l'article de la page analysée, ou la transcription de la vidéo YouTube ;
- votre clé API, pour vous authentifier auprès de ce fournisseur ;
- les instructions d'analyse (langue de réponse, consignes).

L'adresse (URL) de la page n'est pas transmise au fournisseur.

Le fournisseur dépend de votre configuration :

- **Anthropic** (`api.anthropic.com`) ;
- **Google Gemini** (Google AI Studio) ;
- **un service compatible OpenAI** dont vous indiquez l'adresse, qui peut être un serveur tiers ou un modèle exécuté sur votre propre ordinateur ;
- **le modèle intégré à Chrome** (Gemini Nano) : l'analyse se fait alors entièrement sur votre appareil et rien n'est transmis.

Ce fournisseur est un tiers que vous choisissez, avec lequel vous avez votre propre compte. Le traitement de ces données relève de ses conditions d'utilisation et de sa politique de confidentialité, que nous vous invitons à consulter. Si vous activez la recherche web, c'est le fournisseur qui l'effectue avec ses propres outils.

Sur YouTube, Rhetorix récupère les sous-titres de la vidéo auprès de YouTube lui-même (`www.youtube.com`), comme le ferait la page YouTube que vous consultez. Ces sous-titres sont ensuite traités comme le texte d'un article.

## Données conservées sur votre appareil

Les données suivantes restent dans le stockage local de l'extension, sur votre appareil uniquement. Elles ne sont pas synchronisées entre vos appareils :

- vos réglages, dont votre clé API ;
- les résultats des analyses, associés à l'adresse de la page, pour éviter de refaire une analyse déjà faite ;
- un décompte des tokens consommés.

Vous pouvez vider le cache des analyses et remettre à zéro le décompte des tokens depuis les options. Désinstaller l'extension supprime toutes ces données.

## Ce que Rhetorix ne fait pas

- Aucune télémétrie, aucune statistique d'usage, aucun traceur publicitaire.
- Aucune vente ni aucun partage de données.
- Aucun envoi sans action de votre part : rien n'est transmis au fournisseur tant que vous n'avez pas lancé une analyse.

## Autorisations demandées

- **Accès à l'onglet actif et injection de scripts** : extraire le texte de la page et surligner les passages relevés.
- **Accès aux sites web** : joindre l'API du fournisseur LLM et les sous-titres YouTube.
- **Stockage** : conserver vos réglages et le cache décrit ci-dessus.

## Contact

Pour toute question ou demande, ouvrez un ticket : https://github.com/oliiivier/rhetorix/issues

---

# Rhetorix Privacy Policy

*Last updated: October 4, 2026*

Rhetorix is a browser extension that flags fallacies, biases and factual claims in an article or a YouTube video, using a large language model (LLM) of your choice. Rhetorix has no server: the developer does not receive, collect or keep any of your data.

## Data sent, and to whom

An analysis only runs when you start it. Rhetorix then sends, directly from your browser, to the LLM provider you configured:

- the title and text of the analysed article, or the transcript of the YouTube video;
- your API key, to authenticate with that provider;
- the analysis instructions (response language, guidelines).

The page address (URL) is not sent to the provider.

The provider depends on your settings:

- **Anthropic** (`api.anthropic.com`);
- **Google Gemini** (Google AI Studio);
- **an OpenAI-compatible service** at an address you specify, which may be a third-party server or a model running on your own computer;
- **Chrome's built-in model** (Gemini Nano): the analysis then runs entirely on your device and nothing is sent.

This provider is a third party you choose and hold your own account with. Its terms of service and privacy policy govern how it processes this data; please review them. If you enable web search, the provider performs it with its own tools.

On YouTube, Rhetorix fetches the video's captions from YouTube itself (`www.youtube.com`), just as the YouTube page you are viewing would. The captions are then handled like an article's text.

## Data kept on your device

The following data stays in the extension's local storage, on your device only. It is not synced across your devices:

- your settings, including your API key;
- analysis results, keyed by page address, so that an analysis is not repeated;
- a count of tokens used.

You can clear the analysis cache and reset the token count from the options page. Uninstalling the extension deletes all of this data.

## What Rhetorix does not do

- No telemetry, no usage statistics, no advertising trackers.
- No sale or sharing of data.
- Nothing is sent without your action: no data reaches the provider until you start an analysis.

## Permissions

- **Active tab and script injection**: extract the page text and highlight flagged passages.
- **Website access**: reach the LLM provider's API and YouTube captions.
- **Storage**: keep your settings and the cache described above.

## Contact

For any question or request, open an issue: https://github.com/oliiivier/rhetorix/issues
