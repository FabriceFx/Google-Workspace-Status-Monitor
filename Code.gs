/**
 * @fileoverview Script de surveillance du tableau de bord Google Workspace Status.
 * Détecte les nouveaux incidents via flux Atom et notifie par email.
 * @author Fabrice Faucheux
 * @version 1.0.0
 */

// --- CONSTANTES DE CONFIGURATION ---

const URL_FLUX = "https://www.google.com/appsstatus/dashboard/fr/feed.atom";
const CLE_IDS_VUS = "STATUT_GOOGLE_IDS_VUS";
const LIMITE_HISTORIQUE = 50; // Nombre max d'IDs à conserver pour éviter de saturer les propriétés

/**
 * Fonction principale : Vérifie le flux RSS et notifie en cas de nouvel incident.
 * À lier à un déclencheur temporel (Time-driven trigger).
 */
function verifierStatutGoogleWorkspace() {
  try {
    // 1. Initialisation des services et récupération de l'historique
    const serviceProprietes = PropertiesService.getScriptProperties();
    const idsStockesJson = serviceProprietes.getProperty(CLE_IDS_VUS);
    
    // Utilisation d'un Set pour une complexité de recherche O(1)
    const ensembleIdsVus = idsStockesJson ? new Set(JSON.parse(idsStockesJson)) : new Set();
    
    // 2. Récupération et parsing du flux XML
    const reponse = UrlFetchApp.fetch(URL_FLUX);
    const documentXml = XmlService.parse(reponse.getContentText());
    const racine = documentXml.getRootElement();
    const nsAtom = XmlService.getNamespace("http://www.w3.org/2005/Atom");
    
    // Conversion de la liste Java en tableau JS natif pour utiliser les méthodes modernes
    const listeEntreesXml = racine.getChildren("entry", nsAtom);
    
    let nouveauxIncidentsDetectes = false;
    const nouveauxIds = [];

    // 3. Traitement des entrées
    // On inverse le tableau pour traiter du plus ancien au plus récent (ordre chronologique des emails)
    const entreesArray = [...listeEntreesXml].reverse();

    entreesArray.forEach(entree => {
      const idEntree = entree.getChild("id", nsAtom).getText();
      
      if (!ensembleIdsVus.has(idEntree)) {
        console.info(`Nouvel incident détecté : ${idEntree}`);
        nouveauxIncidentsDetectes = true;
        
        // Extraction des données avec déstructuration simulée via variables
        const detailsIncident = {
          titre: entree.getChild("title", nsAtom).getText(),
          lien: entree.getChild("link", nsAtom).getAttribute("href").getValue(),
          resumeHtml: entree.getChild("summary", nsAtom).getText()
        };
        
        // Envoi de la notification
        envoyerAlerteEmail(detailsIncident);
        
        // Mise à jour locale des listes
        nouveauxIds.push(idEntree);
        ensembleIdsVus.add(idEntree);
      }
    });

    // 4. Sauvegarde persistante (si nécessaire)
    if (nouveauxIncidentsDetectes) {
      mettreAJourHistorique(ensembleIdsVus, serviceProprietes);
    } else {
      console.info("R.A.S : Aucun nouvel incident sur le tableau de bord.");
    }

  } catch (erreur) {
    console.error(`Erreur critique dans verifierStatutGoogleWorkspace : ${erreur.message}`);
    // Optionnel : Notification d'erreur au développeur
  }
}

/**
 * Met à jour le stockage des propriétés en limitant la taille de l'historique.
 * @param {Set<string>} ensembleIdsVus - L'ensemble complet des IDs.
 * @param {PropertiesService.ScriptProperties} serviceProprietes - Le service de propriétés.
 */
function mettreAJourHistorique(ensembleIdsVus, serviceProprietes) {
  // Conversion Set -> Array
  let tableauIds = Array.from(ensembleIdsVus);
  
  // Optimisation : On ne garde que les X derniers éléments pour économiser l'espace de stockage
  if (tableauIds.length > LIMITE_HISTORIQUE) {
    tableauIds = tableauIds.slice(-LIMITE_HISTORIQUE);
  }
  
  serviceProprietes.setProperty(CLE_IDS_VUS, JSON.stringify(tableauIds));
  console.info(`Historique mis à jour. ${tableauIds.length} IDs conservés.`);
}

/**
 * Envoie une notification par email formattée en HTML.
 * @param {Object} details - Objet contenant les détails de l'incident.
 * @param {string} details.titre - Le titre de l'incident.
 * @param {string} details.lien - Le lien vers le dashboard.
 * @param {string} details.resumeHtml - Le résumé fourni par Google.
 */
function envoyerAlerteEmail({ titre, lien, resumeHtml }) {
  const destinataire = Session.getActiveUser().getEmail();
  const sujet = `🚨 Alerte Google Workspace : ${titre}`;
  
  // Utilisation des Template Literals pour le HTML
  const corpsHtml = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color: #d93025;">Nouvel incident détecté</h2>
      <h3 style="background-color: #f1f3f4; padding: 10px; border-radius: 4px;">${titre}</h3>
      
      <div style="border-left: 4px solid #d93025; padding-left: 15px; margin: 15px 0;">
        ${resumeHtml}
      </div>
      
      <p style="margin-top: 20px;">
        <a href="${lien}" style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
          Voir le tableau de bord
        </a>
      </p>
      <p style="font-size: 12px; color: #666; margin-top: 30px;">
        Généré par le script de surveillance automatique.
      </p>
    </div>
  `;
  
  MailApp.sendEmail({
    to: destinataire,
    subject: sujet,
    htmlBody: corpsHtml
  });
}
