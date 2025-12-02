# Google Workspace Status Monitor

![License MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Google%20Apps%20Script-green)
![Runtime](https://img.shields.io/badge/Google%20Apps%20Script-V8-green)
![Author](https://img.shields.io/badge/Auteur-Fabrice%20Faucheux-orange)

## Description
Ce projet est un script autonome conçu pour Google Apps Script. Il surveille le flux RSS officiel du tableau de bord "Google Workspace Status Dashboard". Lorsqu'un nouvel incident ou une mise à jour est détectée, le script envoie automatiquement une alerte email formatée à l'administrateur.

## Fonctionnalités Clés
* **Surveillance Active** : Parse le flux Atom XML de Google.
* **Détection Intelligente** : Compare les IDs des incidents avec un historique stocké pour éviter les doublons.
* **Optimisation V8** : Utilise `Set` pour la performance et nettoie l'historique (rotation des logs) pour respecter les quotas `PropertiesService`.
* **Alerting HTML** : Emails clairs incluant le résumé de l'incident et un lien direct.

## Installation Manuelle

1.  Ouvrez [Google Apps Script](https://script.google.com/).
2.  Créez un **Nouveau projet**.
3.  Copiez le contenu du fichier `Code.js` fourni dans l'éditeur.
4.  Sauvegardez le projet (Ctrl+S).
5.  Exécutez la fonction `verifierStatutGoogleWorkspace` une première fois manuellement pour accorder les permissions (MailApp, UrlFetchApp).

## Configuration du Déclencheur (Trigger)

Pour une surveillance continue :
1.  Cliquez sur l'icône **Déclencheurs** (l'horloge) dans le menu de gauche.
2.  Cliquez sur **Ajouter un déclencheur**.
3.  Configurez comme suit :
    * *Fonction à exécuter* : `verifierStatutGoogleWorkspace`
    * *Source de l'événement* : `D'après le temps` (Time-driven)
    * *Type de déclencheur* : `Minuteur` (Minutes timer)
    * *Intervalle* : `Toutes les 10 minutes` (ou selon vos besoins).
